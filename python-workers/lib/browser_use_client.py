"""Browser Use Cloud client wrapper.

Thin wrapper around Browser Use Cloud's public REST API
(https://browser-use.com/api). Used by crawler cards (KIN-1072 PAPA,
KIN-1073 permits) and any future scrape that needs residential proxy
rotation. Works in pure-stub mode for unit tests — the constructor
accepts an optional injected httpx.Client so the tests can mock the
HTTP layer without hitting the real API.

The wrapper is intentionally minimal: it exposes ``create_run`` and
``get_result`` against the Cloud API. Crawl card authors compose their
flows on top.

Environment variables:
  BROWSER_USE_API_KEY — required at runtime. The wrapper does NOT
    raise at import time — callers must check `is_configured()` and
    decide whether to fail or fall back to a local Playwright path.
  BROWSER_USE_BASE_URL — optional. Defaults to https://api.browser-use.com.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx


DEFAULT_BASE_URL = "https://api.browser-use.com"


class BrowserUseError(Exception):
    """Wraps any Cloud API error with the original status + body."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        body: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


@dataclass(frozen=True, slots=True)
class BrowserUseRun:
    """Lightweight handle returned by create_run."""

    run_id: str
    status: str  # "queued" | "running" | "success" | "failed" | "cancelled"
    started_at: str | None
    finished_at: str | None


@dataclass(frozen=True, slots=True)
class BrowserUseResult:
    """Final result payload from a completed run."""

    run_id: str
    status: str
    output: dict[str, Any]
    cost_usd: float | None
    duration_ms: int | None
    proxy_country: str | None


def is_configured() -> bool:
    """Return True if BROWSER_USE_API_KEY is set in the environment.

    Crawl modules should gate Cloud calls behind this — when missing,
    fall back to a local Playwright path or return a typed empty result
    so the worker never raises at import time.
    """
    return bool(os.environ.get("BROWSER_USE_API_KEY"))


class BrowserUseClient:
    """Thin REST wrapper around Browser Use Cloud."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        client: httpx.Client | None = None,
        timeout_s: float = 30.0,
        residential_proxy: bool = True,
    ) -> None:
        self._api_key = api_key or os.environ.get("BROWSER_USE_API_KEY")
        self._base_url = (
            base_url
            or os.environ.get("BROWSER_USE_BASE_URL")
            or DEFAULT_BASE_URL
        ).rstrip("/")
        self._client = client or httpx.Client(timeout=timeout_s)
        self._residential_proxy = residential_proxy

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            raise BrowserUseError("BROWSER_USE_API_KEY is not set")
        # Browser Use Cloud's REST API expects the key in
        # `X-Browser-Use-API-Key`, not the standard Authorization header.
        # Codex flagged the previous Bearer scheme as a real-world
        # auth failure waiting to happen.
        return {
            "X-Browser-Use-API-Key": self._api_key,
            "Content-Type": "application/json",
        }

    def create_run(
        self,
        *,
        task: str,
        allowed_domains: list[str] | None = None,
        max_steps: int = 25,
    ) -> BrowserUseRun:
        """Start a new Cloud run."""
        payload: dict[str, Any] = {
            "task": task,
            "max_steps": max_steps,
            "use_residential_proxy": self._residential_proxy,
        }
        if allowed_domains:
            payload["allowed_domains"] = allowed_domains
        headers = self._headers()
        try:
            response = self._client.post(
                f"{self._base_url}/api/v2/tasks",
                json=payload,
                headers=headers,
            )
        except httpx.HTTPError as exc:
            raise BrowserUseError(
                f"Browser Use Cloud request failed: {exc}"
            ) from exc
        if response.status_code >= 400:
            raise BrowserUseError(
                f"Browser Use Cloud returned {response.status_code}",
                status_code=response.status_code,
                body=response.text[:500],
            )
        body = response.json()
        return BrowserUseRun(
            run_id=str(body.get("id") or body.get("run_id") or ""),
            status=str(body.get("status") or "queued"),
            started_at=body.get("started_at"),
            finished_at=body.get("finished_at"),
        )

    def get_result(self, run_id: str) -> BrowserUseResult:
        """Fetch the final result of a completed run."""
        headers = self._headers()
        try:
            response = self._client.get(
                f"{self._base_url}/api/v2/tasks/{run_id}",
                headers=headers,
            )
        except httpx.HTTPError as exc:
            raise BrowserUseError(
                f"Browser Use Cloud request failed: {exc}"
            ) from exc
        if response.status_code >= 400:
            raise BrowserUseError(
                f"Browser Use Cloud returned {response.status_code}",
                status_code=response.status_code,
                body=response.text[:500],
            )
        body = response.json()
        return BrowserUseResult(
            run_id=str(body.get("id") or body.get("run_id") or run_id),
            status=str(body.get("status") or "unknown"),
            output=body.get("output") or {},
            cost_usd=body.get("cost_usd"),
            duration_ms=body.get("duration_ms"),
            proxy_country=body.get("proxy_country"),
        )
