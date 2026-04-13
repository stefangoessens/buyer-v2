"""Tests for the deterministic Redfin extractor in :mod:`parsers.redfin`.

Fixtures live under ``python-workers/fixtures/html/redfin/`` and are loaded
by ``pathlib`` — no network, no mocks of the parser itself. The parser is
run for real and we assert on the :class:`CanonicalProperty` output.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from common.parser_errors import MalformedHTMLError, SchemaShiftError
from common.property import CanonicalProperty, PropertyPhoto
from parsers.redfin import RedfinExtractor, _normalize_property_type

if TYPE_CHECKING:
    from collections.abc import Mapping


_FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "html" / "redfin"


def _load(name: str) -> str:
    """Read a Redfin fixture by filename."""
    return (_FIXTURE_DIR / name).read_text(encoding="utf-8")


# Expected values for each fixture. These match the values the fixtures
# were hand-built with; the extractor must recover them from whichever
# data source the fixture exposes (JSON-LD, Redux/__INITIAL_STATE__,
# or plain HTML).
_EXPECTED: Mapping[str, Mapping[str, object]] = {
    "redfin_condo_miami_beach.html": {
        "source_url": "https://www.redfin.com/FL/Miami-Beach/1420-Ocean-Dr-33139/unit-402/home/20000001",
        "city": "Miami Beach",
        "state": "FL",
        "postal_code": "33139",
        "price_usd": 725_000,
        "beds": 2.0,
        "baths": 2.0,
        "living_area_sqft": 1_150,
        "year_built": 2016,
        "property_type": "condo",
    },
    "redfin_sfh_weston.html": {
        "source_url": "https://www.redfin.com/FL/Weston/2885-Lakeside-Pl-33326/home/20000002",
        "city": "Weston",
        "state": "FL",
        "postal_code": "33326",
        "price_usd": 1_400_000,
        "beds": 5.0,
        "baths": 4.0,
        "living_area_sqft": 3_400,
        "year_built": 2010,
        "property_type": "single_family",
    },
    "redfin_new_construction_parkland.html": {
        "source_url": "https://www.redfin.com/FL/Parkland/14500-Heron-Bay-Blvd-33076/home/20000004",
        "city": "Parkland",
        "state": "FL",
        "postal_code": "33076",
        "price_usd": 1_850_000,
        "beds": 6.0,
        "baths": 5.0,
        "living_area_sqft": 4_200,
        "year_built": 2026,
        "property_type": "new_construction",
    },
    "redfin_sfh_cutler_bay.html": {
        "source_url": "https://www.redfin.com/FL/Cutler-Bay/19850-Old-Cutler-Rd-33189/home/20000005",
        "city": "Cutler Bay",
        "state": "FL",
        "postal_code": "33189",
        "price_usd": 485_000,
        "beds": 4.0,
        "baths": 3.0,
        "living_area_sqft": 1_680,
        "year_built": 2000,
        "property_type": "single_family",
    },
    "redfin_townhome_delray.html": {
        "source_url": "https://www.redfin.com/FL/Delray-Beach/710-Palm-Trail-33444/home/20000003",
        "city": "Delray Beach",
        "state": "FL",
        "postal_code": "33444",
        "price_usd": 620_000,
        "beds": 3.0,
        "baths": 2.5,
        "living_area_sqft": 1_850,
        "year_built": 2018,
        "property_type": "townhouse",
    },
}


class TestHappyPath:
    """End-to-end extraction per fixture — every expected field round-trips."""

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_fixture_extraction(self, fixture: str) -> None:
        html = _load(fixture)
        exp = _EXPECTED[fixture]
        url = str(exp["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert isinstance(prop, CanonicalProperty)
        assert prop.city == exp["city"]
        assert prop.state == exp["state"]
        assert prop.postal_code == exp["postal_code"]
        assert prop.price_usd == exp["price_usd"]
        assert prop.beds == exp["beds"]
        assert prop.baths == exp["baths"]
        assert prop.living_area_sqft == exp["living_area_sqft"]
        assert prop.year_built == exp["year_built"]
        assert prop.property_type == exp["property_type"]


class TestSourceMetadata:
    """Every successful extraction carries source + extraction-time metadata."""

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_source_platform_is_redfin(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.source_platform == "redfin"

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_source_url_round_trip(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.source_url == url

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_extracted_at_is_recent_and_aware(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        before = datetime.now(UTC)
        prop = RedfinExtractor().extract(html=html, source_url=url)
        after = datetime.now(UTC)
        assert prop.extracted_at.tzinfo is not None
        assert before - timedelta(seconds=60) <= prop.extracted_at <= after + timedelta(seconds=60)


class TestJsonLdPrimary:
    """Fixtures with rich JSON-LD use that path as the primary source."""

    def test_json_ld_populates_core_fields(self) -> None:
        html = _load("redfin_condo_miami_beach.html")
        # Precondition: fixture has JSON-LD.
        assert "application/ld+json" in html
        url = str(_EXPECTED["redfin_condo_miami_beach.html"]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 725_000
        assert prop.beds == 2.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1_150
        assert prop.year_built == 2016
        assert prop.city == "Miami Beach"
        assert prop.state == "FL"
        assert prop.postal_code == "33139"


class TestReduxFallback:
    """Fixtures missing JSON-LD fall back to the Redux / __INITIAL_STATE__ blob."""

    def test_cutler_bay_uses_redux_state(self) -> None:
        html = _load("redfin_sfh_cutler_bay.html")
        # Precondition: fixture deliberately has no JSON-LD but has Redux.
        assert "application/ld+json" not in html
        assert "__INITIAL_STATE__" in html

        url = str(_EXPECTED["redfin_sfh_cutler_bay.html"]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 485_000
        assert prop.beds == 4.0
        assert prop.baths == 3.0
        assert prop.living_area_sqft == 1_680
        assert prop.year_built == 2000
        assert prop.city == "Cutler Bay"
        assert prop.state == "FL"
        assert prop.postal_code == "33189"


class TestHtmlFallback:
    """Fixtures missing JSON-LD + Redux fall back to HTML meta + lxml XPath."""

    def test_delray_uses_html_only(self) -> None:
        html = _load("redfin_townhome_delray.html")
        # Precondition: this fixture has no structured data at all.
        assert "application/ld+json" not in html
        assert "__INITIAL_STATE__" not in html
        assert "reactServerState" not in html

        url = str(_EXPECTED["redfin_townhome_delray.html"]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 620_000
        assert prop.beds == 3.0
        assert prop.baths == 2.5
        assert prop.living_area_sqft == 1_850
        assert prop.year_built == 2018
        assert prop.city == "Delray Beach"
        assert prop.state == "FL"
        assert prop.postal_code == "33444"
        assert prop.property_type == "townhouse"


class TestSchemaShift:
    """Unrecognised markup raises :class:`SchemaShiftError` with snippet attached."""

    def test_unrelated_content_raises_schema_shift(self) -> None:
        url = "https://www.redfin.com/FL/Miami/bogus/home/99999999"
        html = "<html><body>nothing</body></html>"
        with pytest.raises(SchemaShiftError) as excinfo:
            RedfinExtractor().extract(html=html, source_url=url)
        err = excinfo.value
        assert err.portal == "redfin"
        assert err.url == url
        # Snippet clipped to 200 chars.
        if err.raw_snippet is not None:
            assert len(err.raw_snippet) <= 200


class TestMalformedHtml:
    """Completely un-parseable bytes raise :class:`MalformedHTMLError`."""

    def test_empty_string_raises(self) -> None:
        with pytest.raises(MalformedHTMLError):
            RedfinExtractor().extract(
                html="",
                source_url="https://www.redfin.com/FL/Miami/empty/home/1",
            )

    def test_garbage_bytes_raise(self) -> None:
        garbage = (b"\x00\xff" * 10).decode("latin-1")
        with pytest.raises(MalformedHTMLError):
            RedfinExtractor().extract(
                html=garbage,
                source_url="https://www.redfin.com/FL/Miami/garbage/home/2",
            )


class TestPropertyTypeNormalization:
    """Raw Redfin portal values normalise to canonical strings."""

    @pytest.mark.parametrize(
        ("fixture", "expected_type"),
        [
            ("redfin_condo_miami_beach.html", "condo"),
            ("redfin_sfh_weston.html", "single_family"),
            ("redfin_townhome_delray.html", "townhouse"),
            ("redfin_new_construction_parkland.html", "new_construction"),
            ("redfin_sfh_cutler_bay.html", "single_family"),
        ],
    )
    def test_property_type_normalized(self, fixture: str, expected_type: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.property_type == expected_type

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Condo/Co-op", "condo"),
            ("Single Family Residential", "single_family"),
            ("Townhouse", "townhouse"),
            ("Multi-family", "multi_family"),
            ("NEW_CONSTRUCTION", "new_construction"),
        ],
    )
    def test_raw_redfin_values_normalize(self, raw: str, expected: str) -> None:
        assert _normalize_property_type(raw) == expected


class TestListingIdBackfill:
    """Listing ID is backfilled from ``/home/<id>`` URL segment when parsers don't supply one."""

    def test_listing_id_backfilled_from_url_on_html_fallback(self) -> None:
        """HTML fallback (no structured data) still pulls listing_id from the URL segment."""
        html = """<!DOCTYPE html>
<html><head>
<meta property="og:title" content="789 Backfill Rd, Fort Myers, FL 33901">
<meta name="twitter:data1" content="$395,000">
<meta name="twitter:data2" content="3 bd / 2 ba">
</head><body>
<main>
<h1>789 Backfill Rd, Fort Myers, FL 33901</h1>
<div class="home-main-stats-variant">
<span class="street-address">789 Backfill Rd</span>
<span class="citystatezip">Fort Myers, FL 33901</span>
<div class="homecard-price">$395,000</div>
<div class="stat-block"><div class="statsValue">3</div><div class="statsLabel">Beds</div></div>
<div class="stat-block"><div class="statsValue">2</div><div class="statsLabel">Baths</div></div>
<div class="stat-block"><div class="statsValue">1,500</div><div class="statsLabel">Sq Ft</div></div>
</div>
<div class="home-facts">
<div class="home-facts-row">
<span class="home-facts-label">Year Built</span>
<span class="home-facts-value">2005</span>
</div>
<div class="home-facts-row">
<span class="home-facts-label">Property Type</span>
<span class="home-facts-value">Single Family Residential</span>
</div>
</div>
</main>
</body></html>"""
        url = "https://www.redfin.com/FL/Fort-Myers/789-Backfill-Rd-33901/home/12345678"
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.listing_id == "12345678"


