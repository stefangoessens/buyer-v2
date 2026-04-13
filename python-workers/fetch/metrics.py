"""Fetch-layer metrics sinks.

``MetricsSink`` is a Protocol so the orchestrator can stay decoupled from
either in-memory testing, Prometheus in production, or a no-op default.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from common.errors import FetchError
    from common.types import FetchRequest, FetchResult, Portal


@runtime_checkable
class MetricsSink(Protocol):
    """Protocol for fetch-layer metric collectors."""

    def record_fetch(
        self,
        *,
        request: FetchRequest,
        result: FetchResult | None,
        error: FetchError | None,
    ) -> None: ...


@dataclass(slots=True)
class _PortalStats:
    fetch_count: int = 0
    error_count: int = 0
    total_cost_usd: float = 0.0
    total_latency_ms: int = 0


@dataclass(slots=True)
class _FailureSample:
    error_type: str
    message: str
    portal: str | None
    request_id: str
    vendor: str
    retryable: bool


@dataclass(slots=True)
class InMemoryMetricsSink:
    """Simple counters for tests and local development."""

    fetch_count: int = 0
    error_count: int = 0
    total_cost_usd: float = 0.0
    total_latency_ms: int = 0
    per_portal: dict[Portal, _PortalStats] = field(
        default_factory=lambda: defaultdict(_PortalStats)
    )
    recent_failures: list[_FailureSample] = field(default_factory=list)

    def record_fetch(
        self,
        *,
        request: FetchRequest,
        result: FetchResult | None,
        error: FetchError | None,
    ) -> None:
        portal_stats = self.per_portal[request.portal]
        if result is not None:
            self.fetch_count += 1
            self.total_cost_usd += result.cost_usd
            self.total_latency_ms += result.latency_ms
            portal_stats.fetch_count += 1
            portal_stats.total_cost_usd += result.cost_usd
            portal_stats.total_latency_ms += result.latency_ms
        if error is not None:
            self.error_count += 1
            portal_stats.error_count += 1
            self.recent_failures.insert(
                0,
                _FailureSample(
                    error_type=type(error).__name__,
                    message=str(error),
                    portal=error.portal,
                    request_id=error.request_id,
                    vendor=error.vendor,
                    retryable=error.retryable,
                ),
            )
            del self.recent_failures[10:]

    def snapshot(self) -> dict[str, Any]:
        return {
            "fetch_count": self.fetch_count,
            "error_count": self.error_count,
            "total_cost_usd": self.total_cost_usd,
            "total_latency_ms": self.total_latency_ms,
            "recent_failures": [
                {
                    "error_type": failure.error_type,
                    "message": failure.message,
                    "portal": failure.portal,
                    "request_id": failure.request_id,
                    "vendor": failure.vendor,
                    "retryable": failure.retryable,
                }
                for failure in self.recent_failures
            ],
            "per_portal": {
                portal: {
                    "fetch_count": stats.fetch_count,
                    "error_count": stats.error_count,
                    "total_cost_usd": stats.total_cost_usd,
                    "total_latency_ms": stats.total_latency_ms,
                }
                for portal, stats in self.per_portal.items()
            },
        }


class PrometheusMetricsSink:
    """Stub Prometheus sink.

    TODO: wire to ``prometheus_client`` (counter + histogram) once the
    worker service picks a process model (per-worker vs multiprocess).
    """

    def record_fetch(
        self,
        *,
        request: FetchRequest,
        result: FetchResult | None,
        error: FetchError | None,
    ) -> None:
        # No-op placeholder — see docstring.
        return None


class NullMetricsSink:
    """Discard all fetch events."""

    def record_fetch(
        self,
        *,
        request: FetchRequest,
        result: FetchResult | None,
        error: FetchError | None,
    ) -> None:
        return None
