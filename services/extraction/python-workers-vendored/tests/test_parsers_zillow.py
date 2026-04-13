"""Tests for the deterministic Zillow extractor in :mod:`parsers.zillow`.

Fixtures live under ``python-workers/fixtures/html/zillow/`` and are loaded by
``pathlib`` — no network, no mocks of the parser itself. The parser is run for
real and we assert on the :class:`CanonicalProperty` output.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from common.parser_errors import MalformedHTMLError, SchemaShiftError
from common.property import CanonicalProperty, PropertyPhoto
from parsers.zillow import (
    ZillowExtractor,
    _first_int,
    _normalize_property_type,
    _parse_address_line,
    _parse_beds_baths_sqft,
    _parse_price,
    _to_float,
    _to_int,
)

if TYPE_CHECKING:
    from collections.abc import Mapping


_FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "html" / "zillow"


def _load(name: str) -> str:
    """Read a Zillow fixture by filename."""
    return (_FIXTURE_DIR / name).read_text(encoding="utf-8")


# Expected values for each fixture. These match the values the fixtures were
# hand-built with; the extractor must recover them from whichever data source
# the fixture exposes (JSON-LD, Apollo state, or plain HTML).
#
# Keys intentionally mirror the CanonicalProperty field names.
_EXPECTED: Mapping[str, Mapping[str, object]] = {
    "zillow_condo_miami.html": {
        "source_url": "https://www.zillow.com/homedetails/482-Bayshore-Ct-UNIT-1204-Miami-FL-33131/10000001_zpid/",
        "city": "Miami",
        "state": "FL",
        "postal_code": "33131",
        "price_usd": 675_000,
        "beds": 2.0,
        "baths": 2.0,
        "living_area_sqft": 1080,
        "year_built": 2018,
        "property_type": "condo",
    },
    "zillow_sfh_boca_raton.html": {
        "source_url": "https://www.zillow.com/homedetails/7421-Mirabella-Way-Boca-Raton-FL-33433/20000002_zpid/",
        "city": "Boca Raton",
        "state": "FL",
        "postal_code": "33433",
        "price_usd": 1_250_000,
        "beds": 4.0,
        "baths": 3.0,
        "living_area_sqft": 2800,
        "year_built": 2005,
        "property_type": "single_family",
    },
    "zillow_new_construction_doral.html": {
        "source_url": "https://www.zillow.com/homedetails/9088-Palmera-Isle-Blvd-Doral-FL-33172/40000004_zpid/",
        "city": "Doral",
        "state": "FL",
        "postal_code": "33172",
        "price_usd": 1_450_000,
        "beds": 5.0,
        "baths": 4.0,
        "living_area_sqft": 3400,
        "year_built": 2026,
        "property_type": "new_construction",
    },
    "zillow_sfh_homestead.html": {
        "source_url": "https://www.zillow.com/homedetails/2644-SW-145th-Pl-Homestead-FL-33032/50000005_zpid/",
        "city": "Homestead",
        "state": "FL",
        "postal_code": "33032",
        "price_usd": 395_000,
        "beds": 3.0,
        "baths": 2.0,
        "living_area_sqft": 1440,
        "year_built": 1998,
        "property_type": "single_family",
    },
    "zillow_townhome_fort_lauderdale.html": {
        "source_url": "https://www.zillow.com/homedetails/1150-Riverwalk-Ln-Fort-Lauderdale-FL-33301/30000003_zpid/",
        "city": "Fort Lauderdale",
        "state": "FL",
        "postal_code": "33301",
        "price_usd": 540_000,
        "beds": 3.0,
        "baths": 2.5,
        "living_area_sqft": 1750,
        "year_built": 2015,
        "property_type": "townhouse",
    },
}


class TestHappyPath:
    """End-to-end extraction for each fixture — every expected field round-trips."""

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_fixture_extraction(self, fixture: str) -> None:
        html = _load(fixture)
        exp = _EXPECTED[fixture]
        url = str(exp["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
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
    def test_source_platform_is_zillow(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.source_platform == "zillow"

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_source_url_round_trip(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.source_url == url

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_extracted_at_is_recent_and_aware(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        before = datetime.now(UTC)
        prop = ZillowExtractor().extract(html=html, source_url=url)
        after = datetime.now(UTC)
        assert prop.extracted_at.tzinfo is not None
        # Generous tolerance — just ensure it's within a few seconds.
        assert before - timedelta(seconds=60) <= prop.extracted_at <= after + timedelta(seconds=60)


class TestJsonLdPrimary:
    """Fixtures with rich JSON-LD use that path as the primary source.

    Sanity check: if we scrub out Apollo state and body HTML, JSON-LD alone
    should still be enough for the core fields.
    """

    def test_json_ld_alone_sufficient_for_condo(self) -> None:
        html = _load("zillow_condo_miami.html")
        # Remove the Apollo script block. The JSON-LD block and body meta
        # tags remain; the extractor must succeed via JSON-LD.
        marker = "var hdpApolloPreloadedData"
        idx = html.find(marker)
        assert idx != -1, "Apollo marker missing from fixture"
        start = html.rfind("<script>", 0, idx)
        end = html.find("</script>", idx)
        assert start != -1 and end != -1
        stripped = html[:start] + html[end + len("</script>") :]
        assert "hdpApolloPreloadedData" not in stripped

        url = str(_EXPECTED["zillow_condo_miami.html"]["source_url"])
        prop = ZillowExtractor().extract(html=stripped, source_url=url)
        assert prop.price_usd == 675_000
        assert prop.beds == 2.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1080
        assert prop.year_built == 2018
        assert prop.city == "Miami"
        assert prop.state == "FL"
        assert prop.postal_code == "33131"


class TestNextDataPrimary:
    """Real Zillow listings use the Next.js ``__NEXT_DATA__`` blob.

    These fixtures were captured from production Zillow HDP pages in 2026.
    Unlike the hand-built fixtures above (which exercise the legacy
    ``hdpApolloPreloadedData`` path), these reflect Zillow's current
    frontend: every core field must round-trip from the SSR state.
    """

    def test_miami_beach_luxury_sfh(self) -> None:
        html = _load("zillow_real_miami_beach_20260413.html")
        assert "__NEXT_DATA__" in html
        url = "https://www.zillow.com/homedetails/43895349_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)

        assert prop.address_line1 == "217 E Rivo Alto Dr"
        assert prop.city == "Miami Beach"
        assert prop.state == "FL"
        assert prop.postal_code == "33139"
        assert prop.price_usd == 45_000_000
        assert prop.beds == 6.0
        assert prop.baths == 7.0
        assert prop.living_area_sqft == 8393
        assert prop.property_type == "single_family"
        assert prop.days_on_market == 87
        assert prop.description is not None and len(prop.description) > 50
        assert len(prop.photos) >= 10
        assert prop.photos[0].url.startswith("http")
        assert prop.latitude is not None and prop.longitude is not None
        assert prop.listing_id == "43895349"

    def test_miami_beach_condo(self) -> None:
        html = _load("zillow_real_miami_condo_20260413.html")
        assert "__NEXT_DATA__" in html
        url = "https://www.zillow.com/homedetails/247700480_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)

        assert prop.address_line1 == "1215 West Ave #402"
        assert prop.city == "Miami Beach"
        assert prop.state == "FL"
        assert prop.postal_code == "33139"
        assert prop.price_usd == 280_000
        assert prop.beds == 1.0
        assert prop.baths == 1.0
        assert prop.living_area_sqft == 520
        assert prop.property_type == "condo"
        assert prop.days_on_market == 23
        assert prop.hoa_monthly_usd == 1076
        assert prop.description is not None and len(prop.description) > 50
        assert len(prop.photos) >= 10
        assert prop.listing_id == "247700480"

    def test_next_data_yields_required_fields_without_apollo_or_json_ld(self) -> None:
        """The Next.js path alone must populate every required field.

        Real fixtures contain only a ``__NEXT_DATA__`` blob — no Apollo
        preload, no JSON-LD. This guards against regressions that would
        make the parser silently fall back to empty HTML-only extraction.
        """
        html = _load("zillow_real_miami_beach_20260413.html")
        assert "hdpApolloPreloadedData" not in html
        assert "application/ld+json" not in html
        prop = ZillowExtractor().extract(
            html=html,
            source_url="https://www.zillow.com/homedetails/43895349_zpid/",
        )
        for field_name in (
            "address_line1",
            "city",
            "state",
            "postal_code",
            "price_usd",
            "beds",
            "baths",
            "living_area_sqft",
        ):
            assert getattr(prop, field_name) is not None, (
                f"{field_name} must populate from __NEXT_DATA__ alone"
            )


class TestApolloFallback:
    """Fixtures missing JSON-LD fall back to the Apollo preload state."""

    def test_homestead_uses_apollo_state(self) -> None:
        html = _load("zillow_sfh_homestead.html")
        # Precondition: fixture deliberately has no JSON-LD.
        assert "application/ld+json" not in html
        assert "hdpApolloPreloadedData" in html

        url = str(_EXPECTED["zillow_sfh_homestead.html"]["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 395_000
        assert prop.beds == 3.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1440
        assert prop.year_built == 1998
        assert prop.city == "Homestead"
        assert prop.state == "FL"
        assert prop.postal_code == "33032"


class TestHtmlFallback:
    """Fixtures missing JSON-LD + Apollo fall back to HTML meta + XPath."""

    def test_fort_lauderdale_uses_html_only(self) -> None:
        html = _load("zillow_townhome_fort_lauderdale.html")
        # Precondition: this fixture has no structured data.
        assert "application/ld+json" not in html
        assert "hdpApolloPreloadedData" not in html

        url = str(_EXPECTED["zillow_townhome_fort_lauderdale.html"]["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 540_000
        assert prop.beds == 3.0
        assert prop.baths == 2.5
        assert prop.living_area_sqft == 1750
        assert prop.year_built == 2015
        assert prop.city == "Fort Lauderdale"
        assert prop.state == "FL"
        assert prop.postal_code == "33301"
        assert prop.property_type == "townhouse"


class TestSchemaShift:
    """Unrecognised markup raises :class:`SchemaShiftError` with snippet attached."""

    def test_unrelated_content_raises_schema_shift(self) -> None:
        url = "https://www.zillow.com/homedetails/bogus/"
        html = "<html><body>unrelated content</body></html>"
        with pytest.raises(SchemaShiftError) as excinfo:
            ZillowExtractor().extract(html=html, source_url=url)
        err = excinfo.value
        assert err.portal == "zillow"
        assert err.url == url
        # snippet is clipped to 200 chars
        if err.raw_snippet is not None:
            assert len(err.raw_snippet) <= 200


class TestMalformedHtml:
    """Completely un-parseable bytes raise :class:`MalformedHTMLError`."""

    def test_empty_string_raises(self) -> None:
        with pytest.raises(MalformedHTMLError):
            ZillowExtractor().extract(
                html="",
                source_url="https://www.zillow.com/homedetails/empty/",
            )

    def test_garbage_bytes_raise(self) -> None:
        garbage = (b"\x00\xff" * 10).decode("latin-1")
        with pytest.raises(MalformedHTMLError):
            ZillowExtractor().extract(
                html=garbage,
                source_url="https://www.zillow.com/homedetails/garbage/",
            )


class TestPropertyTypeNormalization:
    """Raw portal values normalise to canonical strings."""

    @pytest.mark.parametrize(
        ("fixture", "expected_type"),
        [
            ("zillow_condo_miami.html", "condo"),
            ("zillow_sfh_boca_raton.html", "single_family"),
            ("zillow_townhome_fort_lauderdale.html", "townhouse"),
            ("zillow_new_construction_doral.html", "new_construction"),
            ("zillow_sfh_homestead.html", "single_family"),
        ],
    )
    def test_property_type_normalized(self, fixture: str, expected_type: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.property_type == expected_type


class TestPhotos:
    """At least one fixture yields ≥ 3 :class:`PropertyPhoto` entries."""

    def test_condo_has_three_or_more_photos(self) -> None:
        html = _load("zillow_condo_miami.html")
        url = str(_EXPECTED["zillow_condo_miami.html"]["source_url"])
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert len(prop.photos) >= 3
        for photo in prop.photos:
            assert isinstance(photo, PropertyPhoto)
            assert photo.url.startswith("http")


class TestNormalizePropertyType:
    """``_normalize_property_type`` covers every mapping key + fallthrough."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("CONDO", "condo"),
            ("Condo", "condo"),
            ("Condominium", "condo"),
            ("SingleFamilyResidence", "single_family"),
            ("SINGLE_FAMILY", "single_family"),
            ("House", "single_family"),
            ("Townhouse", "townhouse"),
            ("Townhome", "townhouse"),
            ("NEW_CONSTRUCTION", "new_construction"),
            ("new construction", "new_construction"),
            ("new-construction", "new_construction"),
            ("MULTI_FAMILY", "multi_family"),
            ("Duplex", "multi_family"),
            ("Triplex", "multi_family"),
            ("Fourplex", "multi_family"),
            ("Land", "land"),
            ("VacantLand", "land"),
        ],
    )
    def test_known_portal_values_normalize(self, raw: str, expected: str) -> None:
        assert _normalize_property_type(raw) == expected

    def test_unknown_type_falls_through_to_slugified_lower(self) -> None:
        # Unknown type should not raise — returns the slugified value so the
        # downstream caller can decide how to handle it.
        assert _normalize_property_type("Penthouse") == "penthouse"

    def test_none_returns_none(self) -> None:
        assert _normalize_property_type(None) is None

    def test_empty_returns_none(self) -> None:
        assert _normalize_property_type("") is None
        assert _normalize_property_type("   ") is None