class TestListingIdFromReduxWinsOverUrl:
    """When Redux provides a propertyId it must not be overwritten by the URL segment."""

    def test_redux_property_id_wins_over_url(self) -> None:
        base = _load("redfin_sfh_cutler_bay.html")
        # Real Redux propertyId is 20000005 per the fixture.
        # Swap the URL's /home/<id> to something different to prove Redux wins.
        url = "https://www.redfin.com/FL/Cutler-Bay/19850-Old-Cutler-Rd-33189/home/99999999"
        prop = RedfinExtractor().extract(html=base, source_url=url)
        assert prop.listing_id == "20000005"


class TestPhotos:
    """At least one fixture yields ≥ 3 :class:`PropertyPhoto` entries."""

    def test_condo_has_three_or_more_photos(self) -> None:
        html = _load("redfin_condo_miami_beach.html")
        url = str(_EXPECTED["redfin_condo_miami_beach.html"]["source_url"])
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert len(prop.photos) >= 3
        for photo in prop.photos:
            assert isinstance(photo, PropertyPhoto)
            assert photo.url.startswith("http")


class TestReduxDecoyDoesNotPoison:
    """A decoy ``__INITIAL_STATE__`` string literal must not poison Redux state extraction."""

    def test_decoy_script_is_ignored(self) -> None:
        base = _load("redfin_townhome_delray.html")
        # Inject a decoy string-literal mention before the body.
        decoy = (
            "<script>var x = \"window.__INITIAL_STATE__ = { "
            "bad: true };\";</script>"
        )
        html = base.replace("</head>", decoy + "</head>")

        url = str(_EXPECTED["redfin_townhome_delray.html"]["source_url"])
        # The decoy must be ignored and the existing HTML fallback path must
        # still recover real townhome numbers.
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 620_000
        assert prop.beds == 3.0
        assert prop.baths == 2.5
        assert prop.living_area_sqft == 1_850
        assert prop.city == "Delray Beach"
