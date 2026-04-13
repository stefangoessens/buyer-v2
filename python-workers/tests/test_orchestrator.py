"""Tests for :class:`fetch.orchestrator.FetchOrchestrator`.

These exercise retry / timeout / concurrency / batch behaviour using a
``FakeUnlocker`` (or a local subclass where we need custom hooks) so no real
network I/O is performed.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from common.errors import (
    FetchError,
    PermanentFetchError,
    QuotaExceededError,
    TimeoutFetchError,
    TransientFetchError,
)
from common.types import FetchRequest, FetchResult
from fetch.metrics import InMemoryMetricsSink
from fetch.orchestrator import FetchOrchestrator
from fetch.unlocker import FakeUnlocker


def _success(
    url: str = "https://www.zillow.com/homedetails/1234-main-st/",
) -> FetchResult:
    return FetchResult(
        url=url,
        portal="zillow",
        status_code=200,
        html="<html>ok</html>",
        fetched_at=datetime.now(UTC),
        cost_usd=0.0015,
        latency_ms=100,
        vendor="bright_data_unlocker",
        request_id="req-fixture",
        attempts=1,
    )


def _request(
    url: str = "https://www.zillow.com/homedetails/1234-main-st/",
    *,
    timeout_s: float = 5.0,
    retries: int = 3,
) -> FetchRequest:
    return FetchRequest(url=url, portal="zillow", timeout_s=timeout_s, retries=retries)


def _transient_error() -> TransientFetchError:
    return TransientFetchError(
        "temporary",
        request_id="req-fixture",
        portal="zillow",
        url="https://www.zillow.com/homedetails/1234-main-st/",
        vendor="bright_data_unlocker",
    )


def _permanent_error() -> PermanentFetchError:
    return PermanentFetchError(
        "nope",
        request_id="req-fixture",
        portal="zillow",
        url="https://www.zillow.com/homedetails/1234-main-st/",
        vendor="bright_data_unlocker",
    )


def _quota_error() -> QuotaExceededError:
    return QuotaExceededError(
        "budget",
        request_id="req-fixture",
        portal="zillow",
        url="https://www.zillow.com/homedetails/1234-main-st/",
        vendor="bright_data_unlocker",
    )


class TestOrchestratorSuccessPath:
    async def test_passthrough_on_success(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_result(_success())
        metrics = InMemoryMetricsSink()
        orch = FetchOrchestrator(client=fake, metrics=metrics, max_concurrent=4)

        result = await orch.fetch(_request(retries=0))

        assert result.status_code == 200
        assert result.html == "<html>ok</html>"
        assert result.attempts == 1
        assert len(fake.calls) == 1
        assert metrics.fetch_count == 1
        assert metrics.error_count == 0


class TestOrchestratorRetry:
    async def test_retry_on_transient_then_success(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_error(_transient_error())
        fake.enqueue_error(_transient_error())
        fake.enqueue_result(_success())
        orch = FetchOrchestrator(client=fake, max_concurrent=4)

        result = await orch.fetch(_request(retries=3))

        assert len(fake.calls) == 3
        assert result.attempts == 3

    async def test_retry_exhaustion_raises(self) -> None:
        fake = FakeUnlocker()
        for _ in range(4):
            fake.enqueue_error(_transient_error())
        metrics = InMemoryMetricsSink()
        orch = FetchOrchestrator(client=fake, metrics=metrics, max_concurrent=4)

        with pytest.raises(TransientFetchError):
            await orch.fetch(_request(retries=3))

        # retries=3 → 4 total attempts
        assert len(fake.calls) == 4
        assert metrics.error_count == 1

    async def test_permanent_error_not_retried(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_error(_permanent_error())
        metrics = InMemoryMetricsSink()
        orch = FetchOrchestrator(client=fake, metrics=metrics, max_concurrent=4)

        with pytest.raises(PermanentFetchError):
            await orch.fetch(_request(retries=3))

        assert len(fake.calls) == 1
        assert metrics.error_count == 1

    async def test_quota_bubbles_without_retry(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_error(_quota_error())
        orch = FetchOrchestrator(client=fake, max_concurrent=4)

        with pytest.raises(QuotaExceededError):
            await orch.fetch(_request(retries=3))

        assert len(fake.calls) == 1


class _BlockingUnlocker:
    """Fake unlocker that sleeps for ``block_s`` seconds before returning."""

    def __init__(self, block_s: float) -> None:
        self.block_s = block_s
        self.calls: list[FetchRequest] = []

    async def fetch(self, request: FetchRequest) -> FetchResult:
        self.calls.append(request)
        await asyncio.sleep(self.block_s)
        return _success()

    async def aclose(self) -> None:
        return None


class TestOrchestratorTimeout:
    async def test_timeout_enforced(self) -> None:
        blocker = _BlockingUnlocker(block_s=2.0)
        orch = FetchOrchestrator(client=blocker, max_concurrent=4)  # type: ignore[arg-type]

        with pytest.raises((TimeoutFetchError, asyncio.TimeoutError)):
            await asyncio.wait_for(
                orch.fetch(_request(timeout_s=0.1, retries=0)),
                timeout=3.0,
            )


class _ConcurrencyTrackingUnlocker:
    """Fake unlocker that records the peak number of in-flight fetch calls."""

    def __init__(self, hold_s: float = 0.1) -> None:
        self._hold_s = hold_s
        self._in_flight = 0
        self.peak_in_flight = 0
        self._lock = asyncio.Lock()
        self.calls: list[FetchRequest] = []

    async def fetch(self, request: FetchRequest) -> FetchResult:
        async with self._lock:
            self.calls.append(request)
            self._in_flight += 1
            if self._in_flight > self.peak_in_flight:
                self.peak_in_flight = self._in_flight
        try:
            await asyncio.sleep(self._hold_s)
            return _success(url=request.url)
        finally:
            async with self._lock:
                self._in_flight -= 1

    async def aclose(self) -> None:
        return None


class TestOrchestratorConcurrency:
    async def test_max_concurrent_enforced(self) -> None:
        tracker = _ConcurrencyTrackingUnlocker(hold_s=0.05)
        orch = FetchOrchestrator(client=tracker, max_concurrent=2)  # type: ignore[arg-type]

        requests = [
            _request(url=f"https://www.zillow.com/homedetails/{i}", retries=0)
            for i in range(6)
        ]
        results = await orch.fetch_batch(requests)

        assert len(results) == 6
        assert all(isinstance(r, FetchResult) for r in results)
        assert tracker.peak_in_flight <= 2
        assert tracker.peak_in_flight >= 1


class TestOrchestratorBatch:
    async def test_mixed_outcomes_preserve_order(self) -> None:
        fake = FakeUnlocker()
        # Request 0: success on first try
        fake.enqueue_result(_success(url="https://www.zillow.com/homedetails/0"))
        # Request 1: permanent error
        fake.enqueue_error(_permanent_error())
        # Request 2: success on first try
        fake.enqueue_result(_success(url="https://www.zillow.com/homedetails/2"))
        # Request 3: transient error exhausts retries (retries=1 → 2 attempts)
        fake.enqueue_error(_transient_error())
        fake.enqueue_error(_transient_error())
        # Request 4: transient error exhausts retries
        fake.enqueue_error(_transient_error())
        fake.enqueue_error(_transient_error())

        metrics = InMemoryMetricsSink()
        orch = FetchOrchestrator(
            client=fake, metrics=metrics, max_concurrent=1
        )

        requests = [
            _request(url=f"https://www.zillow.com/homedetails/{i}", retries=1)
            for i in range(5)
        ]
        results = await orch.fetch_batch(requests)

        assert len(results) == 5
        assert isinstance(results[0], FetchResult)
        assert isinstance(results[1], PermanentFetchError)
        assert isinstance(results[2], FetchResult)
        assert isinstance(results[3], TransientFetchError)
        assert isinstance(results[4], TransientFetchError)
        assert metrics.fetch_count == 2
        assert metrics.error_count == 3


class TestOrchestratorMetricsOnFailure:
    async def test_error_path_records_metrics(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_error(_permanent_error())
        metrics = InMemoryMetricsSink()
        orch = FetchOrchestrator(client=fake, metrics=metrics, max_concurrent=4)

        with pytest.raises(FetchError):
            await orch.fetch(_request(retries=0))

        assert metrics.error_count == 1
        assert metrics.per_portal["zillow"].error_count == 1
        assert metrics.fetch_count == 0


class TestOrchestratorStats:
    async def test_stats_accumulates_on_success(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_result(_success())
        fake.enqueue_result(_success())
        orch = FetchOrchestrator(client=fake, max_concurrent=4)

        await orch.fetch(_request(retries=0))
        await orch.fetch(_request(retries=0))

        snap = orch.stats
        assert snap["fetch_count"] == 2
        assert snap["error_count"] == 0
        assert snap["attempts"] == 2
        assert snap["total_cost_usd"] == pytest.approx(0.003)
        assert snap["total_latency_ms"] == 200

    async def test_default_metrics_sink_is_noop(self) -> None:
        fake = FakeUnlocker()
        fake.enqueue_result(_success())
        # No metrics= kwarg → defaults to NullMetricsSink.
        orch = FetchOrchestrator(client=fake, max_concurrent=4)
        result = await orch.fetch(_request(retries=0))
        assert result.status_code == 200


class TestOrchestratorEnv:
    async def test_env_max_concurrent_applied(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("BRIGHT_DATA_MAX_CONCURRENT", "7")
        fake = FakeUnlocker()
        orch = FetchOrchestrator(client=fake)
        # Semaphore is private, but we can prove concurrency via value.
        assert orch._semaphore._value == 7

    async def test_env_invalid_max_concurrent_falls_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("BRIGHT_DATA_MAX_CONCURRENT", "not-a-number")
        fake = FakeUnlocker()
        orch = FetchOrchestrator(client=fake)
        assert orch._semaphore._value == 4

    async def test_env_empty_max_concurrent_falls_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("BRIGHT_DATA_MAX_CONCURRENT", "")
        fake = FakeUnlocker()
        orch = FetchOrchestrator(client=fake)
        assert orch._semaphore._value == 4