class TestNumericHelpers:
    """Scalar conversion helpers handle strings, floats, and junk."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (None, None),
            (True, None),  # bool sneaks through ``isinstance(int)``
            (False, None),
            (42, 42),
            (42.7, 42),
            ("1,250,000", 1_250_000),
            ("$540,000", 540_000),
            ("no digits here", None),
        ],
    )
    def test_to_int(self, value: object, expected: int | None) -> None:
        assert _to_int(value) == expected

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (None, None),
            (True, None),
            (3, 3.0),
            (2.5, 2.5),
            ("2.5", 2.5),
            ("1,500", 1500.0),
            ("not a number", None),
        ],
    )
    def test_to_float(self, value: object, expected: float | None) -> None:
        assert _to_float(value) == expected

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("$285/mo", 285),
            ("18 days on Zillow", 18),
            ("no digits", None),
            ("1,234 foo", 1234),
        ],
    )
    def test_first_int(self, text: str, expected: int | None) -> None:
        assert _first_int(text) == expected

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("$540,000", 540_000),
            ("$1,250,000", 1_250_000),
            ("no price here", None),
        ],
    )
    def test_parse_price(self, text: str, expected: int | None) -> None:
        assert _parse_price(text) == expected


class TestAddressParsing:
    """``_parse_address_line`` splits an h1 string into structured parts."""

    def test_happy_path(self) -> None:
        parsed = _parse_address_line("7421 Mirabella Way, Boca Raton, FL 33433")
        assert parsed == {
            "address_line1": "7421 Mirabella Way",
            "city": "Boca Raton",
            "state": "FL",
            "postal_code": "33433",
        }

    @pytest.mark.parametrize(
        "bad",
        [
            "not an address",
            "1234 Main St",  # no city/state/zip
            "Boca Raton, FL",  # no street / zip
        ],
    )
    def test_garbage_returns_none(self, bad: str) -> None:
        assert _parse_address_line(bad) is None


class TestBedsBathsSqft:
    """``_parse_beds_baths_sqft`` handles the span-text composite field."""

    def test_full_line(self) -> None:
        out = _parse_beds_baths_sqft("3 bd | 2.5 ba | 1,750 sqft")
        assert out == {"beds": 3.0, "baths": 2.5, "living_area_sqft": 1750}

    def test_missing_sqft(self) -> None:
        out = _parse_beds_baths_sqft("4 bd | 3 ba")
        assert out == {"beds": 4.0, "baths": 3.0}

    def test_empty_returns_empty(self) -> None:
        assert _parse_beds_baths_sqft("") == {}


class TestAssembleRequiresFields:
    """``_assemble`` raises ``SchemaShiftError`` when a required field is missing."""

    def test_missing_price_raises(self) -> None:
        html = """<!DOCTYPE html>
