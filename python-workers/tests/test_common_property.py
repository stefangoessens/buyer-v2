"""Tests for :mod:`common.property` — canonical listing dataclass."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import pytest

from common.property import CanonicalProperty, PropertyPhoto

if TYPE_CHECKING:
    from common.types import Portal


_NOW_UTC = datetime(2026, 4, 12, 12, 0, 0, tzinfo=UTC)


def _base_kwargs(**overrides: Any) -> dict[str, Any]:
    """Minimal kwargs for constructing a :class:`CanonicalProperty`."""
    defaults: dict[str, Any] = {
        "source_platform": "zillow",
        "source_url": "https://www.zillow.com/homedetails/1234-main-st/",
        "listing_id": "zpid-1",
        "mls_number": "A1234",
        "extracted_at": _NOW_UTC,
        "address_line1": "1234 Main St",
        "city": "Miami",
        "state": "FL",
        "postal_code": "33101",
        "latitude": 25.77,
        "longitude": -80.19,
        "property_type": "single_family",
        "price_usd": 500_000,
        "beds": 3.0,
        "baths": 2.0,
        "living_area_sqft": 1800,
        "lot_size_sqft": 5000,
        "year_built": 1995,
        "days_on_market": 10,
        "hoa_monthly_usd": None,
        "description": "Nice house",
    }
    defaults.update(overrides)
    return defaults


class TestPropertyPhoto:
    """``PropertyPhoto`` basic construction + frozen semantics."""

    def test_construction_with_caption(self) -> None:
        photo = PropertyPhoto(url="https://cdn.example.com/a.jpg", caption="front")
        assert photo.url == "https://cdn.example.com/a.jpg"
        assert photo.caption == "front"

    def test_caption_defaults_to_none(self) -> None:
        photo = PropertyPhoto(url="https://cdn.example.com/a.jpg")
        assert photo.caption is None

    def test_frozen_photo_setattr_raises(self) -> None:
        photo = PropertyPhoto(url="https://cdn.example.com/a.jpg")
        with pytest.raises((FrozenInstanceError, AttributeError)):
            photo.url = "https://cdn.example.com/b.jpg"  # type: ignore[misc]


class TestCanonicalPropertyConstruction:
    """Happy-path construction + field assignment."""

    def test_all_fields_round_trip(self) -> None:
        photos = (
            PropertyPhoto(url="https://cdn.example.com/1.jpg", caption="front"),
            PropertyPhoto(url="https://cdn.example.com/2.jpg"),
        )
        prop = CanonicalProperty(**_base_kwargs(photos=photos))
        assert prop.source_platform == "zillow"
        assert prop.source_url.startswith("https://")
        assert prop.listing_id == "zpid-1"
        assert prop.mls_number == "A1234"
        assert prop.extracted_at == _NOW_UTC
        assert prop.address_line1 == "1234 Main St"
        assert prop.city == "Miami"
        assert prop.state == "FL"
        assert prop.postal_code == "33101"
        assert prop.latitude == 25.77
        assert prop.longitude == -80.19
        assert prop.property_type == "single_family"
        assert prop.price_usd == 500_000
        assert prop.beds == 3.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1800
        assert prop.lot_size_sqft == 5000
        assert prop.year_built == 1995
        assert prop.days_on_market == 10
        assert prop.hoa_monthly_usd is None
        assert prop.description == "Nice house"
        assert prop.photos == photos

    def test_photos_defaults_to_empty_tuple(self) -> None:
        prop = CanonicalProperty(**_base_kwargs())
        assert prop.photos == ()
        assert isinstance(prop.photos, tuple)

    def test_optional_fields_accept_none(self) -> None:
        prop = CanonicalProperty(
            **_base_kwargs(
                listing_id=None,
                mls_number=None,
                latitude=None,
                longitude=None,
                property_type=None,
                price_usd=None,
                beds=None,
                baths=None,
                living_area_sqft=None,
                lot_size_sqft=None,
                year_built=None,
                days_on_market=None,
                hoa_monthly_usd=None,
                description=None,
            )
        )
        assert prop.listing_id is None
        assert prop.price_usd is None
        assert prop.beds is None


class TestTimezoneEnforcement:
    """``extracted_at`` must be timezone-aware."""

    def test_naive_datetime_raises(self) -> None:
        naive = datetime(2026, 4, 12, 12, 0, 0)  # noqa: DTZ001
        assert naive.tzinfo is None
        with pytest.raises(ValueError, match="timezone-aware"):
            CanonicalProperty(**_base_kwargs(extracted_at=naive))

    def test_tz_aware_utc_accepted(self) -> None:
        prop = CanonicalProperty(**_base_kwargs(extracted_at=_NOW_UTC))
        assert prop.extracted_at.tzinfo is not None

    def test_tz_aware_non_utc_accepted(self) -> None:
        from datetime import timedelta, timezone

        eastern = timezone(timedelta(hours=-5))
        stamp = datetime(2026, 4, 12, 7, 0, 0, tzinfo=eastern)
        prop = CanonicalProperty(**_base_kwargs(extracted_at=stamp))
        assert prop.extracted_at.tzinfo is not None


class TestFrozenSemantics:
    """``CanonicalProperty`` is frozen — mutation raises."""

    def test_setattr_raises(self) -> None:
        prop = CanonicalProperty(**_base_kwargs())
        with pytest.raises((FrozenInstanceError, AttributeError)):
            prop.price_usd = 600_000  # type: ignore[misc]

    def test_delete_attr_raises(self) -> None:
        prop = CanonicalProperty(**_base_kwargs())
        with pytest.raises((FrozenInstanceError, AttributeError)):
            del prop.price_usd


class TestSourcePlatformLiteral:
    """``source_platform`` is typed as ``Portal`` (Literal) — only the allowed values make sense."""

    @pytest.mark.parametrize("portal", ["zillow", "redfin", "realtor"])
    def test_accepts_all_portal_literals(self, portal: Portal) -> None:
        prop = CanonicalProperty(**_base_kwargs(source_platform=portal))
        assert prop.source_platform == portal
