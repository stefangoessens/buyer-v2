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


class TestMultipleReduxBlobs:
    """Regression: malformed first `__INITIAL_STATE__` must fall through.

    Previously `_extract_embedded_state` used `search` and returned
    ``{}`` on the first `json.loads` failure. Pages that carry a stub
    dev-mode assignment followed by the real Redux blob would then
    incorrectly trip `SchemaShiftError`. The fix walks every match.
    """

    def test_malformed_first_blob_does_not_mask_valid_later_blob(self) -> None:
        # Build an HTML document with:
        #  1. A malformed `window.__INITIAL_STATE__ = {not json};` up top
        #  2. A valid `reactServerState = {...};` later that contains real data
        #  3. No JSON-LD and no Redfin HTML fallback classes
        malformed = 'window.__INITIAL_STATE__ = {not json};'
        valid = (
            'reactServerState = {"propertyInfo": {'
            '"propertyId": "99887766",'
            '"price": 815000,'
            '"beds": 4,'
            '"baths": 3,'
            '"sqFt": 2200,'
            '"yearBuilt": 2012,'
            '"propertyType": "Single Family Residential",'
            '"address": {'
            '"streetAddress": "888 Regression Ave",'
            '"city": "Coral Springs",'
            '"state": "FL",'
            '"zip": "33065"'
            '}}};'
        )
        html = (
            "<!DOCTYPE html><html><head>"
            f"<script>{malformed}</script>"
            f"<script>{valid}</script>"
            "</head><body></body></html>"
        )
        url = "https://www.redfin.com/FL/Coral-Springs/888-regression-ave/home/99887766"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        assert prop.price_usd == 815_000
        assert prop.beds == 4.0
        assert prop.baths == 3.0
        assert prop.living_area_sqft == 2_200
        assert prop.year_built == 2012
        assert prop.city == "Coral Springs"
        assert prop.listing_id == "99887766"


