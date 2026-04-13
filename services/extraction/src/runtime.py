from __future__ import annotations

import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace
from typing import Protocol, cast

from .contracts import (
    CanonicalPropertyResponse,
    ErrorResponse,
    ExtractListingRequest,
    ExtractListingResponse,
    FetchConfiguredResponse,
    FetchLimitsResponse,
    FetchMetadataResponse,
    FetchObservabilityResponse,
    FetchTotalsResponse,
    FetchUsageResponse,
    Portal,
    PortalMetricsResponse,
    PropertyPhotoResponse,
    SeedCompsRequest,
    SeedCompsResponse,
    SoldCompResponse,
)

_SERVICE_VERSION = "0.0.1"
_FETCH_VENDOR = "bright_data_unlocker"


class ExtractionRuntimeError(Exception):
    def __init__(self, status_code: int, error: ErrorResponse) -> None:
        super().__init__(error.message)
        self.status_code = status_code
        self.error = error


class ExtractionRuntime(Protocol):
    async def extract(self, request: ExtractListingRequest) -> ExtractListingResponse: ...

    def fetch_observability(self) -> FetchObservabilityResponse: ...

    async def aclose(self) -> None: ...


def _ensure_python_workers_path() -> Path | None:
    current = Path(__file__).resolve()
    for parent in current.parents:
        for name in ("python-workers", "python-workers-vendored"):
            candidate = parent / name
            if candidate.is_dir():
                candidate_str = str(candidate)
                if candidate_str not in sys.path:
                    sys.path.insert(0, candidate_str)
                return candidate
    return None


@lru_cache(maxsize=1)
def _worker_imports() -> SimpleNamespace:
    _ensure_python_workers_path()

    from common.errors import (  # type: ignore[import-not-found]
        AntiBotFetchError,
        FetchError,
        InvalidPortalError,
        PermanentFetchError,
        QuotaExceededError,
        TimeoutFetchError,
        VendorFetchError,
    )
    from common.parser_errors import (  # type: ignore[import-not-found]
        MalformedHTMLError,
        ParserError,
        SchemaShiftError,
    )
    from common.portals import detect_portal  # type: ignore[import-not-found]
    from common.types import FetchRequest  # type: ignore[import-not-found]
    from fetch.metrics import InMemoryMetricsSink  # type: ignore[import-not-found]
    from fetch.orchestrator import FetchOrchestrator  # type: ignore[import-not-found]
    from fetch.unlocker import BrightDataUnlockerClient  # type: ignore[import-not-found]
    from parsers.redfin import RedfinExtractor  # type: ignore[import-not-found]
    from parsers.realtor import RealtorExtractor  # type: ignore[import-not-found]
    from parsers.zillow import ZillowExtractor  # type: ignore[import-not-found]
    from parsers.zillow_search import (  # type: ignore[import-not-found]
        parse_zillow_search_results,
        search_url_for_zip,
    )

    return SimpleNamespace(
        AntiBotFetchError=AntiBotFetchError,
        BrightDataUnlockerClient=BrightDataUnlockerClient,
        FetchError=FetchError,
        FetchOrchestrator=FetchOrchestrator,
        FetchRequest=FetchRequest,
        InMemoryMetricsSink=InMemoryMetricsSink,
        InvalidPortalError=InvalidPortalError,
        MalformedHTMLError=MalformedHTMLError,
        ParserError=ParserError,
        PermanentFetchError=PermanentFetchError,
        QuotaExceededError=QuotaExceededError,
        RealtorExtractor=RealtorExtractor,
        RedfinExtractor=RedfinExtractor,
        SchemaShiftError=SchemaShiftError,
        TimeoutFetchError=TimeoutFetchError,
        VendorFetchError=VendorFetchError,
        ZillowExtractor=ZillowExtractor,
        detect_portal=detect_portal,
        parse_zillow_search_results=parse_zillow_search_results,
        search_url_for_zip=search_url_for_zip,
    )


