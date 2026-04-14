"""Canonical property dataclass produced by portal-specific extractors.

Every deterministic extractor (``parsers/zillow.py``, ``parsers/redfin.py``,
``parsers/realtor.py``) returns a :class:`CanonicalProperty`. Downstream
consumers (Convex ingest, comps, pricing) treat this as the portal-neutral
shape of a listing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import datetime

    from common.types import Portal


@dataclass(frozen=True, slots=True)
class PropertyPhoto:
    """Single listing photo URL plus optional caption."""

    url: str
    caption: str | None = None


@dataclass(frozen=True, slots=True)
class CanonicalProperty:
    """Portal-neutral property record.

    ``extracted_at`` must be timezone-aware UTC; enforced in ``__post_init__``.
    """

    # Identity
    source_platform: Portal
    source_url: str
    listing_id: str | None
    mls_number: str | None
    extracted_at: datetime

    # Address
    address_line1: str
    city: str
    state: str
    postal_code: str
    latitude: float | None
    longitude: float | None

    # Core facts
    property_type: str | None
    price_usd: int | None
    beds: float | None
    baths: float | None
    living_area_sqft: int | None
    lot_size_sqft: int | None
    year_built: int | None

    # Market
    days_on_market: int | None
    hoa_monthly_usd: int | None

    # Portal AVMs (automated valuation models)
    zestimate_usd: int | None = None
    rent_zestimate_usd: int | None = None
    redfin_estimate_usd: int | None = None

    # Content
    description: str | None = None
    photos: tuple[PropertyPhoto, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if self.extracted_at.tzinfo is None:
            raise ValueError(
                "CanonicalProperty.extracted_at must be timezone-aware (UTC)"
            )
