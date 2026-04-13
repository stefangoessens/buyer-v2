"""Factories for mocking Bright Data Web Unlocker API responses in tests.

Each helper returns an ``httpx.Response`` shaped like a real Bright Data API
response, including the ``x-brd-cost-usd`` / ``x-brd-request-id`` headers the
unlocker client parses. Tests compose them with ``respx``:

    import respx
    from fixtures.vendor_responses.bright_data import success_response

    @respx.mock
    async def test_happy_path():
        respx.post("https://api.brightdata.com/request").mock(
            return_value=success_response("<html>...</html>")
        )
        ...
"""

from __future__ import annotations

import httpx

DEFAULT_COST_USD = 0.0015
DEFAULT_REQUEST_ID = "brd-req-test-0001"


def _headers(cost_usd: float | None = DEFAULT_COST_USD) -> dict[str, str]:
    headers = {"x-brd-request-id": DEFAULT_REQUEST_ID}
    if cost_usd is not None:
        headers["x-brd-cost-usd"] = f"{cost_usd:.6f}"
    return headers


def success_response(
    html: str,
    *,
    cost_usd: float | None = DEFAULT_COST_USD,
    status_code: int = 200,
) -> httpx.Response:
    """Return a 200 response carrying ``html`` and the cost header.

    Pass ``cost_usd=None`` to omit ``x-brd-cost-usd`` entirely — used to verify
    the client falls back to ``fallback_cost_per_request_usd``.
    """
    return httpx.Response(
        status_code=status_code,
        content=html.encode("utf-8"),
        headers=_headers(cost_usd),
    )


def empty_body_response(*, cost_usd: float | None = DEFAULT_COST_USD) -> httpx.Response:
    """Return a 200 response with an empty body — the client treats this as anti-bot."""
    return httpx.Response(
        status_code=200,
        content=b"",
        headers=_headers(cost_usd),
    )


def rate_limit_response() -> httpx.Response:
    """Return a 429 rate-limit response (transient)."""
    return httpx.Response(
        status_code=429,
        content=b'{"error": "rate limited"}',
        headers={"x-brd-request-id": DEFAULT_REQUEST_ID},
    )


def anti_bot_response() -> httpx.Response:
    """Return a 403 anti-bot response."""
    return httpx.Response(
        status_code=403,
        content=b'{"error": "blocked"}',
        headers={"x-brd-request-id": DEFAULT_REQUEST_ID},
    )


def vendor_error_response(status_code: int = 502) -> httpx.Response:
    """Return a 5xx vendor error (transient)."""
    return httpx.Response(
        status_code=status_code,
        content=b'{"error": "bad gateway"}',
        headers={"x-brd-request-id": DEFAULT_REQUEST_ID},
    )


def permanent_error_response(status_code: int = 400) -> httpx.Response:
    """Return a 4xx permanent error (not retryable)."""
    return httpx.Response(
        status_code=status_code,
        content=b'{"error": "bad request"}',
        headers={"x-brd-request-id": DEFAULT_REQUEST_ID},
    )
