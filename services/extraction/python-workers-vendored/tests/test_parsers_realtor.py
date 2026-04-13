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
    _first_int,
    _first_present,
    _is_residential_type,
    _listing_id_from_url,
    _normalize_property_type,
    _parse_address_line,
    _parse_beds_baths_sqft,
    _parse_lot_size_sqft,
    _parse_price,
    _pick_residential_type,
    _safe_dict,
    _to_float,
    _to_int,
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


class TestJsonLdEdgeCases:
    """Cover robustness paths in `_extract_json_ld` / `_from_json_ld_node`."""

    def test_empty_script_and_invalid_json_and_non_dict_are_skipped(self) -> None:
        # Three `application/ld+json` blocks — an empty one, an invalid one,
        # and an array containing a string (not a dict) — followed by the
        # real __NEXT_DATA__ payload. Parser must tolerate each bad JSON-LD
        # and fall through to __NEXT_DATA__ without raising.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script type="application/ld+json">   </script>'
            '<script type="application/ld+json">{oops not json}</script>'
            '<script type="application/ld+json">["skip me"]</script>'
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"1231231234",'
            '"address":{'
            '"line":"1 Edge Ln",'
            '"city":"Tampa",'
            '"state_code":"FL",'
            '"postal_code":"33602"},'
            '"type":"condo",'
            '"description":{"beds":1,"baths":1,"sqft":600,"year_built":2020},'
            '"list_price":350000,'
            '"hoa":{"fee":null},'
            '"days_on_market":4,'
            '"public_remarks":"Edge-case test listing."'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/1-Edge-Ln_Tampa_FL_33602_M12345-67890"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 350_000
        assert prop.city == "Tampa"

    def test_jsonld_without_listing_marker_is_skipped(self) -> None:
        # JSON-LD that's a valid dict but NOT a listing (plain Organization
        # node). The parser must skip it without raising and still extract
        # via the __NEXT_DATA__ fallback.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script type="application/ld+json">'
            '{"@context":"https://schema.org","@type":"Organization","name":"Realtor.com"}'
            "</script>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"2342342345",'
            '"address":{'
            '"line":"2 Org Way",'
            '"city":"Orlando",'
            '"state_code":"FL",'
            '"postal_code":"32801"},'
            '"type":"single_family",'
            '"description":{"beds":3,"baths":2,"sqft":1800,"year_built":2015},'
            '"list_price":425000,'
            '"hoa":{"fee":null},'
            '"days_on_market":9'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/2-Org-Way_Orlando_FL_32801_M23456-78901"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 425_000
        assert prop.city == "Orlando"

    def test_jsonld_offers_list_and_string_image(self) -> None:
        # JSON-LD variants that the condo fixture doesn't cover:
        #  - `offers` is a LIST of offers (parser takes offers[0].price).
        #  - `image` is a single string (parser wraps it as a one-photo tuple).
        #  - `@type` is a single residential token (no list, no additionalType).
        html = (
            "<!DOCTYPE html><html><head>"
            '<script type="application/ld+json">{'
            '"@context":"https://schema.org",'
            '"@type":"SingleFamilyResidence",'
            '"name":"3 Offers Dr",'
            '"address":{'
            '"streetAddress":"3 Offers Dr",'
            '"addressLocality":"Jacksonville",'
            '"addressRegion":"FL",'
            '"postalCode":"32202"},'
            '"offers":[{"@type":"Offer","price":675000}],'
            '"numberOfRooms":3,'
            '"numberOfBathroomsTotal":2,'
            '"floorSize":{"@type":"QuantitativeValue","value":1700},'
            '"yearBuilt":2016,'
            '"image":"https://ap.rdcpix.com/fake/offers-single.jpg",'
            '"description":"Single image test listing."'
            "}</script>"
            "</head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/3-Offers-Dr_Jacksonville_FL_32202_M34567-89012"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 675_000
        assert prop.beds == 3.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1_700
        assert prop.year_built == 2016
        assert len(prop.photos) == 1
        assert prop.photos[0].url == "https://ap.rdcpix.com/fake/offers-single.jpg"
        assert prop.property_type == "single_family"


class TestNextDataEdgeCases:
    """Cover tricky `_extract_next_data` / `_find_listing_in_page_props` paths."""

    def test_empty_next_data_blob_is_skipped(self) -> None:
        # Empty `__NEXT_DATA__` followed by a valid one — the finditer loop
        # must walk past the empty body without short-circuiting.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">   </script>'
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"3453453456",'
            '"address":{'
            '"line":"3 Empty Ct",'
            '"city":"Naples",'
            '"state_code":"FL",'
            '"postal_code":"34102"},'
            '"type":"single_family",'
            '"description":{"beds":4,"baths":3,"sqft":2500,"year_built":2018},'
            '"list_price":1250000,'
            '"hoa":{"fee":null},'
            '"days_on_market":11'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/3-Empty-Ct_Naples_FL_34102_M34567-89013"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 1_250_000

    def test_next_data_non_dict_payload_is_skipped(self) -> None:
        # A valid-JSON array payload inside a __NEXT_DATA__ block is not a
        # dict — parser must skip and fall through to the next block.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">[1,2,3]</script>'
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"4564564567",'
            '"address":{'
            '"line":"4 Array St",'
            '"city":"Gainesville",'
            '"state_code":"FL",'
            '"postal_code":"32601"},'
            '"type":"townhome",'
            '"description":{"beds":3,"baths":2,"sqft":1500,"year_built":2011},'
            '"list_price":275000,'
            '"hoa":{"fee":null},'
            '"days_on_market":2'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/4-Array-St_Gainesville_FL_32601_M45678-90123"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 275_000
        assert prop.property_type == "townhouse"

    def test_next_data_without_pageprops_is_skipped(self) -> None:
        # A valid `__NEXT_DATA__` with no `props.pageProps` is a non-listing
        # payload — parser falls through to the next block.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"runtimeConfig":{"foo":"bar"}}'
            "</script>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"5675675678",'
            '"address":{'
            '"line":"5 Runtime Rd",'
            '"city":"Sarasota",'
            '"state_code":"FL",'
            '"postal_code":"34236"},'
            '"type":"condo",'
            '"description":{"beds":2,"baths":2,"sqft":1100,"year_built":2019},'
            '"list_price":520000,'
            '"hoa":{"fee":0},'
            '"days_on_market":0'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/5-Runtime-Rd_Sarasota_FL_34236_M56789-01234"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 520_000
        assert prop.days_on_market == 0
        assert prop.hoa_monthly_usd == 0

    def test_next_data_pageprops_with_no_listing_is_skipped(self) -> None:
        # `pageProps` present but none of the known listing keys are set —
        # parser must move on to the next __NEXT_DATA__ block.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"unrelated":{"foo":"bar"}}}}'
            "</script>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"home":{'
            '"listing_id":"6786786789",'
            '"address":{'
            '"line":"6 Home Key",'
            '"city":"Key West",'
            '"state_code":"FL",'
            '"postal_code":"33040"},'
            '"type":"condo",'
            '"description":{"beds":1,"baths":1,"sqft":750,"year_built":2005},'
            '"list_price":710000,'
            '"hoa":{"fee":420},'
            '"days_on_market":30'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/6-Home-Key_Key-West_FL_33040_M67890-12345"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 710_000
        assert prop.hoa_monthly_usd == 420

    def test_next_data_redux_property_nesting(self) -> None:
        # `initialReduxState.propertyDetails.property` variant of the Redux
        # nesting (vs. `.listing`) — covers the second branch of the loop.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"initialReduxState":{"propertyDetails":{"property":{'
            '"listing_id":"7897897890",'
            '"address":{'
            '"line":"7 Redux Ave",'
            '"city":"Clearwater",'
            '"state_code":"FL",'
            '"postal_code":"33755"},'
            '"type":"Multi-Family",'
            '"description":{"beds":6,"baths":4,"sqft":3200,"year_built":1985},'
            '"list_price":950000,'
            '"hoa":{"fee":null},'
            '"days_on_market":12'
            "}}}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/7-Redux-Ave_Clearwater_FL_33755_M78901-23456"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 950_000
        assert prop.property_type == "multi_family"

    def test_next_data_description_not_dict_is_tolerated(self) -> None:
        # When `description` is a string (not the nested dict), the parser
        # must treat it as empty and still return a successful extraction
        # via other fields; falls back to property-meta HTML for beds/baths.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"8908908901",'
            '"address":{'
            '"line":"8 Stringy Way",'
            '"city":"Destin",'
            '"state_code":"FL",'
            '"postal_code":"32541"},'
            '"type":"single_family",'
            '"description":"just a string, not a dict",'
            '"list_price":699000,'
            '"hoa":{"fee":null},'
            '"days_on_market":15'
            "}}}}"
            "</script></head><body>"
            '<div data-testid="property-meta">3 bed | 2 bath | 1,800 sqft</div>'
            "</body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/8-Stringy-Way_Destin_FL_32541_M89012-34567"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 699_000
        # beds/baths/sqft must come from the HTML fallback.
        assert prop.beds == 3.0
        assert prop.baths == 2.0
        assert prop.living_area_sqft == 1_800

    def test_next_data_photos_dict_and_string_entries(self) -> None:
        # Mixed photos list: one dict with href, one dict with url, one bare
        # string, and one skipped entry (non-dict non-string). All are
        # preserved in order with the skipped one dropped.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"9019019012",'
            '"address":{'
            '"line":"9 Photo Blvd",'
            '"city":"Cocoa Beach",'
            '"state_code":"FL",'
            '"postal_code":"32931"},'
            '"type":"condo",'
            '"description":{"beds":2,"baths":2,"sqft":1100,"year_built":2010},'
            '"list_price":485000,'
            '"hoa":{"fee":null},'
            '"days_on_market":6,'
            '"photos":['
            '{"href":"https://ap.rdcpix.com/fake/photos-href.jpg"},'
            '{"url":"https://ap.rdcpix.com/fake/photos-url.jpg"},'
            '"https://ap.rdcpix.com/fake/photos-bare.jpg",'
            "42"
            "]"
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/9-Photo-Blvd_Cocoa-Beach_FL_32931_M90123-45678"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert len(prop.photos) == 3
        assert prop.photos[0].url == "https://ap.rdcpix.com/fake/photos-href.jpg"
        assert prop.photos[1].url == "https://ap.rdcpix.com/fake/photos-url.jpg"
        assert prop.photos[2].url == "https://ap.rdcpix.com/fake/photos-bare.jpg"


class TestHtmlFallbackEdgeCases:
    """Cover alternative HTML fallback paths."""

    def test_h1_address_and_meta_price_fallback(self) -> None:
        # No `[data-testid="address-block"]`, no og:title — parser walks to
        # the `<h1>` tag. No `[data-testid="price"]` — parser reads price
        # from `meta[twitter:data1]`. Also covers an unknown property-type
        # label that normalizes to its raw key ("luxury_villa") and an
        # empty data-label value (skipped).
        html = (
            "<!DOCTYPE html><html><head>"
            '<meta name="twitter:data1" content="$820,000">'
            "</head><body>"
            "<h1>101 H1 Way, Boca Raton, FL 33432</h1>"
            '<div data-label="property-type">Luxury Villa</div>'
            '<div data-label="">ignored</div>'
            "</body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/101-H1-Way_Boca-Raton_FL_33432_M10101-20202"
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.price_usd == 820_000
        assert prop.address_line1 == "101 H1 Way"
        assert prop.city == "Boca Raton"
        # Unknown raw string normalizes to its key form, not None.
        assert prop.property_type == "luxury_villa"


class TestAssembleMissingRequiredFields:
    """`_assemble` raises `SchemaShiftError` when required fields are absent."""

    def test_next_data_missing_price_raises_schema_shift(self) -> None:
        # __NEXT_DATA__ that only carries an address — price is missing, so
        # the `_assemble` required-fields check must raise.
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id":"1112223334",'
            '"address":{'
            '"line":"11 Missing Rd",'
            '"city":"Melbourne",'
            '"state_code":"FL",'
            '"postal_code":"32901"},'
            '"type":"single_family"'
            "}}}}"
            "</script></head><body></body></html>"
        )
        url = "https://www.realtor.com/realestateandhomes-detail/11-Missing-Rd_Melbourne_FL_32901_M11122-23334"
        with pytest.raises(SchemaShiftError) as excinfo:
            RealtorExtractor().extract(html=html, source_url=url)
        assert excinfo.value.field == "price_usd"


class TestHelperUnits:
    """Fine-grained unit tests for module-private helpers."""

    def test_first_present_prefers_first_non_none_key(self) -> None:
        assert _first_present({"a": None, "b": 0, "c": 5}, "a", "b", "c") == 0
        assert _first_present({"a": None}, "a", "b") is None
        assert _first_present({}, "a") is None
        assert _first_present({"a": ""}, "a") == ""

    def test_safe_dict_returns_none_on_wrong_type(self) -> None:
        assert _safe_dict({"a": {"b": {"c": 1}}}, "a", "b") == {"c": 1}
        # Walking past a non-dict mid-path returns None.
        assert _safe_dict({"a": "not a dict"}, "a", "b") is None
        # Terminal value is a scalar → also None.
        assert _safe_dict({"a": {"b": 42}}, "a", "b") is None

    def test_to_int_handles_all_branches(self) -> None:
        assert _to_int(None) is None
        assert _to_int(True) is None  # bool sentinel
        assert _to_int(5) == 5
        assert _to_int(5.9) == 5
        assert _to_int("$1,234,567") == 1_234_567
        assert _to_int("no digits here") is None
        # Non-numeric, non-str fallback → None.
        assert _to_int([1, 2, 3]) is None

    def test_to_float_handles_all_branches(self) -> None:
        assert _to_float(None) is None
        assert _to_float(False) is None  # bool sentinel
        assert _to_float(3) == 3.0
        assert _to_float(2.5) == 2.5
        assert _to_float("1,250.5") == 1250.5
        assert _to_float("nope") is None
        # Non-numeric, non-str fallback → None.
        assert _to_float([1, 2, 3]) is None

    def test_first_int_picks_first_digit_run(self) -> None:
        assert _first_int("$285/mo") == 285
        assert _first_int("18 days on Realtor") == 18
        assert _first_int("no digits") is None

    def test_parse_price_suffixes_and_decimal_rules(self) -> None:
        assert _parse_price("$2.1M") == 2_100_000
        assert _parse_price("$750K") == 750_000
        assert _parse_price("$1.5B") == 1_500_000_000
        assert _parse_price("$1,250,000") == 1_250_000
        # Bare unsuffixed decimals are rejected (likely a stray numeric).
        assert _parse_price("1.2") is None
        # No digits at all → None.
        assert _parse_price("price on request") is None

    def test_listing_id_from_url_matches_realtor_token(self) -> None:
        assert (
            _listing_id_from_url(
                "https://www.realtor.com/realestateandhomes-detail/Foo_M12345-67890"
            )
            == "12345-67890"
        )
        assert (
            _listing_id_from_url(
                "https://www.realtor.com/realestateandhomes-detail/Foo_M12345-67890?src=share"
            )
            == "12345-67890"
        )
        assert _listing_id_from_url("https://www.realtor.com/nothing") is None

    def test_is_residential_type_gating(self) -> None:
        assert _is_residential_type("SingleFamilyResidence") is True
        assert _is_residential_type("Single Family Home") is True
        assert _is_residential_type("RealEstateListing") is False
        assert _is_residential_type("Product") is False

    def test_parse_lot_size_sqft_variants(self) -> None:
        assert _parse_lot_size_sqft("8,712 sq ft") == 8_712
        assert _parse_lot_size_sqft("8712 sqft") == 8_712
        # Acres convert at 43,560 sqft/acre.
        assert _parse_lot_size_sqft("0.5 acres") == 21_780
        # 1 acre = exactly 43,560.
        assert _parse_lot_size_sqft("1 acre") == 43_560
        assert _parse_lot_size_sqft("unknown") is None

    def test_parse_address_line_rejects_non_matches(self) -> None:
        assert _parse_address_line("123 Main St, Miami, FL 33101") == {
            "address_line1": "123 Main St",
            "city": "Miami",
            "state": "FL",
            "postal_code": "33101",
        }
        assert _parse_address_line("just a title") is None

    def test_parse_beds_baths_sqft_handles_missing_pieces(self) -> None:
        full = _parse_beds_baths_sqft("3 bed | 2.5 bath | 1,620 sqft")
        assert full == {"beds": 3.0, "baths": 2.5, "living_area_sqft": 1_620}
        # When nothing matches, returns an empty dict (no keys set).
        assert _parse_beds_baths_sqft("no facts") == {}

    def test_normalize_property_type_edge_cases(self) -> None:
        assert _normalize_property_type(None) is None
        assert _normalize_property_type("") is None
        assert _normalize_property_type("   ") is None
        # Unknown values pass through as their normalized key form, not None.
        assert _normalize_property_type("Penthouse Suite") == "penthouse_suite"

    def test_pick_residential_type_list_and_string(self) -> None:
        # List — picks the first known residential token in map order.
        assert (
            _pick_residential_type(
                ["Product", "RealEstateListing", "SingleFamilyResidence"]
            )
            == "SingleFamilyResidence"
        )
        # List with non-string items interleaved — skips them.
        assert _pick_residential_type([42, "Townhome", None]) == "Townhome"
        # List with no known tokens — falls back to last string entry.
        assert _pick_residential_type(["Nothing", "Unknown"]) == "Unknown"
        # List with no strings at all — returns None.
        assert _pick_residential_type([1, 2, 3]) is None
        # String and None pass through unchanged.
        assert _pick_residential_type("Condo") == "Condo"
        assert _pick_residential_type(None) is None


class TestBathsTotalPreferredOverBathsFull:
    """Regression: a listing with `baths=2.5` and `baths_full=2` must keep 2.5.

    The old order (`baths_full` before `baths_total`) silently truncated
    half baths. For a 2-full-plus-1-half listing, canonical output
    dropped from 2.5 to 2.0 — which skewed downstream filtering and
    ranking by bath count.
    """

    def test_half_baths_preserved_via_baths_field(self) -> None:
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id": "HALFBATH001",'
            '"list_price": 725000,'
            '"description": {'
            '"beds": 3,'
            '"baths": 2.5,'  # decimal total — wins
            '"baths_full": 2,'  # integer full only — loses half
            '"baths_total": 3,'
            '"sqft": 1800'
            '},'
            '"address": {'
            '"line": "789 Half St",'
            '"city": "Miami",'
            '"state_code": "FL",'
            '"postal_code": "33130"'
            '}}}}}</script>'
            "</head><body></body></html>"
        )
        url = (
            "https://www.realtor.com/realestateandhomes-detail/"
            "789-Half-St_Miami_FL_33130_M12345-67890"
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.baths == 2.5

    def test_baths_total_beats_baths_full_when_baths_missing(self) -> None:
        """When `baths` is absent, `baths_total` is still preferred over `baths_full`."""
        html = (
            "<!DOCTYPE html><html><head>"
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"property":{'
            '"listing_id": "HALFBATH002",'
            '"list_price": 725000,'
            '"description": {'
            '"beds": 3,'
            '"baths_full": 2,'  # would win under the old order
            '"baths_total": 3,'  # must win under the fix
            '"sqft": 1800'
            '},'
            '"address": {'
            '"line": "456 Total Rd",'
            '"city": "Miami",'
            '"state_code": "FL",'
            '"postal_code": "33130"'
            '}}}}}</script>'
            "</head><body></body></html>"
        )
        url = (
            "https://www.realtor.com/realestateandhomes-detail/"
            "456-Total-Rd_Miami_FL_33130_M22222-33333"
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.baths == 3.0


class TestNextStubBlobFallsThrough:
    """Regression: empty/stub first __NEXT_DATA__ blob must not block later blobs.

    Prior code returned as soon as it found any dict under property/
    listing/home, so a structurally valid but empty early stub (from an
    SSR hydration fallback) would prevent the scanner from reaching the
    real listing payload in a second __NEXT_DATA__ script.
    """

    def test_empty_stub_falls_through_to_real_blob(self) -> None:
        # First __NEXT_DATA__ carries a structurally-valid but empty
        # property dict. Second __NEXT_DATA__ carries the real listing.
        stub = '{"props":{"pageProps":{"property":{}}}}'
        real = (
            '{"props":{"pageProps":{"property":{'
            '"listing_id": "REAL123",'
            '"list_price": 485000,'
            '"description": {'
            '"beds": 3,'
            '"baths": 2,'
            '"sqft": 1500'
            '},'
            '"address": {'
            '"line": "100 Real Ave",'
            '"city": "Doral",'
            '"state_code": "FL",'
            '"postal_code": "33172"'
            '}}}}}'
        )
        html = (
            "<!DOCTYPE html><html><head>"
            f'<script id="__NEXT_DATA__" type="application/json">{stub}</script>'
            f'<script id="__NEXT_DATA__" type="application/json">{real}</script>'
            "</head><body></body></html>"
        )
        url = (
            "https://www.realtor.com/realestateandhomes-detail/"
            "100-Real-Ave_Doral_FL_33172_M44444-55555"
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # The stub must have been skipped — real payload wins.
        assert prop.listing_id == "REAL123"
        assert prop.price_usd == 485_000
        assert prop.beds == 3.0
        assert prop.city == "Doral"

    def test_metadata_only_stub_falls_through(self) -> None:
        """A stub with only metadata (e.g. status) but no core fields falls through."""
        stub = '{"props":{"pageProps":{"listing":{"status":"sold"}}}}'
        real = (
            '{"props":{"pageProps":{"listing":{'
            '"listing_id": "META999",'
            '"list_price": 550000,'
            '"description": {'
            '"beds": 2,'
            '"baths": 2,'
            '"sqft": 1100'
            '},'
            '"address": {'
            '"line": "200 Metadata Ln",'
            '"city": "Hollywood",'
            '"state_code": "FL",'
            '"postal_code": "33019"'
            '}}}}}'
        )
        html = (
            "<!DOCTYPE html><html><head>"
            f'<script id="__NEXT_DATA__" type="application/json">{stub}</script>'
            f'<script id="__NEXT_DATA__" type="application/json">{real}</script>'
            "</head><body></body></html>"
        )
        url = (
            "https://www.realtor.com/realestateandhomes-detail/"
            "200-Metadata-Ln_Hollywood_FL_33019_M66666-77777"
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        assert prop.listing_id == "META999"
        assert prop.price_usd == 550_000


class TestSiblingKeysCheckedBeforeRejection:
    """Regression: stub `pageProps.property` must not hide real `pageProps.listing`.

    The previous `_find_listing_in_page_props` returned the first dict
    under direct_keys without validating it. A stub under `property`
    would be returned, then rejected by `_next_blob_has_listing_fields`,
    which caused `_extract_next_data` to skip the entire script — even
    when `pageProps.listing` held the real payload as a sibling. Fix
    walks all sibling keys first and only falls back to the first-seen
    stub when nothing matches.
    """

    def test_stub_property_falls_back_to_real_listing_sibling(self) -> None:
        # Single __NEXT_DATA__ blob containing BOTH an empty `property`
        # stub AND a real `listing` under the same pageProps.
        payload = (
            '{"props":{"pageProps":{'
            '"property":{},'  # empty stub
            '"listing":{'
            '"listing_id": "SIBLING001",'
            '"list_price": 825000,'
            '"description": {'
            '"beds": 4,'
            '"baths": 3,'
            '"sqft": 2400'
            '},'
            '"address": {'
            '"line": "300 Sibling Pl",'
            '"city": "Weston",'
            '"state_code": "FL",'
            '"postal_code": "33326"'
            '}'
            '}}}}'
        )
        html = (
            "<!DOCTYPE html><html><head>"
            f'<script id="__NEXT_DATA__" type="application/json">{payload}</script>'
            "</head><body></body></html>"
        )
        url = (
            "https://www.realtor.com/realestateandhomes-detail/"
            "300-Sibling-Pl_Weston_FL_33326_M88888-99999"
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # The real listing sibling must have been found despite the
        # empty property stub being checked first.
        assert prop.listing_id == "SIBLING001"
        assert prop.price_usd == 825_000
        assert prop.beds == 4.0
        assert prop.city == "Weston"


class TestIdOnlyBlobIsRejected:
    """Regression: a blob with only listing_id must not short-circuit the scanner.

    `_next_blob_has_listing_fields` used to accept any non-empty
    `listing_id` or `property_id` as sufficient. A metadata-only first
    blob with just an ID but no address/price would then block
    `_extract_next_data` from scanning later `__NEXT_DATA__` scripts,
    causing required-field SchemaShiftError even when later blobs
    carried the full listing.
    """

    def test_id_only_blob_falls_through_to_full_blob(self) -> None:
        id_only = (
            '{"props":{"pageProps":{"listing":{'
            '"listing_id": "IDONLY001",'
            '"status": "active"'
            '}}}}'
        )
        full = (
            '{"props":{"pageProps":{"listing":{'
            '"listing_id": "FULL001",'
            '"list_price": 675000,'
            '"description": {'
            '"beds": 3,'
            '"baths": 2.5,'
            '"sqft": 1950'
            '},'
            '"address": {'
            '"line": "400 Full St",'
            '"city": "Miami",'
            '"state_code": "FL",'
            '"postal_code": "33131"'
            '}}}}}'
        )
        html = (
            "<!DOCTYPE html><html><head>"
            f'<script id="__NEXT_DATA__" type="application/json">{id_only}</script>'
            f'<script id="__NEXT_DATA__" type="application/json">{full}</script>'
            "</head><body></body></html>"
        )
        url = (
            "https://www.realtor.com/realestateandhomes-detail/"
            "400-Full-St_Miami_FL_33131_M10101-20202"
        )
        prop = RealtorExtractor().extract(html=html, source_url=url)
        # Must use the full blob, not the ID-only one that came first.
        assert prop.listing_id == "FULL001"
        assert prop.price_usd == 675_000
        assert prop.baths == 2.5