<html><head>
<meta property="og:title" content="1 Test St, Miami, FL 33101">
</head>
<body>
<main><h1>1 Test St, Miami, FL 33101</h1></main>
</body></html>"""
        url = "https://www.zillow.com/homedetails/1-test-st/9000_zpid/"
        with pytest.raises(SchemaShiftError) as excinfo:
            ZillowExtractor().extract(html=html, source_url=url)
        err = excinfo.value
        assert err.portal == "zillow"
        assert err.url == url
        # The missing field should be one of the required identity/price keys.
        assert err.field in {"address_line1", "city", "state", "postal_code", "price_usd"}


class TestJsonLdListAndEdgeCases:
    """JSON-LD decoder handles offers-as-list, image-as-string, and list @type."""

    def test_offers_as_list(self) -> None:
        html = """<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@type": ["Product", "RealEstateListing"],
  "address": {
    "streetAddress": "1 Offer Ln",
    "addressLocality": "Miami",
    "addressRegion": "FL",
    "postalCode": "33101"
  },
  "offers": [{"price": 500000, "priceCurrency": "USD"}],
  "image": "https://photos.zillowstatic.com/fp/solo.jpg"
}
</script>
</head><body><main></main></body></html>"""
        url = "https://www.zillow.com/homedetails/1-offer-ln/1234_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 500_000
        assert prop.address_line1 == "1 Offer Ln"
        assert prop.city == "Miami"
        # image-as-string should produce a single-photo tuple
        assert any(p.url == "https://photos.zillowstatic.com/fp/solo.jpg" for p in prop.photos)

    def test_malformed_json_ld_is_skipped(self) -> None:
        # The malformed JSON-LD block should be skipped; valid data sources
        # (HTML fallback here) should still succeed.
        html = """<!DOCTYPE html>
