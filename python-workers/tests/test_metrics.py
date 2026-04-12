"""Tests for :mod:`fetch.metrics`: InMemory / Null / Prometheus sinks."""

from __future__ import annotations

from datetime import UTC, datetime

from common.errors import TransientFetchError
from common.types import FetchRequest, FetchResult
from fetch.metrics import (
    InMemoryMetricsSink,
    MetricsSink,
    NullMetricsSink,
    PrometheusMetricsSink,
)


def _make_request(portal: str = "zillow") -> FetchRequest:
    return FetchRequest(
        url=f"https://www.{portal}.com/homedetails/x",
        portal=portal,  # type: ignore[arg-type]
    )


def _make_result(
    request: FetchRequest,
    *,
    cost_usd: float = 0.0015,
    latency_ms: int = 120,
) -> FetchResult:
    return FetchResult(
        url=request.url,
        portal=request.portal,
        status_code=200,
        html="<html>ok</html>",
        fetched_at=datetime.now(UTC),
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        vendor="bright_data_unlocker",
        request_id=request.request_id,
        attempts=1,
    )


def _make_error(request: FetchRequest) -> TransientFetchError:
    return TransientFetchError(
        "temporary",
        request_id=request.request_id,
        portal=request.portal,
        url=request.url,
        vendor="bright_data_unlocker",
    )


class TestInMemoryMetricsSink:
    def test_record_success_increments_totals(self) -> None:
        sink = InMemoryMetricsSink()
        req = _make_request("zillow")
        result = _make_result(req, cost_usd=0.002, latency_ms=150)

        sink.record_fetch(request=req, result=result, error=None)

        assert sink.fetch_count == 1
        assert sink.error_count == 0
        assert sink.total_cost_usd == 0.002
        assert sink.total_latency_ms == 150
        assert sink.per_portal["zillow"].fetch_count == 1
        assert sink.per_portal["zillow"].total_cost_usd == 0.002
        assert sink.per_portal["zillow"].total_latency_ms == 150
        assert sink.per_portal["zillow"].error_count == 0

    def test_record_error_increments_error_buckets(self) -> None:
        sink = InMemoryMetricsSink()
        req = _make_request("redfin")
        err = _make_error(req)

        sink.record_fetch(request=req, result=None, error=err)

        assert sink.fetch_count == 0
        assert sink.error_count == 1
        assert sink.total_cost_usd == 0.0
        assert sink.total_latency_ms == 0
        assert sink.per_portal["redfin"].error_count == 1
        assert sink.per_portal["redfin"].fetch_count == 0

    def test_multiple_portals_tracked_independently(self) -> None:
        sink = InMemoryMetricsSink()
        z = _make_request("zillow")
        r = _make_request("redfin")
        sink.record_fetch(request=z, result=_make_result(z, cost_usd=0.001), error=None)
        sink.record_fetch(request=z, result=_make_result(z, cost_usd=0.001), error=None)
        sink.record_fetch(request=r, result=_make_result(r, cost_usd=0.002), error=None)
        sink.record_fetch(request=r, result=None, error=_make_error(r))

        assert sink.fetch_count == 3
        assert sink.error_count == 1
        assert sink.per_portal["zillow"].fetch_count == 2
        assert sink.per_portal["redfin"].fetch_count == 1
        assert sink.per_portal["redfin"].error_count == 1
        assert sink.per_portal["zillow"].total_cost_usd == 0.002
        assert sink.per_portal["redfin"].total_cost_usd == 0.002

    def test_snapshot_has_expected_keys(self) -> None:
        sink = InMemoryMetricsSink()
        req = _make_request("realtor")
        sink.record_fetch(request=req, result=_make_result(req), error=None)

        snap = sink.snapshot()
        assert set(snap.keys()) == {
            "fetch_count",
            "error_count",
            "total_cost_usd",
            "total_latency_ms",
            "per_portal",
        }
        assert snap["fetch_count"] == 1
        assert "realtor" in snap["per_portal"]
        assert set(snap["per_portal"]["realtor"].keys()) == {
            "fetch_count",
            "error_count",
            "total_cost_usd",
            "total_latency_ms",
        }


class TestNullMetricsSink:
    def test_is_metrics_sink_protocol(self) -> None:
        sink = NullMetricsSink()
        assert isinstance(sink, MetricsSink)

    def test_record_is_noop(self) -> None:
        sink = NullMetricsSink()
        req = _make_request("zillow")
        sink.record_fetch(request=req, result=_make_result(req), error=None)
        sink.record_fetch(request=req, result=None, error=_make_error(req))
        # No attributes to check — if it didn't raise, it's a no-op.


class TestPrometheusMetricsSink:
    def test_is_metrics_sink_protocol(self) -> None:
        sink = PrometheusMetricsSink()
        assert isinstance(sink, MetricsSink)

    def test_record_is_noop_stub(self) -> None:
        sink = PrometheusMetricsSink()
        req = _make_request("zillow")
        sink.record_fetch(request=req, result=_make_result(req), error=None)
