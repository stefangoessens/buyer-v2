from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Portal = Literal["zillow", "redfin", "realtor"]


class ExtractListingRequest(BaseModel):
    url: str = Field(min_length=1)
    portal: Portal | None = None
    timeout_s: float = Field(default=30.0, gt=0, le=120)
    retries: int = Field(default=3, ge=0, le=5)


class PropertyPhotoResponse(BaseModel):
    url: str
    caption: str | None = None


class CanonicalPropertyResponse(BaseModel):
    source_platform: Portal
    source_url: str
    listing_id: str | None
    mls_number: str | None
    extracted_at: str
    address_line1: str
    city: str
    state: str
    postal_code: str
    latitude: float | None
    longitude: float | None
    property_type: str | None
    price_usd: int | None
    beds: float | None
    baths: float | None
    living_area_sqft: int | None
    lot_size_sqft: int | None
    year_built: int | None
    days_on_market: int | None
    hoa_monthly_usd: int | None
    zestimate_usd: int | None = None
    rent_zestimate_usd: int | None = None
    redfin_estimate_usd: int | None = None
    description: str | None = None
    photos: list[PropertyPhotoResponse] = Field(default_factory=list)


class FetchMetadataResponse(BaseModel):
    request_id: str
    vendor: str
    status_code: int
    fetched_at: str
    latency_ms: int
    cost_usd: float
    attempts: int


class ExtractListingResponse(BaseModel):
    portal: Portal
    property: CanonicalPropertyResponse
    fetch: FetchMetadataResponse


class ErrorResponse(BaseModel):
    code: str
    message: str
    retryable: bool | None = None
    request_id: str | None = None
    portal: Portal | None = None
    url: str | None = None
    vendor: str | None = None
    details: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class FetchConfiguredResponse(BaseModel):
    token_configured: bool
    zone_configured: bool


class FetchLimitsResponse(BaseModel):
    max_concurrent: int
    max_requests_per_minute: int
    monthly_budget_usd: float
    fallback_cost_per_request_usd: float


class FetchUsageResponse(BaseModel):
    monthly_spent_usd: float


class FetchTotalsResponse(BaseModel):
    fetch_count: int
    error_count: int
    attempts: int
    total_cost_usd: float
    total_latency_ms: int
    average_latency_ms: float


class PortalMetricsResponse(BaseModel):
    fetch_count: int
    error_count: int
    total_cost_usd: float
    total_latency_ms: int
    average_latency_ms: float


class FetchObservabilityResponse(BaseModel):
    vendor: str
    configured: FetchConfiguredResponse
    limits: FetchLimitsResponse
    usage: FetchUsageResponse
    totals: FetchTotalsResponse
    per_portal: dict[Portal, PortalMetricsResponse]


# ─── Comp pool seeding ──────────────────────────────────────────────────
# Scrapes Zillow's sold-listings search page for a zip + bed filter and
# returns a list of comps for the Convex comp pool. Used by the engine
# orchestrator Phase 0 before pricing/comps/leverage run.


class SeedCompsRequest(BaseModel):
    zip_code: str
    beds_min: int | None = None
    # Optional override for testing; defaults to "sold".
    status: str = "sold"
    # Optional upper bound on returned comps; server may return fewer.
    limit: int = 30


class SoldCompResponse(BaseModel):
    zpid: str
    source_url: str
    address_line1: str
    city: str
    state: str
    postal_code: str
    latitude: float | None
    longitude: float | None
    sold_price_usd: int | None
    sold_date: str | None
    beds: int | None
    baths: float | None
    living_area_sqft: int | None
    property_type: str | None
    days_on_market: int | None
    zestimate_usd: int | None


class SeedCompsResponse(BaseModel):
    zip_code: str
    comps: list[SoldCompResponse]
    fetch: FetchMetadataResponse