@dataclass(slots=True)
class DefaultExtractionRuntime:
    _client: object
    _metrics: object
    _orchestrator: object
    _imports: SimpleNamespace

    @classmethod
    def build(cls) -> DefaultExtractionRuntime:
        imports = _worker_imports()
        metrics = imports.InMemoryMetricsSink()
        client = imports.BrightDataUnlockerClient()
        orchestrator = imports.FetchOrchestrator(client=client, metrics=metrics)
        return cls(
            _client=client,
            _metrics=metrics,
            _orchestrator=orchestrator,
            _imports=imports,
        )

    async def extract(self, request: ExtractListingRequest) -> ExtractListingResponse:
        portal = self._resolve_portal(request)
        fetch_request = self._imports.FetchRequest(
            url=request.url,
            portal=portal,
            timeout_s=request.timeout_s,
            retries=request.retries,
        )

        try:
            fetch_result = await self._orchestrator.fetch(fetch_request)
            property_result = self._extract_property(
                portal=portal,
                source_url=fetch_result.url,
                html=fetch_result.html,
            )
        except Exception as exc:
            raise self._map_exception(exc) from exc

        return ExtractListingResponse(
            portal=portal,
            property=property_result,
            fetch=FetchMetadataResponse(
                request_id=fetch_result.request_id,
                vendor=fetch_result.vendor,
                status_code=fetch_result.status_code,
                fetched_at=fetch_result.fetched_at.isoformat(),
                latency_ms=fetch_result.latency_ms,
                cost_usd=fetch_result.cost_usd,
                attempts=fetch_result.attempts,
            ),
        )

    def fetch_observability(self) -> FetchObservabilityResponse:
        client_snapshot = self._client.observability_snapshot()
        metrics_snapshot = self._metrics.snapshot()
        orchestrator_stats = self._orchestrator.stats

        total_fetches = cast(int, metrics_snapshot["fetch_count"])
        total_latency_ms = cast(int, metrics_snapshot["total_latency_ms"])
        average_latency_ms = (
            float(total_latency_ms) / float(total_fetches) if total_fetches else 0.0
        )

        per_portal: dict[Portal, PortalMetricsResponse] = {}
        portal_metrics = cast(dict[str, dict[str, int | float]], metrics_snapshot["per_portal"])
        for portal_name, portal_data in portal_metrics.items():
            fetch_count = int(portal_data["fetch_count"])
            portal_latency_ms = int(portal_data["total_latency_ms"])
            per_portal[cast(Portal, portal_name)] = PortalMetricsResponse(
                fetch_count=fetch_count,
                error_count=int(portal_data["error_count"]),
                total_cost_usd=float(portal_data["total_cost_usd"]),
                total_latency_ms=portal_latency_ms,
                average_latency_ms=(
                    float(portal_latency_ms) / float(fetch_count) if fetch_count else 0.0
                ),
            )

        return FetchObservabilityResponse(
            vendor=_FETCH_VENDOR,
            configured=FetchConfiguredResponse(
                token_configured=bool(client_snapshot["configured"]["token_configured"]),
                zone_configured=bool(client_snapshot["configured"]["zone_configured"]),
            ),
            limits=FetchLimitsResponse(
                max_concurrent=int(self._orchestrator.max_concurrent),
                max_requests_per_minute=int(
                    client_snapshot["limits"]["max_requests_per_minute"]
                ),
                monthly_budget_usd=float(
                    client_snapshot["limits"]["monthly_budget_usd"]
                ),
                fallback_cost_per_request_usd=float(
                    client_snapshot["limits"]["fallback_cost_per_request_usd"]
                ),
            ),
            usage=FetchUsageResponse(
                monthly_spent_usd=float(client_snapshot["usage"]["monthly_spent_usd"])
            ),
            totals=FetchTotalsResponse(
                fetch_count=total_fetches,
                error_count=cast(int, metrics_snapshot["error_count"]),
                attempts=cast(int, orchestrator_stats["attempts"]),
                total_cost_usd=float(metrics_snapshot["total_cost_usd"]),
                total_latency_ms=total_latency_ms,
                average_latency_ms=average_latency_ms,
            ),
            per_portal=per_portal,
        )

    async def seed_comps(
        self, request: SeedCompsRequest
    ) -> SeedCompsResponse:
        search_url = self._imports.search_url_for_zip(
            request.zip_code,
            beds_min=request.beds_min,
            status=request.status,
        )
        fetch_request = self._imports.FetchRequest(
            url=search_url,
            portal="zillow",
            timeout_s=45.0,
            retries=2,
        )
        try:
            fetch_result = await self._orchestrator.fetch(fetch_request)
        except Exception as exc:
            raise self._map_exception(exc) from exc

        sold_comps = self._imports.parse_zillow_search_results(
            fetch_result.html, fetch_result.url
        )
        limited = sold_comps[: max(1, request.limit)]
        comps = [
            SoldCompResponse(
                zpid=c.zpid,
                source_url=c.source_url,
                address_line1=c.address_line1,
                city=c.city,
                state=c.state,
                postal_code=c.postal_code,
                latitude=c.latitude,
                longitude=c.longitude,
                sold_price_usd=c.sold_price_usd,
                sold_date=c.sold_date,
                beds=c.beds,
                baths=c.baths,
                living_area_sqft=c.living_area_sqft,
                property_type=c.property_type,
                days_on_market=c.days_on_market,
                zestimate_usd=c.zestimate_usd,
            )
            for c in limited
        ]

        return SeedCompsResponse(
            zip_code=request.zip_code,
            comps=comps,
            fetch=FetchMetadataResponse(
                request_id=fetch_result.request_id,
                vendor=fetch_result.vendor,
                status_code=fetch_result.status_code,
                fetched_at=fetch_result.fetched_at.isoformat(),
                latency_ms=fetch_result.latency_ms,
                cost_usd=fetch_result.cost_usd,
                attempts=fetch_result.attempts,
            ),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _resolve_portal(self, request: ExtractListingRequest) -> Portal:
        detected = cast(Portal, self._imports.detect_portal(request.url))
        if request.portal is not None and request.portal != detected:
            raise ExtractionRuntimeError(
                status_code=400,
                error=ErrorResponse(
                    code="portal_mismatch",
                    message="Request portal does not match the URL host.",
                    portal=request.portal,
                    url=request.url,
                    details={"detected_portal": detected},
                ),
            )
        return request.portal or detected

    def _extract_property(
        self, *, portal: Portal, source_url: str, html: str
    ) -> CanonicalPropertyResponse:
        extractor = self._build_extractor(portal)
        property_data = extractor.extract(html=html, source_url=source_url)
        return CanonicalPropertyResponse(
            source_platform=property_data.source_platform,
            source_url=property_data.source_url,
            listing_id=property_data.listing_id,
            mls_number=property_data.mls_number,
            extracted_at=property_data.extracted_at.isoformat(),
            address_line1=property_data.address_line1,
            city=property_data.city,
            state=property_data.state,
            postal_code=property_data.postal_code,
            latitude=property_data.latitude,
            longitude=property_data.longitude,
            property_type=property_data.property_type,
            price_usd=property_data.price_usd,
            beds=property_data.beds,
            baths=property_data.baths,
            living_area_sqft=property_data.living_area_sqft,
            lot_size_sqft=property_data.lot_size_sqft,
            year_built=property_data.year_built,
            days_on_market=property_data.days_on_market,
            hoa_monthly_usd=property_data.hoa_monthly_usd,
            description=property_data.description,
            photos=[
                PropertyPhotoResponse(url=photo.url, caption=photo.caption)
                for photo in property_data.photos
            ],
        )

    def _build_extractor(self, portal: Portal) -> object:
        if portal == "zillow":
            return self._imports.ZillowExtractor()
        if portal == "redfin":
            return self._imports.RedfinExtractor()
        return self._imports.RealtorExtractor()

    def _map_exception(self, exc: Exception) -> ExtractionRuntimeError:
        if isinstance(exc, ExtractionRuntimeError):
            return exc

        if isinstance(exc, self._imports.InvalidPortalError):
            return ExtractionRuntimeError(
                status_code=400,
                error=ErrorResponse(
                    code="unsupported_portal",
                    message=str(exc),
                    url=exc.url,
                ),
            )

        if isinstance(exc, self._imports.TimeoutFetchError):
            return ExtractionRuntimeError(
                status_code=504,
                error=self._fetch_error("fetch_timeout", exc),
            )

        if isinstance(exc, self._imports.QuotaExceededError):
            return ExtractionRuntimeError(
                status_code=429,
                error=self._fetch_error("fetch_quota_exceeded", exc),
            )

        if isinstance(exc, self._imports.AntiBotFetchError):
            return ExtractionRuntimeError(
                status_code=503,
                error=self._fetch_error("fetch_anti_bot", exc),
            )

        if isinstance(exc, self._imports.VendorFetchError):
            return ExtractionRuntimeError(
                status_code=503,
                error=self._fetch_error("fetch_vendor_error", exc),
            )

        if isinstance(exc, self._imports.PermanentFetchError):
            return ExtractionRuntimeError(
                status_code=502,
                error=self._fetch_error("fetch_failed", exc),
            )

        if isinstance(exc, self._imports.FetchError):
            return ExtractionRuntimeError(
                status_code=503,
                error=self._fetch_error("fetch_failed", exc),
            )

        if isinstance(exc, self._imports.MalformedHTMLError):
            return ExtractionRuntimeError(
                status_code=422,
                error=ErrorResponse(
                    code="malformed_html",
                    message=str(exc),
                    url=exc.url,
                    portal=cast(Portal, exc.portal),
                ),
            )

        if isinstance(exc, self._imports.SchemaShiftError):
            return ExtractionRuntimeError(
                status_code=422,
                error=ErrorResponse(
                    code="schema_shift",
                    message=str(exc),
                    url=exc.url,
                    portal=cast(Portal, exc.portal),
                ),
            )

        if isinstance(exc, self._imports.ParserError):
            return ExtractionRuntimeError(
                status_code=422,
                error=ErrorResponse(
                    code="parse_failed",
                    message=str(exc),
                    url=exc.url,
                    portal=cast(Portal, exc.portal),
                ),
            )

        return ExtractionRuntimeError(
            status_code=500,
            error=ErrorResponse(
                code="internal_error",
                message=str(exc),
            ),
        )

    @staticmethod
    def _fetch_error(code: str, error: object) -> ErrorResponse:
        return ErrorResponse(
            code=code,
            message=str(error),
            retryable=cast(bool | None, getattr(error, "retryable", None)),
            request_id=cast(str | None, getattr(error, "request_id", None)),
            portal=cast(Portal | None, getattr(error, "portal", None)),
            url=cast(str | None, getattr(error, "url", None)),
            vendor=cast(str | None, getattr(error, "vendor", None)),
        )


_runtime: ExtractionRuntime | None = None


def get_runtime() -> ExtractionRuntime:
    global _runtime
    if _runtime is None:
        try:
            _runtime = DefaultExtractionRuntime.build()
        except Exception as exc:
            raise ExtractionRuntimeError(
                status_code=503,
                error=ErrorResponse(
                    code="runtime_unavailable",
                    message=str(exc),
                    details={"service_version": _SERVICE_VERSION},
                ),
            ) from exc
    return _runtime


async def close_runtime() -> None:
    global _runtime
    if _runtime is not None:
        await _runtime.aclose()
        _runtime = None
