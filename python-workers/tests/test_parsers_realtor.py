"""Tests for the deterministic Realtor.com extractor in :mod:`parsers.realtor`.

Fixtures live under ``python-workers/fixtures/html/realtor/`` and are loaded
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
from parsers.realtor import (
    RealtorExtractor,
    _normalize_property_type,
)

if TYPE_CHECKING:
    from collections.abc import Mapping


_FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "html" / "realtor"


def _load(name: str) -> str:
    """Read a Realtor.com fixture by filename."""
    return (_FIXTURE_DIR / name).read_text(encoding="utf-8")


# Expected values for each fixture. These match the values the fixtures were
# hand-built with; the extractor must recover them from whichever data source
# the fixture exposes (JSON-LD, __NEXT_DATA__, or HTML fallback).
_EXPECTED: Mapping[str, Mapping[str, object]] = {
    "realtor_condo_hollywood.html": {
        "source_url": "https://www.realtor.com/realestateandhomes-detail/2450-Oceanfront-Blvd-Apt-503_Hollywood_FL_33019_M30001-12345",
        "address_line1": "2450 Oceanfront Blvd Apt 503",
        "city": "Hollywood",
        "state": "FL",
        "postal_code": "33019",
        "price_usd": 550_000,
        "beds": 2.0,
        "baths": 2.0,
        "living_area_sqft": 950,
        "year_built": 2014,
        "property_type": "condo",
        "days_on_market": 14,
        "hoa_monthly_usd": 440,
    },
    "realtor_sfh_pembroke_pines.html": {
        "source_url": "https://www.realtor.com/realestateandhomes-detail/18220-NW-23rd-St_Pembroke-Pines_FL_33029_M40002-67890",
        "address_line1": "18220 NW 23rd St",
        "city": "Pembroke Pines",
        "state": "FL",
        "postal_code": "33029",
        "price_usd": 850_000,
        "beds": 4.0,
        "baths": 3.0,
        "living_area_sqft": 2_450,
        "year_built": 2008,
        "property_type": "single_family",
        "days_on_market": 0,
        "hoa_monthly_usd": 0,
        "lot_size_sqft": 10_890,
    },
    "realtor_townhome_sunrise.html": {
        "source_url": "https://www.realtor.com/realestateandhomes-detail/9840-Sawgrass-Point-Dr_Sunrise_FL_33323_M50003-24680",
        "address_line1": "9840 Sawgrass Point Dr",
        "city": "Sunrise",
        "state": "FL",
        "postal_code": "33323",
        "price_usd": 475_000,
        "beds": 3.0,
        "baths": 2.5,
        "living_area_sqft": 1_620,
        "year_built": 2013,
        "property_type": "townhouse",
        "days_on_market": 22,
        "hoa_monthly_usd": 295,
    },
    "realtor_sfh_kendall.html": {
        "source_url": "https://www.realtor.com/realestateandhomes-detail/14322-SW-112th-St_Miami_FL_33196_M60004-11223",
        "address_line1": "14322 SW 112th St",
        "city": "Miami",
        "state": "FL",
        "postal_code": "33196",
        "price_usd": 615_000,
        "beds": 4.0,
        "baths": 2.0,
        "living_area_sqft": 1_980,
        "year_built": 2002,
        "property_type": "single_family",
        "days_on_market": 18,
        "lot_size_sqft": 8_250,
    },
    "realtor_new_construction_palm_beach_gardens.html": {
        "source_url": "https://www.realtor.com/realestateandhomes-detail/7411-Avenir-Grove-Way_Palm-Beach-Gardens_FL_33418_M70005-99887",
        "address_line1": "7411 Avenir Grove Way",
        "city": "Palm Beach Gardens",
        "state": "FL",
        "postal_code": "33418",
        "price_usd": 2_100_000,
        "beds": 5.0,
        "baths": 5.0,
        "living_area_sqft": 4_100,
        "year_built": 2026,
        "property_type": "new_construction",
        "days_on_market": 3,
        "hoa_monthly_usd": 625,
    },
}


class TestHappyPath:
    """End-to-end extraction per fixture — every expected field round-trips."""

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_fixture_extraction(self, fixture: str) -> None:
        html = _load(fixture)
        exp = _EXPECTED[fixture]
        url = str(exp["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert isinstance(prop, CanonicalProperty)
        assert prop.address_line1 == exp["address_line1"]
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
    def test_source_platform_is_realtor(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.source_platform == "realtor"

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_source_url_round_trip(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.source_url == url

    @pytest.mark.parametrize("fixture", sorted(_EXPECTED.keys()))
    def test_extracted_at_is_recent_and_aware(self, fixture: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        before = datetime.now(UTC)
        prop = RealtorExtractor().extract(html=html, source_url=url)
        after = datetime.now(UTC)
        assert prop.extracted_at.tzinfo is not None
        assert before - timedelta(seconds=60) <= prop.extracted_at <= after + timedelta(seconds=60)


class TestJsonLdPrimary:
    """Fixtures with rich JSON-LD use that path as the primary source."""

    def test_json_ld_populates_core_fields(self) -> None:
        html = _load("realtor_condo_hollywood.html")
        # Precondition: fixture has JSON-LD.
        assert "application/ld+json" in html
        url = str(_EXPECTED["realtor_condo_hollywood.html"]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 550_000
        assert prop.beds == 2.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 950
        assert prop.year_built == 2014
        assert prop.address_line1 == "2450 Oceanfront Blvd Apt 503"
        assert prop.city == "Hollywood"
        assert prop.state == "FL"
        assert prop.postal_code == "33019"
        # JSON-LD `additionalType="Condo"` must win, not the generic
        # "SingleFamilyResidence" entry in the `@type` list.
        assert prop.property_type == "condo"
        # geo coordinates flow through JSON-LD
        assert prop.latitude == pytest.approx(26.0112)
        assert prop.longitude == pytest.approx(-80.1185)


class TestNextDataFallback:
    """Fixtures missing JSON-LD fall back to the `__NEXT_DATA__` blob."""

    def test_kendall_uses_next_data(self) -> None:
        html = _load("realtor_sfh_kendall.html")
        # Precondition: fixture deliberately has no JSON-LD but has __NEXT_DATA__.
        assert "application/ld+json" not in html
        assert 'id="__NEXT_DATA__"' in html

        url = str(_EXPECTED["realtor_sfh_kendall.html"]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 615_000
        assert prop.beds == 4.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1_980
        assert prop.year_built == 2002
        assert prop.city == "Miami"
        assert prop.state == "FL"
        assert prop.postal_code == "33196"
        assert prop.lot_size_sqft == 8_250
        # Raw `type="Single Family Home"` must normalize to `single_family`.
        assert prop.property_type == "single_family"


class TestHtmlFallback:
    """Fixtures missing JSON-LD + __NEXT_DATA__ fall back to HTML/lxml."""

    def test_sunrise_townhome_uses_html_only(self) -> None:
        html = _load("realtor_townhome_sunrise.html")
        # Precondition: this fixture has no structured data at all.
        assert "application/ld+json" not in html
        assert 'id="__NEXT_DATA__"' not in html

        url = str(_EXPECTED["realtor_townhome_sunrise.html"]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # `$475K` compact-suffix price is parsed via `_parse_price`.
        assert prop.price_usd == 475_000
        assert prop.beds == 3.0
        assert prop.baths == 2.5
        assert prop.living_area_sqft == 1_620
        assert prop.year_built == 2013
        assert prop.address_line1 == "9840 Sawgrass Point Dr"
        assert prop.city == "Sunrise"
        assert prop.state == "FL"
        assert prop.postal_code == "33323"
        assert prop.property_type == "townhouse"
        assert prop.hoa_monthly_usd == 295
        assert prop.days_on_market == 22


class TestSchemaShift:
    """Unrecognised markup raises :class:`SchemaShiftError` with snippet attached."""

    def test_unrelated_content_raises_schema_shift(self) -> None:
        url = "https://www.realtor.com/realestateandhomes-detail/bogus_M99999-00000"
        html = "<html><body>nothing</body></html>"
        with pytest.raises(SchemaShiftError) as excinfo:
            RealtorExtractor().extract(html=html, source_url=url)
        err = excinfo.value
        assert err.portal == "realtor"
        assert err.url == url
        # Snippet clipped to 200 chars.
        if err.raw_snippet is not None:
            assert len(err.raw_snippet) <= 200


class TestMalformedHtml:
    """Completely un-parseable bytes raise :class:`MalformedHTMLError`."""

    def test_empty_string_raises(self) -> None:
        with pytest.raises(MalformedHTMLError):
            RealtorExtractor().extract(
                html="",
                source_url="https://www.realtor.com/realestateandhomes-detail/empty_M1-1",
            )

    def test_garbage_bytes_raise(self) -> None:
        # NUL bytes force the explicit malformed guard in RealtorExtractor.
        garbage = "\x00\x00\x00 not html"
        with pytest.raises(MalformedHTMLError):
            RealtorExtractor().extract(
                html=garbage,
                source_url="https://www.realtor.com/realestateandhomes-detail/garbage_M2-2",
            )


class TestPropertyTypeNormalization:
    """Raw Realtor portal values normalise to canonical strings."""

    @pytest.mark.parametrize(
        ("fixture", "expected_type"),
        [
            ("realtor_condo_hollywood.html", "condo"),
            ("realtor_sfh_pembroke_pines.html", "single_family"),
            ("realtor_townhome_sunrise.html", "townhouse"),
            ("realtor_sfh_kendall.html", "single_family"),
            (
                "realtor_new_construction_palm_beach_gardens.html",
                "new_construction",
            ),
        ],
    )
    def test_property_type_normalized(self, fixture: str, expected_type: str) -> None:
        html = _load(fixture)
        url = str(_EXPECTED[fixture]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.property_type == expected_type

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Single Family Home", "single_family"),
            ("Condo", "condo"),
            ("condo_townhome_rowhome_coop", "condo"),
            ("Townhome", "townhouse"),
            ("Townhouse", "townhouse"),
            ("Multi-Family", "multi_family"),
            ("NEW_CONSTRUCTION", "new_construction"),
            ("mfd_mobile_home", "mobile_home"),
        ],
    )
    def test_raw_realtor_values_normalize(self, raw: str, expected: str) -> None:
        assert _normalize_property_type(raw) == expected


class TestListingIdBackfill:
    """Listing ID is backfilled from the `_M<digits>-<digits>` URL token.

    Realtor's deep-link URLs carry a `_M<seller>-<listing>` segment at the end
    (e.g. `..._M50003-24680`). When neither JSON-LD nor __NEXT_DATA__ supplies
    a listing_id, the extractor must fall back to this token so that downstream
    dedup and provenance keys stay stable on HTML-only flows.
    """

    def test_listing_id_backfilled_from_url_on_html_fallback(self) -> None:
        html = _load("realtor_townhome_sunrise.html")
        url = str(_EXPECTED["realtor_townhome_sunrise.html"]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # URL ends in `_M50003-24680` → listing_id `50003-24680`.
        assert prop.listing_id == "50003-24680"


class TestListingIdFromNextDataWinsOverUrl:
    """When __NEXT_DATA__ provides a listing_id it must not be overwritten by URL."""

    def test_next_data_listing_id_wins_over_url_segment(self) -> None:
        # Kendall fixture has `__NEXT_DATA__ listing_id = "6000411223"`; swap
        # the URL token to prove the structured value wins.
        base = _load("realtor_sfh_kendall.html")
        url = "https://www.realtor.com/realestateandhomes-detail/14322-SW-112th-St_Miami_FL_33196_M99999-99999"
        prop = RealtorExtractor().extract(html=base, source_url=url)
        assert prop.listing_id == "6000411223"


class TestPhotos:
    """At least one fixture yields ≥ 3 :class:`PropertyPhoto` entries."""

    def test_new_construction_has_three_or_more_photos(self) -> None:
        html = _load("realtor_new_construction_palm_beach_gardens.html")
        url = str(
            _EXPECTED["realtor_new_construction_palm_beach_gardens.html"][
                "source_url"
            ]
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert len(prop.photos) >= 3
        for photo in prop.photos:
            assert isinstance(photo, PropertyPhoto)
            assert photo.url.startswith("http")


class TestNextDataDecoyDoesNotPoison:
    """A decoy ``__NEXT_DATA__`` literal in JS must not poison extraction."""

    def test_literal_next_data_string_in_js_variable_is_ignored(self) -> None:
        # Inject a JS assignment whose *source* contains the literal string
        # `__NEXT_DATA__` before the head closes. The regex looks for a
        # `<script id="__NEXT_DATA__" ...>` tag, so this decoy must not be
        # picked up. The extractor falls through to the HTML fallback and
        # still yields the real townhome numbers.
        base = _load("realtor_townhome_sunrise.html")
        decoy = (
            "<script>var x = \"window.__NEXT_DATA__ = { "
            "bad: true };\";</script>"
        )
        html = base.replace("</head>", decoy + "</head>")

        url = str(_EXPECTED["realtor_townhome_sunrise.html"]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 475_000
        assert prop.beds == 3.0
        assert prop.baths == 2.5
        assert prop.living_area_sqft == 1_620
        assert prop.city == "Sunrise"
        assert prop.property_type == "townhouse"


class TestMultipleNextDataBlobs:
    """Regression: malformed first `__NEXT_DATA__` must fall through.

    Previously `_extract_next_data` used a single `search` and returned
    ``{}`` on the first `json.loads` failure. Pages that carry a stub
    A/B test blob followed by the real Next.js state would then fail.
    The fix walks every match via ``finditer``.
    """

    def test_malformed_first_blob_does_not_mask_valid_later_blob(self) -> None:
        malformed_next = (
            '<script id="__NEXT_DATA__" type="application/json">'
            "{not json}"
            "</script>"
        )
        valid_next = (
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"9988776655",'
            '"address":{'
            '"line":"888 Regression Ave",'
            '"city":"Coral Springs",'
            '"state_code":"FL",'
            '"postal_code":"33065"},'
            '"type":"single_family",'
            '"description":{"beds":4,"baths":3,"sqft":2200,"year_built":2012},'
            '"list_price":815000,'
            '"hoa":{"fee":null},'
            '"days_on_market":5,'
            '"public_remarks":"Regression test listing."'
            "}}}}"
            "</script>"
        )
        html = (
            "<!DOCTYPE html><html><head>"
            f"{malformed_next}"
            f"{valid_next}"
            "</head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/888-Regression-Ave_Coral-Springs_FL_33065_M88888-77777"
        prop = RealtorExtractor().extract(html=html, source_url=url)

        assert prop.price_usd == 815_000
        assert prop.beds == 4.0
        assert prop.baths == 3.0
        assert prop.living_area_sqft == 2_200
        assert prop.year_built == 2012
        assert prop.city == "Coral Springs"
        assert prop.listing_id == "9988776655"


class TestZeroValuedNextDataFields:
    """Regression: zero-valued numeric fields from __NEXT_DATA__ must not become None.

    Prior code used `a or b` chains which silently dropped legitimate zeros —
    a brand-new listing with `days_on_market=0`, a studio with `beds=0`, or a
    no-HOA property with `hoa.fee=0` all fell back through to None, skewing
    downstream filtering and ranking.
    """

    def test_pembroke_pines_preserves_zero_days_and_zero_hoa(self) -> None:
        html = _load("realtor_sfh_pembroke_pines.html")
        url = str(_EXPECTED["realtor_sfh_pembroke_pines.html"]["source_url"])
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # The whole point: zeros must round-trip, not become None.
        assert prop.days_on_market == 0
        assert prop.hoa_monthly_usd == 0

    def test_studio_and_zero_hoa_round_trip(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"1111222233",'
            '"address":{'
            '"line":"1 Studio Way",'
            '"city":"Miami",'
            '"state_code":"FL",'
            '"postal_code":"33130"},'
            '"type":"condo",'
            '"description":{"beds":0,"baths":1,"sqft":450,"year_built":2022},'
            '"list_price":500000,'
            '"hoa":{"fee":0},'
            '"days_on_market":0,'
            '"public_remarks":"Studio."'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/1-Studio-Way_Miami_FL_33130_M11111-22222"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # Each zero must round-trip.
        assert prop.beds == 0.0
        assert prop.days_on_market == 0
        assert prop.hoa_monthly_usd == 0
        # Sanity: other fields also populated.
        assert prop.price_usd == 500_000
        assert prop.baths == 1.0
        assert prop.city == "Miami"


class TestJsonLdGenericTypeDoesNotLeak:
    """Regression: JSON-LD generic `@type` (no residential token) must not
    override __NEXT_DATA__'s specific `type` field.

    The new-construction fixture carries `@type="RealEstateListing"` (a
    generic schema.org container) *without* an `additionalType`. Previously
    `_from_json_ld_node` let "RealEstateListing" leak into property_type,
    and because the merge uses `setdefault`, __NEXT_DATA__'s
    `type="NEW_CONSTRUCTION"` was then unable to correct it — downstream
    type-based filters would be wrong. The fix gates the fallback through
    `_is_residential_type` so only residential tokens are kept.
    """

    def test_generic_jsonld_type_does_not_leak_new_construction(self) -> None:
        html = _load("realtor_new_construction_palm_beach_gardens.html")
        url = str(
            _EXPECTED["realtor_new_construction_palm_beach_gardens.html"][
                "source_url"
            ]
        )
        # Precondition: the fixture's JSON-LD has no `additionalType` and its
        # `@type` is the generic "RealEstateListing".
        assert '"@type": "RealEstateListing"' in html
        assert '"additionalType"' not in html

        prop = RealtorExtractor().extract(html=html, source_url=url)
        # property_type must reflect the __NEXT_DATA__ value, NOT leak the
        # generic "realestatelisting" JSON-LD @type.
        assert prop.property_type == "new_construction"

    def test_generic_jsonld_and_next_single_family(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<script type="application/ld+json">{'
            '"@context":"https://schema.org",'
            '"@type":"RealEstateListing",'
            '"name":"500 Generic St",'
            '"address":{'
            '"streetAddress":"500 Generic St",'
            '"addressLocality":"Boca Raton",'
            '"addressRegion":"FL",'
            '"postalCode":"33432"},'
            '"offers":{"@type":"Offer","price":900000}'
            "}</script>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"5555666677",'
            '"address":{'
            '"line":"500 Generic St",'
            '"city":"Boca Raton",'
            '"state_code":"FL",'
            '"postal_code":"33432"},'
            '"type":"Single Family Home",'
            '"description":{"beds":3,"baths":2,"sqft":2000,"year_built":2010},'
            '"list_price":900000,'
            '"hoa":{"fee":null},'
            '"days_on_market":7,'
            '"public_remarks":"Generic container test."'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/500-Generic-St_Boca-Raton_FL_33432_M55555-66666"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # property_type must normalize to single_family via __NEXT_DATA__
        # because the generic JSON-LD @type fallback is gated out.
        assert prop.property_type == "single_family"