<html><head>
<script type="application/ld+json">{ not valid json }</script>
<meta name="twitter:data1" content="$650,000">
</head>
<body>
<main>
<h1>99 Fallback Ct, Tampa, FL 33602</h1>
<span data-testid="price">$650,000</span>
<span data-testid="bed-bath-beyond">3 bd | 2 ba | 1,500 sqft</span>
</main>
</body></html>"""
        url = "https://www.zillow.com/homedetails/99-fallback-ct/5555_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 650_000
        assert prop.city == "Tampa"


class TestHtmlFallbackPriceSpan:
    """HTML fallback uses the ``<span data-testid="price">`` when the twitter meta is absent."""

    def test_span_price_used_when_meta_missing(self) -> None:
        html = """<!DOCTYPE html>
<html><head></head><body>
<main>
<h1>123 Span St, Orlando, FL 32801</h1>
<span data-testid="price">$485,000</span>
<span data-testid="bed-bath-beyond">3 bd | 2 ba | 1,600 sqft</span>
</main>
</body></html>"""
        url = "https://www.zillow.com/homedetails/123-span-st/6666_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 485_000
        assert prop.city == "Orlando"

    def test_non_numeric_twitter_meta_falls_through_to_span(self) -> None:
        """Regression: twitter:data1="Contact agent" must not skip the span fallback.

        Previously, a non-numeric meta value wrote ``price_usd=None`` and the
        ``"price_usd" not in out`` check short-circuited the span parse,
        causing SchemaShiftError on listings that only carry the visible
        price in the span.
        """
        html = """<!DOCTYPE html>
