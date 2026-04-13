"""Bright Data Web Unlocker client with rate limiting, budget guards, and a test fake.

The production client (``BrightDataUnlockerClient``) never logs, reprs, or
stringifies the API token. Tests should use :class:`FakeUnlocker` instead of
monkey-patching the real client so the retry/orchestration layer can be
exercised deterministically without network I/O.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

from common.errors import (
    AntiBotFetchError,
    FetchError,
    PermanentFetchError,
    QuotaExceededError,
    TimeoutFetchError,
    TransientFetchError,
    VendorFetchError,
)
from common.types import FetchRequest, FetchResult

_VENDOR = "bright_data_unlocker"

_DEFAULT_BASE_URL = "https://api.brightdata.com/request"
_DEFAULT_MAX_RPM = 60
_DEFAULT_MONTHLY_BUDGET = 500.0
_DEFAULT_FALLBACK_COST = 0.0015

_BOT_CHALLENGE_MARKERS = (
    "captcha",
    "px-captcha",
    "perimeterx",
    "access denied",
    "unusual traffic",
)


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(slots=True)
class _BudgetState:
    """Per-instance monthly budget accounting.

    Counters reset when the (UTC year, month) tuple changes; callers hold the
    single instance-level lock while mutating.
    """

    monthly_spent_usd: float = 0.0
    period_key: tuple[int, int] = field(default_factory=lambda: (_now_utc().year, _now_utc().month))

    def reset_if_new_period(self) -> None:
        now = _now_utc()
        key = (now.year, now.month)
        if key != self.period_key:
            self.period_key = key
            self.monthly_spent_usd = 0.0


class _TokenBucket:
    """Simple monotonic token bucket enforcing ``max_per_minute`` requests."""

    def __init__(self, max_per_minute: int) -> None:
        self._max = max_per_minute
        self._window_s = 60.0
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        if self._max <= 0:
            return
        while True:
            async with self._lock:
                now = time.monotonic()
                cutoff = now - self._window_s
                while self._timestamps and self._timestamps[0] < cutoff:
                    self._timestamps.popleft()
                if len(self._timestamps) < self._max:
                    self._timestamps.append(now)
                    return
                earliest = self._timestamps[0]
                wait = max(0.0, earliest + self._window_s - now)
            if wait > 0:
                await asyncio.sleep(wait)


class BrightDataUnlockerClient:
    """Async client for Bright Data's Web Unlocker endpoint.

    The client is responsible for:

    * sending the request and mapping transport/HTTP failures to typed errors
    * enforcing a per-minute token-bucket rate limit
    * enforcing a per-instance monthly USD budget before dispatch
    * extracting cost from response headers (``x-brd-cost-usd``), with a
      configurable fallback when the header is absent
    * never leaking the bearer token via ``repr`` or error messages
    """

    def __init__(
        self,
        *,
        token: str | None = None,
        zone: str | None = None,
        base_url: str = _DEFAULT_BASE_URL,
        http_client: httpx.AsyncClient | None = None,
        max_requests_per_min: int | None = None,
        monthly_budget_usd: float | None = None,
        fallback_cost_per_request_usd: float | None = None,
    ) -> None:
        self._token = (
            token
            if token is not None
            else os.environ.get("BRIGHT_DATA_UNLOCKER_TOKEN", "")
        )
        self._zone = zone if zone is not None else os.environ.get("BRIGHT_DATA_ZONE", "")
        self._base_url = base_url
        self._owns_client = http_client is None
        self._http_client = http_client
        self._max_requests_per_min = (
            max_requests_per_min
            if max_requests_per_min is not None
            else _env_int("BRIGHT_DATA_MAX_REQUESTS_PER_MIN", _DEFAULT_MAX_RPM)
        )
        self._monthly_budget_usd = (
            monthly_budget_usd
            if monthly_budget_usd is not None
            else _env_float("BRIGHT_DATA_MONTHLY_BUDGET_USD", _DEFAULT_MONTHLY_BUDGET)
        )
        self._fallback_cost = (
            fallback_cost_per_request_usd
            if fallback_cost_per_request_usd is not None
            else _env_float(
                "BRIGHT_DATA_FALLBACK_COST_PER_REQUEST_USD",
                _DEFAULT_FALLBACK_COST,
            )
        )
        self._rate_limiter = _TokenBucket(self._max_requests_per_min)
        self._budget = _BudgetState()
        self._budget_lock = asyncio.Lock()

    def __repr__(self) -> str:
        return (
            f"BrightDataUnlockerClient("
            f"zone={self._zone!r}, "
            f"base_url={self._base_url!r}, "
            f"max_requests_per_min={self._max_requests_per_min!r}, "
            f"monthly_budget_usd={self._monthly_budget_usd!r}, "
            f"token=<redacted>)"
        )

    @property
    def monthly_spent_usd(self) -> float:
        return self._budget.monthly_spent_usd

    def observability_snapshot(self) -> dict[str, Any]:
        return {
            "vendor": _VENDOR,
            "configured": {
                "token_configured": bool(self._token),
                "zone_configured": bool(self._zone),
            },
            "limits": {
                "max_requests_per_minute": self._max_requests_per_min,
                "monthly_budget_usd": self._monthly_budget_usd,
                "fallback_cost_per_request_usd": self._fallback_cost,
            },
            "usage": {
                "monthly_spent_usd": self.monthly_spent_usd,
            },
        }

    async def aclose(self) -> None:
        if self._owns_client and self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient()
        return self._http_client

    async def _reserve_budget(self, request: FetchRequest) -> float:
        """Pessimistically reserve the fallback cost before dispatch.

        Returns the reserved amount, which must be passed to
        :meth:`_reconcile_cost` (on success) or :meth:`_release_reserved`
        (on failure) so the budget counter stays consistent. Reserving
        inside the lock guarantees that N concurrent callers near the
        cap cannot all observe the same ``projected`` and dispatch.
        """
        reserved = self._fallback_cost
        async with self._budget_lock:
            self._budget.reset_if_new_period()
            projected = self._budget.monthly_spent_usd + reserved
            if projected > self._monthly_budget_usd:
                raise QuotaExceededError(
                    "Monthly Bright Data budget exhausted",
                    request_id=request.request_id,
                    portal=request.portal,
                    url=request.url,
                    vendor=_VENDOR,
                )
            self._budget.monthly_spent_usd += reserved
        return reserved

    async def _reconcile_cost(self, reserved: float, actual: float) -> None:
        """Swap a prior reservation for the observed cost, inside the lock."""
        async with self._budget_lock:
            self._budget.reset_if_new_period()
            delta = actual - reserved
            self._budget.monthly_spent_usd += delta
            if self._budget.monthly_spent_usd < 0:
                self._budget.monthly_spent_usd = 0.0

    async def _release_reserved(self, reserved: float) -> None:
        """Release a prior reservation, e.g. when dispatch fails."""
        async with self._budget_lock:
            self._budget.reset_if_new_period()
            self._budget.monthly_spent_usd -= reserved
            if self._budget.monthly_spent_usd < 0:
                self._budget.monthly_spent_usd = 0.0

    async def fetch(self, request: FetchRequest) -> FetchResult:
        if not self._token:
            raise PermanentFetchError(
                "BRIGHT_DATA_UNLOCKER_TOKEN not configured",
                request_id=request.request_id,
                portal=request.portal,
                url=request.url,
                vendor=_VENDOR,
            )
        if not self._zone:
            raise PermanentFetchError(
                "BRIGHT_DATA_ZONE not configured",
                request_id=request.request_id,
                portal=request.portal,
                url=request.url,
                vendor=_VENDOR,
            )

        reserved = await self._reserve_budget(request)
        # Track whether the reservation has been swapped for the real cost.
        # If the coroutine raises OR is cancelled (CancelledError propagates
        # through `finally`) before we reconcile, the finally-block releases
        # the reservation so repeated cancellations cannot exhaust the cap.
        reconciled = False
        try:
            await self._rate_limiter.acquire()

            payload: dict[str, Any] = {
                "zone": self._zone,
                "url": request.url,
                "format": "raw",
                "country": "us",
                "method": "GET",
            }
            headers = {
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            }

            client = await self._get_http_client()
            started = time.monotonic()
            try:
                response = await client.post(
                    self._base_url,
                    json=payload,
                    headers=headers,
                    timeout=request.timeout_s,
                )
            except httpx.TimeoutException as exc:
                raise TimeoutFetchError(
                    f"Bright Data request timed out after {request.timeout_s}s",
                    request_id=request.request_id,
                    portal=request.portal,
                    url=request.url,
                    vendor=_VENDOR,
                ) from exc
            except httpx.TransportError as exc:
                raise TransientFetchError(
                    f"Bright Data transport error: {type(exc).__name__}",
                    request_id=request.request_id,
                    portal=request.portal,
                    url=request.url,
                    vendor=_VENDOR,
                ) from exc

            latency_ms = int((time.monotonic() - started) * 1000)
            cost_usd = self._extract_cost(response.headers)
            await self._reconcile_cost(reserved, cost_usd)
            reconciled = True

            self._raise_for_status(request, response)

            body = response.text or ""
            if self._looks_like_bot_challenge(body):
                raise AntiBotFetchError(
                    "Bright Data response looks like a bot challenge",
                    request_id=request.request_id,
                    portal=request.portal,
                    url=request.url,
                    vendor=_VENDOR,
                )
        finally:
            if not reconciled:
                # Shield the release from the outer cancellation so the
                # counter is actually decremented even when the task is
                # being torn down. Any `CancelledError` raised by the
                # shielded await is intentionally suppressed — the
                # outer exception is already propagating out of finally.
                with contextlib.suppress(asyncio.CancelledError):
                    await asyncio.shield(self._release_reserved(reserved))

        return FetchResult(
            url=request.url,
            portal=request.portal,
            status_code=response.status_code,
            html=body,
            fetched_at=_now_utc(),
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            vendor=_VENDOR,
            request_id=request.request_id,
            attempts=1,
            headers={k.lower(): v for k, v in response.headers.items()},
        )

    def _extract_cost(self, headers: httpx.Headers) -> float:
        raw = headers.get("x-brd-cost-usd")
        if raw is None:
            return self._fallback_cost
        try:
            return float(raw)
        except ValueError:
            return self._fallback_cost

    @staticmethod
    def _looks_like_bot_challenge(body: str) -> bool:
        if not body.strip():
            return True
        lowered = body[:4096].lower()
        return any(marker in lowered for marker in _BOT_CHALLENGE_MARKERS)

    @staticmethod
    def _raise_for_status(request: FetchRequest, response: httpx.Response) -> None:
        status = response.status_code
        if status < 400:
            return
        if status == 403:
            raise AntiBotFetchError(
                f"Bright Data returned HTTP 403 for {request.url}",
                request_id=request.request_id,
                portal=request.portal,
                url=request.url,
                vendor=_VENDOR,
            )
        if status == 429:
            raise TransientFetchError(
                "Bright Data returned HTTP 429 (rate limited)",
                request_id=request.request_id,
                portal=request.portal,
                url=request.url,
                vendor=_VENDOR,
            )
        if 500 <= status < 600:
            raise VendorFetchError(
                f"Bright Data returned HTTP {status}",
                request_id=request.request_id,
                portal=request.portal,
                url=request.url,
                vendor=_VENDOR,
                retryable=True,
            )
        raise PermanentFetchError(
            f"Bright Data returned HTTP {status}",
            request_id=request.request_id,
            portal=request.portal,
            url=request.url,
            vendor=_VENDOR,
        )


@dataclass(slots=True)
class _ProgrammedResponse:
    """One entry in the FakeUnlocker script: either a result or an error to raise."""

    result: FetchResult | None = None
    error: FetchError | None = None


class FakeUnlocker:
    """In-memory fake for deterministic tests of the orchestration layer.

    Queue pre-programmed ``FetchResult`` or ``FetchError`` instances with
    :meth:`enqueue_result` / :meth:`enqueue_error`. Each call to :meth:`fetch`
    pops the next entry in FIFO order.
    """

    def __init__(self) -> None:
        self._queue: deque[_ProgrammedResponse] = deque()
        self.calls: list[FetchRequest] = []

    def enqueue_result(self, result: FetchResult) -> None:
        self._queue.append(_ProgrammedResponse(result=result))

    def enqueue_error(self, error: FetchError) -> None:
        self._queue.append(_ProgrammedResponse(error=error))

    async def fetch(self, request: FetchRequest) -> FetchResult:
        self.calls.append(request)
        if not self._queue:
            raise AssertionError(
                "FakeUnlocker received an unexpected fetch call — nothing programmed"
            )
        programmed = self._queue.popleft()
        if programmed.error is not None:
            raise programmed.error
        assert programmed.result is not None
        return programmed.result

    async def aclose(self) -> None:
        return None
