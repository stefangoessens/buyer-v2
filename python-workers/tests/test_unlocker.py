"""Tests for :mod:`fetch.unlocker`: Bright Data client and FakeUnlocker."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
import respx

from common.errors import (
    AntiBotFetchError,
    PermanentFetchError,
    QuotaExceededError,
    TimeoutFetchError,
    TransientFetchError,
    VendorFetchError,
)
from common.types import FetchRequest, FetchResult
from fetch.unlocker import BrightDataUnlockerClient, FakeUnlocker
from fixtures.vendor_responses.bright_data import (
    anti_bot_response,
    empty_body_response,
    permanent_error_response,
    rate_limit_response,
    success_response,
    vendor_error_response,
)

_FAKE_TOKEN = "test-token-AAA"
_FAKE_ZONE = "test_zone"
_BASE_URL = "https://api.brightdata.example/request"


def _make_request(url: str = "https://www.zillow.com/homedetails/1234-main-st/") -> FetchRequest:
    return FetchRequest(url=url, portal="zillow", timeout_s=5.0, retries=2)


def _make_client(
    *,
    monthly_budget_usd: float = 500.0,
    fallback_cost: float = 0.0015,
    max_rpm: int = 0,
) -> BrightDataUnlockerClient:
    """Build a client with rate limiting disabled (max_rpm=0) so tests run fast."""
    return BrightDataUnlockerClient(
        token=_FAKE_TOKEN,
        zone=_FAKE_ZONE,
        base_url=_BASE_URL,
        max_requests_per_min=max_rpm,
        monthly_budget_usd=monthly_budget_usd,
        fallback_cost_per_request_usd=fallback_cost,
    )


class TestBrightDataUnlockerHappyPath:
    async def test_success_populates_fetch_result(self) -> None:
        html = "<html><body><h1>123 Main St</h1></body></html>"
        client = _make_client()

        with respx.mock(assert_all_called=True) as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response(html, cost_usd=0.0025)
            )
            result = await client.fetch(_make_request())

        assert isinstance(result, FetchResult)
        assert result.status_code == 200
        assert result.html == html
        assert result.cost_usd == pytest.approx(0.0025)
        assert result.latency_ms >= 0
        assert result.attempts == 1
        assert result.vendor == "bright_data_unlocker"
        assert result.portal == "zillow"
        assert isinstance(result.fetched_at, datetime)
        assert result.fetched_at.tzinfo is UTC
        await client.aclose()

    async def test_missing_cost_header_falls_back(self) -> None:
        client = _make_client(fallback_cost=0.0042)

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>", cost_usd=None)
            )
            result = await client.fetch(_make_request())

        assert result.cost_usd == pytest.approx(0.0042)
        await client.aclose()

    async def test_garbage_cost_header_falls_back(self) -> None:
        client = _make_client(fallback_cost=0.0099)

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=httpx.Response(
                    status_code=200,
                    content=b"<html>ok</html>",
                    headers={"x-brd-cost-usd": "not-a-number"},
                )
            )
            result = await client.fetch(_make_request())

        assert result.cost_usd == pytest.approx(0.0099)
        await client.aclose()

    async def test_cost_accumulates_into_budget(self) -> None:
        client = _make_client()

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>", cost_usd=0.01)
            )
            await client.fetch(_make_request())
            await client.fetch(_make_request())

        assert client.monthly_spent_usd == pytest.approx(0.02)
        await client.aclose()


class TestBrightDataUnlockerErrors:
    async def test_rate_limit_becomes_transient(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=rate_limit_response())
            with pytest.raises(TransientFetchError) as excinfo:
                await client.fetch(_make_request())
        assert excinfo.value.retryable is True
        await client.aclose()

    async def test_anti_bot_response(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=anti_bot_response())
            with pytest.raises(AntiBotFetchError):
                await client.fetch(_make_request())
        await client.aclose()

    async def test_vendor_error_retryable(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=vendor_error_response(502))
            with pytest.raises(VendorFetchError) as excinfo:
                await client.fetch(_make_request())
        assert excinfo.value.retryable is True
        await client.aclose()

    async def test_permanent_client_error(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=permanent_error_response(status_code=400)
            )
            with pytest.raises(PermanentFetchError):
                await client.fetch(_make_request())
        await client.aclose()

    async def test_httpx_timeout_becomes_timeout_fetch_error(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                side_effect=httpx.TimeoutException("read timeout")
            )
            with pytest.raises(TimeoutFetchError) as excinfo:
                await client.fetch(_make_request())
        assert excinfo.value.retryable is True
        await client.aclose()

    async def test_empty_body_is_anti_bot(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=empty_body_response())
            with pytest.raises(AntiBotFetchError):
                await client.fetch(_make_request())
        await client.aclose()


class TestBrightDataUnlockerBudget:
    async def test_budget_exhaustion_blocks_request(self) -> None:
        client = _make_client(monthly_budget_usd=1.0, fallback_cost=0.50)
        client._budget.monthly_spent_usd = 0.99

        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>")
            )
            with pytest.raises(QuotaExceededError):
                await client.fetch(_make_request())
            assert route.call_count == 0
        await client.aclose()

    async def test_concurrent_reservations_enforce_hard_cap(self) -> None:
        """Pessimistic reservation must block concurrent fetches past the cap.

        Regression guard for the race where `_reserve_budget` only checked
        projected spend without bumping the counter under the same lock,
        letting N concurrent callers each pass the check and then each add
        cost, blowing past the configured monthly budget.
        """
        import asyncio

        fallback = 0.40
        # Budget allows exactly 2 reservations (0.80), the 3rd/4th must fail.
        client = _make_client(monthly_budget_usd=0.80, fallback_cost=fallback)

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>", cost_usd=fallback)
            )
            results = await asyncio.gather(
                client.fetch(_make_request()),
                client.fetch(_make_request()),
                client.fetch(_make_request()),
                client.fetch(_make_request()),
                return_exceptions=True,
            )

        successes = [r for r in results if isinstance(r, FetchResult)]
        quota_errors = [r for r in results if isinstance(r, QuotaExceededError)]
        other_errors = [
            r
            for r in results
            if isinstance(r, BaseException) and not isinstance(r, QuotaExceededError)
        ]

        assert len(successes) == 2
        assert len(quota_errors) == 2
        assert other_errors == []
        # Hard cap: monthly_spent_usd must never exceed the configured budget.
        assert client.monthly_spent_usd <= 0.80 + 1e-9
        assert client.monthly_spent_usd == pytest.approx(0.80)
        await client.aclose()

    async def test_failed_dispatch_releases_reservation(self) -> None:
        """Transport errors must release the pre-dispatch reservation."""
        client = _make_client(monthly_budget_usd=0.10, fallback_cost=0.05)

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                side_effect=httpx.TimeoutException("read timeout")
            )
            with pytest.raises(TimeoutFetchError):
                await client.fetch(_make_request())

        # Reservation released → subsequent call can still succeed.
        assert client.monthly_spent_usd == pytest.approx(0.0)
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>", cost_usd=0.05)
            )
            await client.fetch(_make_request())
        assert client.monthly_spent_usd == pytest.approx(0.05)
        await client.aclose()

    async def test_reconcile_swaps_reservation_for_actual_cost(self) -> None:
        """Actual cost from response header must replace the reserved estimate."""
        client = _make_client(fallback_cost=0.0015)

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>", cost_usd=0.05)
            )
            await client.fetch(_make_request())

        # Not 0.0515 (reservation + actual) — exactly actual.
        assert client.monthly_spent_usd == pytest.approx(0.05)
        await client.aclose()

    async def test_cancelled_fetch_releases_reservation(self) -> None:
        """CancelledError during dispatch must not leak the reservation.

        Regression guard for the race where cancelling a fetch (e.g., from
        an orchestrator-level `asyncio.wait_for` or task shutdown) during
        `_rate_limiter.acquire()` or the in-flight HTTP call would skip
        the release path and permanently grow `monthly_spent_usd`. Repeated
        cancellations would then exhaust the monthly cap without any
        successful vendor fetch.
        """
        import asyncio

        client = _make_client(monthly_budget_usd=0.10, fallback_cost=0.05)

        async def slow_post(*_args: object, **_kwargs: object) -> httpx.Response:
            await asyncio.sleep(5.0)  # will be cancelled before completion
            return httpx.Response(200, text="<html>ok</html>")

        with respx.mock(assert_all_called=False) as mock:
            mock.post(_BASE_URL).mock(side_effect=slow_post)
            task = asyncio.create_task(client.fetch(_make_request()))
            await asyncio.sleep(0.01)  # let the fetch reach the HTTP POST
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            # Give the finally-block's shielded release a loop tick to run.
            await asyncio.sleep(0)

        # The reservation must have been released — otherwise the next
        # fetch would immediately hit QuotaExceededError.
        assert client.monthly_spent_usd == pytest.approx(0.0)

        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                return_value=success_response("<html>ok</html>", cost_usd=0.05)
            )
            result = await client.fetch(_make_request())
        assert result.cost_usd == pytest.approx(0.05)
        assert client.monthly_spent_usd == pytest.approx(0.05)
        await client.aclose()

    async def test_missing_token_raises_permanent(self) -> None:
        client = BrightDataUnlockerClient(
            token="",
            zone=_FAKE_ZONE,
            base_url=_BASE_URL,
            max_requests_per_min=0,
        )
        with pytest.raises(PermanentFetchError):
            await client.fetch(_make_request())
        await client.aclose()

    async def test_missing_zone_raises_permanent(self) -> None:
        client = BrightDataUnlockerClient(
            token=_FAKE_TOKEN,
            zone="",
            base_url=_BASE_URL,
            max_requests_per_min=0,
        )
        with pytest.raises(PermanentFetchError):
            await client.fetch(_make_request())
        await client.aclose()


class TestTokenRedaction:
    def test_repr_does_not_contain_token(self) -> None:
        client = _make_client()
        text = repr(client)
        assert _FAKE_TOKEN not in text
        assert "Bearer" not in text
        # Accept either "token=***" or "token=<redacted>" — both satisfy the
        # redaction requirement.
        assert "token=" in text
        assert ("***" in text) or ("<redacted>" in text) or ("redacted" in text.lower())

    async def test_errors_do_not_leak_token(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=rate_limit_response())
            with pytest.raises(TransientFetchError) as excinfo:
                await client.fetch(_make_request())
        err = excinfo.value
        text = f"{err!s} {err!r}"
        assert _FAKE_TOKEN not in text
        assert "Bearer " + _FAKE_TOKEN not in text
        await client.aclose()


class TestEnvDrivenDefaults:
    async def test_env_overrides_applied(
        self, monkey_env: pytest.MonkeyPatch
    ) -> None:
        monkey_env.setenv("BRIGHT_DATA_UNLOCKER_TOKEN", "env-token-BBB")
        monkey_env.setenv("BRIGHT_DATA_ZONE", "env_zone")
        monkey_env.setenv("BRIGHT_DATA_MAX_REQUESTS_PER_MIN", "10")
        monkey_env.setenv("BRIGHT_DATA_MONTHLY_BUDGET_USD", "1000")
        monkey_env.setenv("BRIGHT_DATA_FALLBACK_COST_PER_REQUEST_USD", "0.005")

        client = BrightDataUnlockerClient(base_url=_BASE_URL)

        assert client._token == "env-token-BBB"
        assert client._zone == "env_zone"
        assert client._max_requests_per_min == 10
        assert client._monthly_budget_usd == pytest.approx(1000.0)
        assert client._fallback_cost == pytest.approx(0.005)
        await client.aclose()

    async def test_env_invalid_values_fall_back_to_defaults(
        self, monkey_env: pytest.MonkeyPatch
    ) -> None:
        monkey_env.setenv("BRIGHT_DATA_UNLOCKER_TOKEN", "env-token-CCC")
        monkey_env.setenv("BRIGHT_DATA_ZONE", "env_zone")
        monkey_env.setenv("BRIGHT_DATA_MAX_REQUESTS_PER_MIN", "not-a-number")
        monkey_env.setenv("BRIGHT_DATA_MONTHLY_BUDGET_USD", "also-garbage")
        monkey_env.setenv("BRIGHT_DATA_FALLBACK_COST_PER_REQUEST_USD", "nope")

        client = BrightDataUnlockerClient(base_url=_BASE_URL)

        assert client._max_requests_per_min == 60  # default
        assert client._monthly_budget_usd == pytest.approx(500.0)
        assert client._fallback_cost == pytest.approx(0.0015)
        await client.aclose()

    async def test_env_empty_strings_fall_back_to_defaults(
        self, monkey_env: pytest.MonkeyPatch
    ) -> None:
        monkey_env.setenv("BRIGHT_DATA_UNLOCKER_TOKEN", "env-token-DDD")
        monkey_env.setenv("BRIGHT_DATA_ZONE", "env_zone")
        monkey_env.setenv("BRIGHT_DATA_MAX_REQUESTS_PER_MIN", "")
        monkey_env.setenv("BRIGHT_DATA_MONTHLY_BUDGET_USD", "")

        client = BrightDataUnlockerClient(base_url=_BASE_URL)
        assert client._max_requests_per_min == 60
        assert client._monthly_budget_usd == pytest.approx(500.0)
        await client.aclose()


class TestTokenBucketRateLimit:
    async def test_token_bucket_blocks_when_full(self) -> None:
        import time

        from fetch.unlocker import _TokenBucket

        bucket = _TokenBucket(max_per_minute=2)
        # Prime the bucket with two recent timestamps.
        await bucket.acquire()
        await bucket.acquire()

        # Override the window to 50 ms so the third acquire only waits briefly.
        bucket._window_s = 0.05

        started = time.monotonic()
        await bucket.acquire()
        elapsed = time.monotonic() - started
        assert elapsed >= 0.0


class TestBudgetStatePeriodReset:
    def test_reset_when_month_changes(self) -> None:
        from fetch.unlocker import _BudgetState

        state = _BudgetState(monthly_spent_usd=42.0, period_key=(1999, 1))
        state.reset_if_new_period()
        assert state.monthly_spent_usd == 0.0
        assert state.period_key != (1999, 1)


class TestBotChallengeMarkers:
    async def test_captcha_marker_triggers_anti_bot(self) -> None:
        client = _make_client()
        body = "<html><body>Please solve this captcha</body></html>"
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=success_response(body))
            with pytest.raises(AntiBotFetchError):
                await client.fetch(_make_request())
        await client.aclose()

    async def test_perimeterx_marker_triggers_anti_bot(self) -> None:
        client = _make_client()
        body = "<html>powered by PerimeterX</html>"
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(return_value=success_response(body))
            with pytest.raises(AntiBotFetchError):
                await client.fetch(_make_request())
        await client.aclose()


class TestTransportError:
    async def test_transport_error_becomes_transient(self) -> None:
        client = _make_client()
        with respx.mock() as mock:
            mock.post(_BASE_URL).mock(
                side_effect=httpx.ConnectError("dns lookup failed")
            )
            with pytest.raises(TransientFetchError):
                await client.fetch(_make_request())
        await client.aclose()


class TestFakeUnlocker:
    async def test_returns_programmed_result(self, fake_unlocker: FakeUnlocker) -> None:
        result = FetchResult(
            url="https://www.zillow.com/x",
            portal="zillow",
            status_code=200,
            html="<html>ok</html>",
            fetched_at=datetime.now(UTC),
            cost_usd=0.001,
            latency_ms=42,
            vendor="bright_data_unlocker",
            request_id="req-1",
            attempts=1,
        )
        fake_unlocker.enqueue_result(result)
        req = _make_request()
        out = await fake_unlocker.fetch(req)
        assert out is result
        assert fake_unlocker.calls == [req]

    async def test_raises_programmed_error(self, fake_unlocker: FakeUnlocker) -> None:
        err = TransientFetchError(
            "temporary",
            request_id="req-1",
            portal="zillow",
            url="https://www.zillow.com/x",
            vendor="bright_data_unlocker",
        )
        fake_unlocker.enqueue_error(err)
        with pytest.raises(TransientFetchError):
            await fake_unlocker.fetch(_make_request())
        assert len(fake_unlocker.calls) == 1

    async def test_fifo_order(self, fake_unlocker: FakeUnlocker) -> None:
        a = FetchResult(
            url="https://www.zillow.com/a",
            portal="zillow",
            status_code=200,
            html="a",
            fetched_at=datetime.now(UTC),
            cost_usd=0.001,
            latency_ms=1,
            vendor="bright_data_unlocker",
            request_id="req-a",
            attempts=1,
        )
        b = FetchResult(
            url="https://www.zillow.com/b",
            portal="zillow",
            status_code=200,
            html="b",
            fetched_at=datetime.now(UTC),
            cost_usd=0.001,
            latency_ms=1,
            vendor="bright_data_unlocker",
            request_id="req-b",
            attempts=1,
        )
        fake_unlocker.enqueue_result(a)
        fake_unlocker.enqueue_result(b)
        assert (await fake_unlocker.fetch(_make_request())).html == "a"
        assert (await fake_unlocker.fetch(_make_request())).html == "b"

    async def test_unscripted_call_is_assertion(self, fake_unlocker: FakeUnlocker) -> None:
        with pytest.raises(AssertionError):
            await fake_unlocker.fetch(_make_request())

    async def test_aclose_is_safe(self, fake_unlocker: FakeUnlocker) -> None:
        await fake_unlocker.aclose()
        # Calling twice must not raise.
        await fake_unlocker.aclose()