<html><head>
<meta name="twitter:data1" content="Contact agent">
</head><body>
<main>
<h1>456 Span Ave, Miami, FL 33131</h1>
<span data-testid="price">$625,000</span>
<span data-testid="bed-bath-beyond">2 bd | 2 ba | 1,100 sqft</span>
</main>
</body></html>"""
        url = "https://www.zillow.com/homedetails/456-span-ave/7777_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 625_000
        assert prop.listing_id == "7777"


class TestListingIdBackfill:
    """Listing ID is backfilled from the source URL when parsers don't provide one."""

    def test_listing_id_backfilled_from_url_on_html_fallback(self) -> None:
        html = """<!DOCTYPE html>
<html><head>
<meta name="twitter:data1" content="$395,000">
</head><body>
<h1>789 Backfill Rd, Fort Myers, FL 33901</h1>
<span data-testid="bed-bath-beyond">3 bd | 2 ba | 1,500 sqft</span>
</body></html>"""
        url = "https://www.zillow.com/homedetails/789-backfill-rd/12345678_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.listing_id == "12345678"

    def test_listing_id_none_when_url_has_no_zpid(self) -> None:
        html = """<!DOCTYPE html>
<html><head>
<meta name="twitter:data1" content="$200,000">
</head><body>
<h1>1 Noid Way, Tampa, FL 33602</h1>
<span data-testid="bed-bath-beyond">1 bd | 1 ba | 600 sqft</span>
</body></html>"""
        url = "https://www.zillow.com/homedetails/1-noid-way/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.listing_id is None

    def test_listing_id_from_apollo_wins_over_url(self) -> None:
        """When Apollo provides a listing_id it must not be overwritten by the URL."""
        base = _load("zillow_sfh_homestead.html")
        # Change the URL's zpid to something different from Apollo's zpid
        # (50000005) to prove Apollo wins.
        url = "https://www.zillow.com/homedetails/homestead-fl/99999999_zpid/"
        prop = ZillowExtractor().extract(html=base, source_url=url)
        assert prop.listing_id == "50000005"