class TestZeroValuedReduxFields:
    """Regression: zero-valued numeric fields from Redux must not become None.

    Prior code used `a or b` chains which silently dropped legitimate
    zeros — a brand-new listing with `daysOnMarket=0`, a studio with
    `beds=0`, and a no-HOA property with `hoaDues=0` all fell back
    through to None, skewing downstream filters and ranking.
    """

    def test_zero_days_on_market_preserved(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<script>reactServerState = {"propertyInfo": {'
            '"propertyId": "11112222",'
            '"price": 500000,'
            '"beds": 0,'  # studio
            '"baths": 1,'
            '"sqFt": 450,'
            '"yearBuilt": 2022,'
            '"daysOnMarket": 0,'  # just-listed
            '"hoaDues": 0,'  # no HOA
            '"propertyType": "Condo/Co-op",'
            '"address": {'
            '"streetAddress": "1 Studio Way",'
            '"city": "Miami",'
            '"state": "FL",'
            '"zip": "33130"'
            '}}};</script>'
            "</head><body></body></html>"
        )
        url = "https://www.redfin.com/FL/Miami/1-studio-way/home/11112222"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        # The whole point: zeros must round-trip, not become None.
        assert prop.days_on_market == 0
        assert prop.beds == 0.0
        assert prop.hoa_monthly_usd == 0
        # Sanity: other fields also populated.
        assert prop.price_usd == 500_000
        assert prop.baths == 1.0
        assert prop.city == "Miami"


class TestJsonLdGenericTypeDoesNotLeak:
    """Regression: JSON-LD @type fallback must ignore generic container types.

    When `additionalType` is missing and `@type` is "RealEstateListing"
    (a generic schema.org container, not a residential sub-type), the
    parser previously stored `"realestatelisting"` as `property_type`.
    Because the merge uses `setdefault`, later Redux data couldn't
    correct it and downstream type-based filters would be wrong.
    """

    def test_generic_jsonld_type_does_not_override_redux(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<script type="application/ld+json">{'
            '"@context": "https://schema.org",'
            '"@type": "RealEstateListing",'
            '"name": "Generic",'
            '"address": {'
            '"streetAddress": "500 Generic St",'
            '"addressLocality": "Boca Raton",'
            '"addressRegion": "FL",'
            '"postalCode": "33432"'
            '},'
            '"offers": {"@type": "Offer", "price": 900000}'
            '}</script>'
            '<script>reactServerState = {"propertyInfo": {'
            '"propertyId": "55556666",'
            '"price": 900000,'
            '"beds": 3,'
            '"baths": 2,'
            '"sqFt": 2000,'
            '"propertyType": "Single Family Residential",'
            '"address": {'
            '"streetAddress": "500 Generic St",'
            '"city": "Boca Raton",'
            '"state": "FL",'
            '"zip": "33432"'
            '}}};</script>'
            "</head><body></body></html>"
        )
        url = "https://www.redfin.com/FL/Boca-Raton/500-generic-st/home/55556666"
        prop = RedfinExtractor().extract(html=html, source_url=url)
        # property_type must reflect the Redux value, NOT the generic
        # "realestatelisting" JSON-LD @type fallback.
        assert prop.property_type == "single_family"


class TestHtmlFallbackLotSize:
    """Regression: `.home-facts-row` lot size must populate `lot_size_sqft`.

    Previously the HTML fallback loop only handled year built, property
    type, HOA, and days on market — lot size rows were dropped even when
    present, degrading downstream comps and valuation.
    """

    def test_lot_size_sqft_from_home_facts_row(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<meta name="twitter:data1" content="$650,000">'
            "</head><body>"
            '<span class="street-address">123 LotSize Ct</span>'
            '<span class="citystatezip">Plantation, FL 33317</span>'
            '<div class="home-facts-row">'
            '<span class="home-facts-label">Lot Size</span>'
            '<span class="home-facts-value">8,712 sq ft</span>'
            "</div>"
            "</body></html>"
        )
        url = "https://www.redfin.com/FL/Plantation/123-lotsize-ct/home/77778888"
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.lot_size_sqft == 8_712

    def test_lot_size_acres_converted_to_sqft(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<meta name="twitter:data1" content="$1,250,000">'
            "</head><body>"
            '<span class="street-address">456 Acre Way</span>'
            '<span class="citystatezip">Parkland, FL 33076</span>'
            '<div class="home-facts-row">'
            '<span class="home-facts-label">Lot Size</span>'
            '<span class="home-facts-value">0.5 acres</span>'
            "</div>"
            "</body></html>"
        )
        url = "https://www.redfin.com/FL/Parkland/456-acre-way/home/99990000"
        prop = RedfinExtractor().extract(html=html, source_url=url)
        # 0.5 acres × 43,560 sqft/acre = 21,780 sqft.
        assert prop.lot_size_sqft == 21_780


class TestJsonLdMainEntityEdgeCases:
    """Regression: JSON-LD ``mainEntity`` (residence) overlay edge cases.

    The parser must perform a per-leaf merge where the residence node
    (``SingleFamilyResidence``, ``Apartment``, etc.) beats the outer
    ``Product``/listing node, while outer leaves that residence omits
    are still preserved. Image galleries from residence and outer are
    unioned, ``ImageObject`` dict entries must be resolved via ``url``
    or ``contentUrl``, and zero-valued numeric fields (e.g. studio with
    ``numberOfBedrooms: 0``) must round-trip instead of being dropped.
    """

    @staticmethod
    def _html_with_json_ld(payload: dict[str, object]) -> str:
        import json

        return (
            "<!DOCTYPE html><html><head>"
            '<script type="application/ld+json">'
            f"{json.dumps(payload)}"
            "</script></head><body></body></html>"
        )

    def test_main_entity_overlay_preserves_residence_fields(self) -> None:
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 875000},
            "image": "https://img.redfin.com/hero.jpg",
            "mainEntity": {
                "@type": "SingleFamilyResidence",
                "numberOfBedrooms": 4,
                "numberOfBathroomsTotal": 3,
                "floorSize": {
                    "@type": "QuantitativeValue",
                    "value": 2800,
                    "unitText": "sqft",
                },
                "yearBuilt": 2018,
                "geo": {
                    "@type": "GeoCoordinates",
                    "latitude": 25.77,
                    "longitude": -80.19,
                },
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "123 Coral Way",
                    "addressLocality": "Miami",
                    "addressRegion": "FL",
                    "postalCode": "33145",
                },
                "image": [
                    "https://img.redfin.com/p1.jpg",
                    "https://img.redfin.com/p2.jpg",
                    "https://img.redfin.com/p3.jpg",
                ],
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Miami/123-coral-way/home/30000001"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        assert prop.price_usd == 875_000
        assert prop.beds == 4.0
        assert prop.baths == 3.0
        assert prop.living_area_sqft == 2_800
        assert prop.year_built == 2018
        assert prop.latitude is not None
        assert prop.longitude is not None
        assert prop.address_line1 == "123 Coral Way"
        assert prop.city == "Miami"
        assert prop.state == "FL"
        assert prop.postal_code == "33145"

        photo_urls = {photo.url for photo in prop.photos}
        assert "https://img.redfin.com/p1.jpg" in photo_urls
        assert "https://img.redfin.com/p2.jpg" in photo_urls
        assert "https://img.redfin.com/p3.jpg" in photo_urls
        assert "https://img.redfin.com/hero.jpg" in photo_urls
        assert len(photo_urls) == 4

    def test_main_entity_image_union_prefers_residence_gallery_when_outer_is_smaller(
        self,
    ) -> None:
        residence_images = [
            f"https://img.redfin.com/r{i:02d}.jpg" for i in range(40)
        ]
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 950000},
            "image": ["https://img.redfin.com/hero-outer.jpg"],
            "mainEntity": {
                "@type": "SingleFamilyResidence",
                "numberOfBedrooms": 5,
                "numberOfBathroomsTotal": 4,
                "floorSize": {
                    "@type": "QuantitativeValue",
                    "value": 3200,
                    "unitText": "sqft",
                },
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "200 Gallery Ln",
                    "addressLocality": "Coral Gables",
                    "addressRegion": "FL",
                    "postalCode": "33134",
                },
                "image": residence_images,
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Coral-Gables/200-gallery-ln/home/30000002"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        assert len(prop.photos) == 41
        ordered_urls = [photo.url for photo in prop.photos]
        # Dedupe order must preserve residence URLs before the outer hero.
        residence_positions = [
            ordered_urls.index(u) for u in residence_images if u in ordered_urls
        ]
        assert residence_positions == sorted(residence_positions)
        assert "https://img.redfin.com/hero-outer.jpg" in ordered_urls
        assert ordered_urls.index(
            "https://img.redfin.com/hero-outer.jpg"
        ) > residence_positions[-1]

    def test_main_entity_outer_gallery_wins_when_residence_has_no_images(
        self,
    ) -> None:
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 725000},
            "image": [
                "https://img.redfin.com/h1.jpg",
                "https://img.redfin.com/h2.jpg",
                "https://img.redfin.com/h3.jpg",
            ],
            "mainEntity": {
                "@type": "SingleFamilyResidence",
                "numberOfBedrooms": 3,
                "numberOfBathroomsTotal": 2,
                "floorSize": {
                    "@type": "QuantitativeValue",
                    "value": 1800,
                    "unitText": "sqft",
                },
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "300 Outer St",
                    "addressLocality": "Boca Raton",
                    "addressRegion": "FL",
                    "postalCode": "33432",
                },
                "image": [],
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Boca-Raton/300-outer-st/home/30000003"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        photo_urls = {photo.url for photo in prop.photos}
        assert photo_urls == {
            "https://img.redfin.com/h1.jpg",
            "https://img.redfin.com/h2.jpg",
            "https://img.redfin.com/h3.jpg",
        }

    def test_main_entity_imageobject_gallery_extracts_urls(self) -> None:
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 650000},
            "mainEntity": {
                "@type": "SingleFamilyResidence",
                "numberOfBedrooms": 3,
                "numberOfBathroomsTotal": 2,
                "floorSize": {
                    "@type": "QuantitativeValue",
                    "value": 1600,
                    "unitText": "sqft",
                },
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "400 Image Ave",
                    "addressLocality": "Hollywood",
                    "addressRegion": "FL",
                    "postalCode": "33020",
                },
                "image": [
                    {
                        "@type": "ImageObject",
                        "url": "https://img.redfin.com/a.jpg",
                    },
                    {
                        "@type": "ImageObject",
                        "contentUrl": "https://img.redfin.com/b.jpg",
                    },
                ],
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Hollywood/400-image-ave/home/30000004"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        photo_urls = {photo.url for photo in prop.photos}
        assert "https://img.redfin.com/a.jpg" in photo_urls
        assert "https://img.redfin.com/b.jpg" in photo_urls

    def test_main_entity_overlay_preserves_zero_beds_and_outer_address_leafs(
        self,
    ) -> None:
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 410000},
            "address": {
                "@type": "PostalAddress",
                "postalCode": "33139",
            },
            "mainEntity": {
                "@type": "Apartment",
                "numberOfBedrooms": 0,  # studio — must NOT be dropped as falsy
                "numberOfBathroomsTotal": 1,
                "floorSize": {
                    "@type": "QuantitativeValue",
                    "value": 480,
                    "unitText": "sqft",
                },
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "1 Ocean Dr",
                    "addressLocality": "Miami",
                    "addressRegion": "FL",
                },
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Miami/1-ocean-dr/home/30000005"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        assert prop.beds == 0.0
        assert prop.address_line1 == "1 Ocean Dr"
        assert prop.city == "Miami"
        assert prop.state == "FL"
        assert prop.postal_code == "33139"

    def test_blank_residence_offer_falls_back_to_outer_offer(self) -> None:
        """Codex P1 regression: a blank ``mainEntity.offers.price`` must not
        override a real outer-node price.

        Previously ``_merge_leaves`` treated an empty-string residence
        price as authoritative, so the merged offers dict surfaced
        ``price=""`` → ``_to_int`` → ``None`` → missing-price
        ``SchemaShiftError``. ``_normalize_offers`` must drop placeholder
        offers whose price is missing, ``None``, or blank so the outer
        offer survives.
        """
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 640000},
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "77 Blank Price Ln",
                "addressLocality": "Orlando",
                "addressRegion": "FL",
                "postalCode": "32801",
            },
            "mainEntity": {
                "@type": "SingleFamilyResidence",
                "numberOfBedrooms": 3,
                "numberOfBathroomsTotal": 2,
                "floorSize": {
                    "@type": "QuantitativeValue",
                    "value": 1_650,
                    "unitText": "sqft",
                },
                "offers": {"@type": "Offer", "price": ""},
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Orlando/77-blank-price-ln/home/30000006"
        prop = RedfinExtractor().extract(html=html, source_url=url)

        # Outer offer must win when the residence offer is a blank placeholder.
        assert prop.price_usd == 640_000
        assert prop.beds == 3.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1_650

    def test_blank_residence_offer_list_falls_back_to_outer(self) -> None:
        """A list with only blank-price dicts on the residence side must also
        fall back to the outer offer, not surface the blank dict and drop
        the outer price via ``_merge_leaves``."""
        payload = {
            "@context": "https://schema.org",
            "@type": "Product",
            "offers": {"@type": "Offer", "price": 995000},
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "88 List Blank Ct",
                "addressLocality": "Tampa",
                "addressRegion": "FL",
                "postalCode": "33602",
            },
            "mainEntity": {
                "@type": "SingleFamilyResidence",
                "numberOfBedrooms": 4,
                "numberOfBathroomsTotal": 3,
                "offers": [
                    {"@type": "Offer", "price": None},
                    {"@type": "Offer", "price": "   "},
                ],
            },
        }
        html = self._html_with_json_ld(payload)
        url = "https://www.redfin.com/FL/Tampa/88-list-blank-ct/home/30000007"
        prop = RedfinExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 995_000
