from __future__ import annotations

from fastapi.testclient import TestClient

from src.contracts import (
    CanonicalPropertyResponse,
    ErrorResponse,
    ExtractListingResponse,
    FetchConfiguredResponse,
    FetchLimitsResponse,
    FetchMetadataResponse,
    FetchObservabilityResponse,
    FetchTotalsResponse,
    FetchUsageResponse,
    PortalMetricsResponse,
    PropertyPhotoResponse,
)
from src.main import app
from src.runtime import ExtractionRuntimeError, get_runtime


class _FakeRuntime:
    def __init__(self) -> None:
        self.last_request: dict[str, object] | None = None

    async def extract(self, request):
        self.last_request = request.model_dump()
        return ExtractListingResponse(
            portal="zillow",
            property=CanonicalPropertyResponse(
                source_platform="zillow",
                source_url=request.url,
                listing_id="12345",
                mls_number="A1B2C3",
                extracted_at="2026-04-12T12:00:00+00:00",
                address_line1="7421 Mirabella Way",
                city="Boca Raton",
                state="FL",
                postal_code="33433",
                latitude=26.35,
                longitude=-80.12,
                property_type="single_family",
                price_usd=875000,
                beds=4.0,
                baths=3.0,
                living_area_sqft=2500,
                lot_size_sqft=6000,
                year_built=1998,
                days_on_market=12,
                hoa_monthly_usd=250,
                description="Fixture listing",
                photos=[
                    PropertyPhotoResponse(
                        url="https://images.example/1.jpg",
                        caption="Front exterior",
                    )
                ],
            ),
            fetch=FetchMetadataResponse(
                request_id="req-123",
                vendor="bright_data_unlocker",
                status_code=200,
                fetched_at="2026-04-12T12:00:00+00:00",
                latency_ms=140,
                cost_usd=0.0025,
                attempts=2,
            ),
        )

    def fetch_observability(self) -> FetchObservabilityResponse:
        return FetchObservabilityResponse(
            vendor="bright_data_unlocker",
            configured=FetchConfiguredResponse(
                token_configured=True,
                zone_configured=True,
            ),
            limits=FetchLimitsResponse(
                max_concurrent=4,
                max_requests_per_minute=60,
                monthly_budget_usd=500.0,
                fallback_cost_per_request_usd=0.0015,
            ),
            usage=FetchUsageResponse(monthly_spent_usd=1.25),
            totals=FetchTotalsResponse(
                fetch_count=3,
                error_count=1,
                attempts=5,
                total_cost_usd=0.0065,
                total_latency_ms=420,
                average_latency_ms=140.0,
            ),
            per_portal={
                "zillow": PortalMetricsResponse(
                    fetch_count=2,
                    error_count=1,
                    total_cost_usd=0.004,
                    total_latency_ms=280,
                    average_latency_ms=140.0,
                ),
                "redfin": PortalMetricsResponse(
                    fetch_count=1,
                    error_count=0,
                    total_cost_usd=0.0025,
                    total_latency_ms=140,
                    average_latency_ms=140.0,
                ),
            },
        )

    async def aclose(self) -> None:
        return None


class _ErrorRuntime(_FakeRuntime):
    async def extract(self, request):
        raise ExtractionRuntimeError(
            status_code=503,
            error=ErrorResponse(
                code="fetch_vendor_error",
                message="Bright Data returned HTTP 502",
                retryable=True,
                request_id="req-err",
                portal="zillow",
                url=request.url,
                vendor="bright_data_unlocker",
            ),
        )


def test_health() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "buyer-v2-extraction"
    assert data["version"] == "0.0.1"
    assert "release" in data
    assert "environment" in data
    assert data["observability"]["structuredLogging"] is True
    assert "x-request-id" in response.headers
    assert data["health"]["requestCount"] >= 1


def test_extract_returns_canonical_property_and_fetch_metadata() -> None:
    fake_runtime = _FakeRuntime()
    app.dependency_overrides[get_runtime] = lambda: fake_runtime
    client = TestClient(app)

    response = client.post(
        "/extract",
        json={"url": "https://www.zillow.com/homedetails/7421-mirabella-way/"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["portal"] == "zillow"
    assert data["property"]["address_line1"] == "7421 Mirabella Way"
    assert data["fetch"]["vendor"] == "bright_data_unlocker"
    assert data["fetch"]["attempts"] == 2
    assert fake_runtime.last_request == {
        "url": "https://www.zillow.com/homedetails/7421-mirabella-way/",
        "portal": None,
        "timeout_s": 30.0,
        "retries": 3,
    }


def test_fetch_metrics_exposes_limits_usage_and_cost_without_secrets() -> None:
    app.dependency_overrides[get_runtime] = lambda: _FakeRuntime()
    client = TestClient(app)

    response = client.get("/metrics/fetch")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["vendor"] == "bright_data_unlocker"
    assert data["configured"]["token_configured"] is True
    assert data["limits"]["monthly_budget_usd"] == 500.0
    assert data["usage"]["monthly_spent_usd"] == 1.25
    assert data["totals"]["total_cost_usd"] == 0.0065
    assert data["totals"]["average_latency_ms"] == 140.0
    serialized = response.text.lower()
    assert "token=" not in serialized
    assert "bearer" not in serialized


def test_extract_surfaces_structured_fetch_errors() -> None:
    app.dependency_overrides[get_runtime] = lambda: _ErrorRuntime()
    client = TestClient(app)

    response = client.post(
        "/extract",
        json={"url": "https://www.zillow.com/homedetails/7421-mirabella-way/"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 503
    data = response.json()
    assert data["code"] == "fetch_vendor_error"
    assert data["retryable"] is True
    assert data["request_id"] == "req-err"
    assert data["vendor"] == "bright_data_unlocker"