class TestApolloDecoyDoesNotPoison:
    """A decoy ``hdpApolloPreloadedData`` inside a string literal must not poison Apollo parsing.

    If the extractor's regex is greedy or not anchored to a real assignment, a
    malicious or coincidental script like ``var x = "hdpApolloPreloadedData = {
    bad: 'data' };"`` could be mis-matched. This test guards that seam.
    """

    def test_decoy_script_is_ignored(self) -> None:
        base = _load("zillow_townhome_fort_lauderdale.html")
        # Inject a decoy *before* the body — a string literal mentioning the
        # Apollo marker. This must not poison Apollo extraction.
        decoy = (
            "<script>var x = \"hdpApolloPreloadedData = { "
            "bad: 'data' };\";</script>"
        )
        html = base.replace("</head>", decoy + "</head>")

        url = str(_EXPECTED["zillow_townhome_fort_lauderdale.html"]["source_url"])
        # Either the extractor ignores the decoy and falls back to HTML meta
        # (the correct behaviour), or it mistakenly parses ``bad: 'data'`` as
        # the Apollo state — in which case the price/beds/baths will not
        # match the townhome's real numbers.
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 540_000
        assert prop.beds == 3.0
        assert prop.baths == 2.5
        assert prop.living_area_sqft == 1750
        assert prop.city == "Fort Lauderdale"


