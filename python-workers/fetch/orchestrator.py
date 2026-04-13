"""Fetch orchestrator: retries, concurrency, metrics, and stats rollup."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from common.errors import (
    FetchError,
    TimeoutFetchError,
)
from common.types import FetchResult
from fetch.metrics import NullMetricsSink

if TYPE_CHECKING:
    from collections.abc import Sequence

    from common.types import FetchRequest
    from fetch.metrics import MetricsSink
    from fetch.unlocker import BrightDataUnlockerClient, FakeUnlocker

_DEFAULT_MAX_CONCURRENT = 4
_ORCHESTRATOR_VENDOR = "orchestrator"
logger = logging.getLogger("buyer_v2.fetch.orchestrator")


def _is_retryable(exc: BaseException) -> bool:
    """Retry any ``FetchError`` whose ``retryable`` flag is True.

    This covers ``TransientFetchError``/``TimeoutFetchError``/``AntiBotFetchError``
    (retryable=True on the class) and ``VendorFetchError(retryable=True)``, while
    still bailing out immediately on ``PermanentFetchError`` / ``QuotaExceededError``.
    """

    return isinstance(exc, FetchError) and exc.retryable


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(slots=True)
class _OrchestratorStats:
    fetch_count: int = 0
    error_count: int = 0
    total_cost_usd: float = 0.0
    total_latency_ms: int = 0
    attempts: int = 0


class FetchOrchestrator:
    """Wraps an unlocker client with retry, concurrency, and metrics.

    Retries are scoped per-request (``request.retries + 1`` total attempts)
    so a caller that wants a one-shot fetch can pass ``retries=0``. Metrics
    are recorded once per top-level fetch — retried attempts update the
    ``attempts`` counter on the :class:`FetchResult` rather than spamming
    the sink with partial successes.
    """

    def __init__(
        self,
        *,
        client: BrightDataUnlockerClient | FakeUnlocker,
        metrics: MetricsSink | None = None,
        max_concurrent: int | None = None,
    ) -> None:
        self._client = client
        self._metrics: MetricsSink = metrics or NullMetricsSink()
        resolved_concurrent = (
            max_concurrent
            if max_concurrent is not None
            else _env_int("BRIGHT_DATA_MAX_CONCURRENT", _DEFAULT_MAX_CONCURRENT)
        )
        self._max_concurrent = max(1, resolved_concurrent)
        self._semaphore = asyncio.Semaphore(self._max_concurrent)
        self._stats = _OrchestratorStats()

    @property
    def stats(self) -> dict[str, Any]:
        return {
            "fetch_count": self._stats.fetch_count,
            "error_count": self._stats.error_count,
            "total_cost_usd": self._stats.total_cost_usd,
            "total_latency_ms": self._stats.total_latency_ms,
            "attempts": self._stats.attempts,
        }

    @property
    def max_concurrent(self) -> int:
        return self._max_concurrent

    async def fetch(self, request: FetchRequest) -> FetchResult:
        async with self._semaphore:
            attempt_count = 0
            try:
                async for attempt in AsyncRetrying(
                    retry=retry_if_exception(_is_retryable),
                    stop=stop_after_attempt(request.retries + 1),
                    wait=wait_exponential(multiplier=0.5, min=0.5, max=10),
                    reraise=True,
                ):
                    with attempt:
                        attempt_count += 1
                        try:
                            result = await asyncio.wait_for(
                                self._client.fetch(request),
                                timeout=request.timeout_s,
                            )
                        except TimeoutError as exc:
                            raise TimeoutFetchError(
                                f"Fetch exceeded {request.timeout_s}s timeout",
                                request_id=request.request_id,
                                portal=request.portal,
                                url=request.url,
                                vendor=_ORCHESTRATOR_VENDOR,
                            ) from exc
            except RetryError as retry_err:
                inner = retry_err.last_attempt.exception() if retry_err.last_attempt else None
                err: FetchError
                if isinstance(inner, FetchError):
                    err = inner
                else:
                    raise
                self._record_error(request, err, attempt_count)
                raise err from retry_err
            except FetchError as err:
                self._record_error(request, err, attempt_count)
                raise

        final = FetchResult(
            url=result.url,
            portal=result.portal,
            status_code=result.status_code,
            html=result.html,
            fetched_at=result.fetched_at,
            cost_usd=result.cost_usd,
            latency_ms=result.latency_ms,
            vendor=result.vendor,
            request_id=result.request_id,
            attempts=attempt_count,
            headers=result.headers,
        )
        self._record_success(request, final)
        return final

    async def fetch_batch(
        self, requests: Sequence[FetchRequest]
    ) -> list[FetchResult | FetchError]:
        async def _run(req: FetchRequest) -> FetchResult | FetchError:
            try:
                return await self.fetch(req)
            except FetchError as err:
                return err

        tasks = [asyncio.create_task(_run(r)) for r in requests]
        return await asyncio.gather(*tasks)

    def _record_success(self, request: FetchRequest, result: FetchResult) -> None:
        self._stats.fetch_count += 1
        self._stats.total_cost_usd += result.cost_usd
        self._stats.total_latency_ms += result.latency_ms
        self._stats.attempts += result.attempts
        self._metrics.record_fetch(request=request, result=result, error=None)

    def _record_error(
        self, request: FetchRequest, error: FetchError, attempts: int
    ) -> None:
        self._stats.error_count += 1
        self._stats.attempts += attempts
        logger.error(
            "worker_fetch_failed %s",
            json.dumps(
                {
                    "request_id": error.request_id,
                    "portal": error.portal,
                    "vendor": error.vendor,
                    "retryable": error.retryable,
                    "attempts": attempts,
                    "error_type": type(error).__name__,
                    "message": str(error),
                },
                sort_keys=True,
            ),
        )
        self._metrics.record_fetch(request=request, result=None, error=error)