class TestCompactPriceFormats:
    """Regression: compact shorthand prices like $1.2M must not truncate to 1.

    Previously the price regex was ``\\$?([\\d,]+)`` which stops at the
    first non-digit/comma, so ``$1.2M`` matched just ``1`` and ``_parse_price``
    accepted it — silently corrupting price data. The fix adds an optional
    K/M/B suffix and rejects unsuffixed decimals.
    """

    @pytest.mark.parametrize(
        ("price_text", "expected"),
        [
            ("$1.2M", 1_200_000),
            ("$750K", 750_000),
            ("$1.25M", 1_250_000),
            ("$1,250,000", 1_250_000),
            ("$675,000", 675_000),
            ("$1.5B", 1_500_000_000),
            ("1.2m", 1_200_000),  # lowercase suffix
            ("$2M", 2_000_000),
            ("$999K", 999_000),
        ],
    )
    def test_compact_price_parses(self, price_text: str, expected: int) -> None:
        html = f"""<!DOCTYPE html>
<html><head>
<meta name="twitter:data1" content="{price_text}">
</head><body>
<h1>100 Compact Way, Miami, FL 33131</h1>
<span data-testid="bed-bath-beyond">2 bd | 2 ba | 1,100 sqft</span>
</body></html>"""
        url = "https://www.zillow.com/homedetails/100-compact-way/1111_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == expected

    def test_bare_decimal_without_suffix_rejects(self) -> None:
        """A bare ``1.2`` with no K/M/B suffix is not a valid USD price."""
        html = """<!DOCTYPE html>
<html><head>
<meta name="twitter:data1" content="1.2">
</head><body>
<h1>200 Bare Rd, Miami, FL 33131</h1>
<span data-testid="price">$850,000</span>
<span data-testid="bed-bath-beyond">2 bd | 2 ba | 1,100 sqft</span>
</body></html>"""
        url = "https://www.zillow.com/homedetails/200-bare-rd/2222_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        # Span price ($850,000) must be used since meta is unparseable.
        assert prop.price_usd == 850_000


class TestJsonLdTypeAsList:
    """Regression: JSON-LD @type as list must not produce junk property_type.

    schema.org allows ``"@type": ["Product", "RealEstateListing",
    "SingleFamilyResidence"]``. Previously the parser passed the raw list
    to ``_normalize_property_type``, which stringified it to a value like
    ``"['product',_'realestatelisting'...]"``. Because JSON-LD merge
    order preferred earlier values, this junk then overrode Apollo's
    ``homeType`` and persisted into ``CanonicalProperty``.
    """

    def test_list_type_picks_specific_residential(self) -> None:
        html = """<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["Product", "RealEstateListing", "SingleFamilyResidence"],
  "name": "Nice house",
  "address": {
    "streetAddress": "500 ListType Ln",
    "addressLocality": "Miami",
    "addressRegion": "FL",
    "postalCode": "33131"
  },
  "offers": {"@type": "Offer", "price": 950000}
}
</script>
</head><body>
<h1>500 ListType Ln, Miami, FL 33131</h1>
</body></html>"""
        url = "https://www.zillow.com/homedetails/500-listtype-ln/3333_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 950_000
        assert prop.property_type == "single_family"

    def test_list_type_falls_back_to_last_when_no_match(self) -> None:
        """When no list entry matches a known type, last string entry wins."""
        html = """<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["Product", "RealEstateListing", "CustomExoticType"],
  "name": "Unusual listing",
  "address": {
    "streetAddress": "600 Fallback Rd",
    "addressLocality": "Tampa",
    "addressRegion": "FL",
    "postalCode": "33602"
  },
  "offers": {"@type": "Offer", "price": 500000}
}
</script>
</head><body>
<h1>600 Fallback Rd, Tampa, FL 33602</h1>
</body></html>"""
        url = "https://www.zillow.com/homedetails/600-fallback-rd/4444_zpid/"
        prop = ZillowExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 500_000
        # Falls back to last-entry string, passed through normalizer's
        # lowercase path. Must NOT be a stringified list.
        assert prop.property_type is not None
        assert "[" not in prop.property_type
        assert "'" not in prop.property_type
