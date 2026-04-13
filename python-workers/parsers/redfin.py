"""Deterministic Redfin listing extractor.

The extractor runs three strategies in order and merges whatever each one
yields into a single raw-field dict:

1. **JSON-LD** — ``<script type="application/ld+json">`` blocks. Richest
   source when Redfin ships it.
2. **Redux/reactServerState** — ``window.__INITIAL_STATE__ = {...};`` or
   ``reactServerState = {...};`` inline script. Redfin's equivalent of
   Zillow's Apollo preload; carries a ``propertyInfo`` / ``listing`` blob.
3. **HTML fallback** — visible ``.street-address`` / ``.homecard-price``
   spans, ``.home-facts-*`` rows, and ``<meta>`` tags. Last-resort parse.

Strategies are additive: earlier strategies win on conflicts, later
strategies fill in any missing keys. Only after all three have run is the
raw dict converted to a :class:`CanonicalProperty`. Missing *required*
fields (address, price) raise :class:`SchemaShiftError`; missing optional
fields are left as ``None``.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any

from lxml import html as lxml_html
from lxml.etree import LxmlError, XMLSyntaxError
from lxml.etree import ParserError as LxmlParserError

from common.parser_errors import MalformedHTMLError, SchemaShiftError
from common.property import CanonicalProperty, PropertyPhoto

_PORTAL = "redfin"

# Matches any of Redfin's inline state blobs. Redfin ships the listing
# payload under one of three names depending on the page template:
#   window.__INITIAL_STATE__ = {...};
#   window.__REDUX_STATE__   = {...};
#   reactServerState         = {...};
# Non-greedy on the body, anchored on the trailing `};` like Apollo.
_REDUX_RE = re.compile(
    r"(?:window\.__INITIAL_STATE__|window\.__REDUX_STATE__|reactServerState)"
    r"\s*=\s*(\{.*?\})\s*;",
    re.DOTALL,
)

# Matches price strings in two formats:
#   1. Full numeric: "$1,250,000" / "$675,000" / "1250000"
#   2. Compact shorthand: "$1.2M" / "$750K" / "1.25M"
# Compact suffixes (K/M/B) are resolved in `_parse_price`.
_PRICE_RE = re.compile(
    r"\$?\s*(?P<num>\d+(?:[,.]\d+)*)\s*(?P<suffix>[KkMmBb])?",
)

# Address like "1420 Ocean Dr Unit 402, Miami Beach, FL 33139".
_ADDRESS_RE = re.compile(
    r"^\s*(?P<line1>.+?),\s*(?P<city>[^,]+),\s*(?P<state>[A-Z]{2})\s+(?P<zip>\d{5})\s*$",
)

_PROPERTY_TYPE_MAP: dict[str, str] = {
    "condo": "condo",
    "condominium": "condo",
    "condo_co_op": "condo",
    "condo/co_op": "condo",
    "co_op": "condo",
    "single_family": "single_family",
    "single_family_residential": "single_family",
    "singlefamilyresidence": "single_family",
    "house": "single_family",
    "townhouse": "townhouse",
    "townhome": "townhouse",
    "multi_family": "multi_family",
    "multi_family_(2_4_unit)": "multi_family",
    "duplex": "multi_family",
    "triplex": "multi_family",
    "fourplex": "multi_family",
    "land": "land",
    "vacantland": "land",
    "vacant_land": "land",
    "new_construction": "new_construction",
}


class RedfinExtractor:
    """Portal extractor for Redfin home detail pages."""

    def extract(self, *, html: str, source_url: str) -> CanonicalProperty:
        """Parse ``html`` into a :class:`CanonicalProperty`.

        Raises
        ------
        MalformedHTMLError
            lxml cannot parse the body at all.
        SchemaShiftError
            Every strategy failed for at least one required field.
        """
        if "\x00" in html:
            raise MalformedHTMLError(
                "Redfin HTML contains NUL bytes — treating as malformed binary",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            )
        try:
            doc = lxml_html.fromstring(html)
        except (LxmlError, LxmlParserError, XMLSyntaxError, ValueError) as exc:
            raise MalformedHTMLError(
                f"lxml could not parse Redfin HTML: {exc}",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            ) from exc

        raw: dict[str, Any] = {}
        self._apply(raw, self._extract_json_ld(doc))
        self._apply(raw, self._extract_embedded_state(html))
        self._apply(raw, self._extract_html_fallback(doc))

        if not raw:
            raise SchemaShiftError(
                "Redfin page yielded no structured fields from any strategy",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            )

        return self._assemble(raw, source_url=source_url, raw_html=html)

    @staticmethod
    def _apply(target: dict[str, Any], patch: dict[str, Any]) -> None:
        """Fill missing keys in ``target`` from ``patch`` (earlier wins)."""
        for key, value in patch.items():
            if value is None:
                continue
            target.setdefault(key, value)

    # ------------------------------------------------------------------
    # Strategy 1: JSON-LD
    # ------------------------------------------------------------------
    def _extract_json_ld(self, doc: lxml_html.HtmlElement) -> dict[str, Any]:
        result: dict[str, Any] = {}
        nodes = doc.xpath('//script[@type="application/ld+json"]')
        for node in nodes:
            text = node.text_content() or ""
            if not text.strip():
                continue
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                continue
            candidates = payload if isinstance(payload, list) else [payload]
            for cand in candidates:
                if not isinstance(cand, dict):
                    continue
                if not self._looks_like_listing(cand):
                    continue
                self._apply(result, self._from_json_ld_node(cand))
        return result

    @staticmethod
    def _looks_like_listing(node: dict[str, Any]) -> bool:
        type_field = node.get("@type")
        if isinstance(type_field, list):
            types = {str(t).lower() for t in type_field}
        else:
            types = {str(type_field or "").lower()}
        listing_markers = {
            "realestatelisting",
            "residence",
            "singlefamilyresidence",
            "house",
            "product",
        }
        return bool(types & listing_markers) or "offers" in node

    def _from_json_ld_node(self, node: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        address = node.get("address")
        if isinstance(address, dict):
            out["address_line1"] = _clean_str(address.get("streetAddress"))
            out["city"] = _clean_str(address.get("addressLocality"))
            out["state"] = _clean_str(address.get("addressRegion"))
            out["postal_code"] = _clean_str(address.get("postalCode"))
        geo = node.get("geo")
        if isinstance(geo, dict):
            out["latitude"] = _to_float(geo.get("latitude"))
            out["longitude"] = _to_float(geo.get("longitude"))
        offers = node.get("offers")
        if isinstance(offers, dict):
            out["price_usd"] = _to_int(offers.get("price"))
        elif isinstance(offers, list) and offers and isinstance(offers[0], dict):
            out["price_usd"] = _to_int(offers[0].get("price"))
        out["beds"] = _to_float(node.get("numberOfRooms"))
        out["baths"] = _to_float(node.get("numberOfBathroomsTotal"))
        floor_size = node.get("floorSize")
        if isinstance(floor_size, dict):
            out["living_area_sqft"] = _to_int(floor_size.get("value"))
        out["year_built"] = _to_int(node.get("yearBuilt"))
        out["description"] = _clean_str(node.get("description"))
        # `additionalType` is the specific sub-type (e.g. SingleFamilyResidence).
        # Only fall back to `@type` if it actually carries a residential type —
        # otherwise we'd store generic schema.org values like "RealEstateListing"
        # as `property_type`, which then blocks later Redux data from correcting
        # it because the merge uses `setdefault`.
        additional_type = node.get("additionalType")
        if additional_type is None:
            at_type = _pick_residential_type(node.get("@type"))
            if isinstance(at_type, str) and _is_residential_type(at_type):
                additional_type = at_type
        out["property_type"] = _normalize_property_type(
            _pick_residential_type(additional_type)
        )
        images = node.get("image")
        if isinstance(images, list):
            out["photos"] = tuple(
                PropertyPhoto(url=str(img)) for img in images if isinstance(img, str)
            )
        elif isinstance(images, str):
            out["photos"] = (PropertyPhoto(url=images),)
        return out

    # ------------------------------------------------------------------
    # Strategy 2: Redux / reactServerState preload
    # ------------------------------------------------------------------
    def _extract_embedded_state(self, html: str) -> dict[str, Any]:
        # Redfin listings sometimes include a decoy/malformed first
        # `__INITIAL_STATE__` assignment (e.g. in a string literal or a
        # dev-mode stub script). We must walk *every* candidate blob and
        # return data from the first one that (a) parses as JSON and (b)
        # contains a recognisable listing dict — otherwise a single bad
        # early match would force us into the HTML fallback even when a
        # valid Redux blob exists later in the document.
        for match in _REDUX_RE.finditer(html):
            blob = match.group(1)
            try:
                payload = json.loads(blob)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            prop: dict[str, Any] | None = None
            for key in ("propertyInfo", "listing", "mainHouseInfo", "property"):
                candidate = payload.get(key)
                if isinstance(candidate, dict):
                    prop = candidate
                    break
            if prop is None:
                continue
            return self._redux_to_raw(prop)
        return {}

    @staticmethod
    def _redux_to_raw(prop: dict[str, Any]) -> dict[str, Any]:
        """Project a Redux listing dict onto the raw-field shape.

        Uses `_first_present` instead of Python's `or` chain to preserve
        legitimate zero values (e.g. `days_on_market=0` for a new listing,
        studio beds, zero HOA) that would otherwise be silently coerced
        to `None` and skew downstream filtering and ranking.
        """
        out: dict[str, Any] = {
            "listing_id": _clean_str(
                _first_present(prop, "propertyId", "listingId", "mlsId")
            ),
            "mls_number": _clean_str(_first_present(prop, "mlsId", "mlsNumber")),
            "latitude": _to_float(prop.get("latitude")),
            "longitude": _to_float(prop.get("longitude")),
            "property_type": _normalize_property_type(prop.get("propertyType")),
            "price_usd": _to_int(prop.get("price")),
            "beds": _to_float(_first_present(prop, "beds", "bedrooms")),
            "baths": _to_float(_first_present(prop, "baths", "bathrooms")),
            "living_area_sqft": _to_int(_first_present(prop, "sqFt", "livingArea")),
            "lot_size_sqft": _to_int(prop.get("lotSize")),
            "year_built": _to_int(prop.get("yearBuilt")),
            "days_on_market": _to_int(
                _first_present(prop, "daysOnMarket", "daysOnRedfin")
            ),
            "hoa_monthly_usd": _to_int(_first_present(prop, "hoaDues", "hoaFee")),
            "description": _clean_str(prop.get("description")),
        }
        address = prop.get("address")
        if isinstance(address, dict):
            out["address_line1"] = _clean_str(address.get("streetAddress"))
            out["city"] = _clean_str(address.get("city"))
            out["state"] = _clean_str(address.get("state"))
            out["postal_code"] = _clean_str(
                _first_present(address, "zip", "zipCode")
            )
        else:
            out["address_line1"] = _clean_str(prop.get("streetAddress"))
            out["city"] = _clean_str(prop.get("city"))
            out["state"] = _clean_str(prop.get("state"))
            out["postal_code"] = _clean_str(_first_present(prop, "zip", "zipCode"))
        return out

    # ------------------------------------------------------------------
    # Strategy 3: HTML fallback
    # ------------------------------------------------------------------
    def _extract_html_fallback(self, doc: lxml_html.HtmlElement) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Address: prefer the visible `.street-address` + `.citystatezip`
        # pair; fall back to og:title / <h1> / twitter title for pages that
        # strip the explicit spans.
        street_nodes = doc.xpath('//*[contains(@class, "street-address")]')
        citystate_nodes = doc.xpath('//*[contains(@class, "citystatezip")]')
        if street_nodes and citystate_nodes:
            street = (street_nodes[0].text_content() or "").strip()
            citystate = (citystate_nodes[0].text_content() or "").strip()
            combined = f"{street}, {citystate}" if street and citystate else ""
            parsed = _parse_address_line(combined)
            if parsed is not None:
                out.update(parsed)
        if "address_line1" not in out:
            title = _meta_content(doc, 'meta[@property="og:title"]')
            parsed = _parse_address_line(title) if title else None
            if parsed is None:
                h1_nodes = doc.xpath("//h1")
                if h1_nodes:
                    parsed = _parse_address_line(
                        (h1_nodes[0].text_content() or "").strip()
                    )
            if parsed is not None:
                out.update(parsed)

        # Price: twitter:data1 meta tag, then visible `.homecard-price` span.
        price_text = _meta_content(doc, 'meta[@name="twitter:data1"]')
        meta_price = _parse_price(price_text) if price_text else None
        if meta_price is not None:
            out["price_usd"] = meta_price
        else:
            price_nodes = doc.xpath('//*[contains(@class, "homecard-price")]')
            if price_nodes:
                span_price = _parse_price(price_nodes[0].text_content() or "")
                if span_price is not None:
                    out["price_usd"] = span_price

        # Beds / baths / sqft from the `.home-main-stats-variant` stat blocks.
        stat_blocks = doc.xpath('//*[contains(@class, "stat-block")]')
        for block in stat_blocks:
            label_nodes = block.xpath('.//*[contains(@class, "statsLabel")]')
            value_nodes = block.xpath('.//*[contains(@class, "statsValue")]')
            if not label_nodes or not value_nodes:
                continue
            label = (label_nodes[0].text_content() or "").strip().lower()
            value = (value_nodes[0].text_content() or "").strip()
            if not value:
                continue
            if "bed" in label and "beds" not in out:
                parsed_float = _to_float(value)
                if parsed_float is not None:
                    out["beds"] = parsed_float
            elif "bath" in label and "baths" not in out:
                parsed_float = _to_float(value)
                if parsed_float is not None:
                    out["baths"] = parsed_float
            elif ("sq" in label or "ft" in label) and "living_area_sqft" not in out:
                parsed_int = _first_int(value)
                if parsed_int is not None:
                    out["living_area_sqft"] = parsed_int

        # `.home-facts-row` key/value rows: year built, property type, HOA,
        # days on Redfin, lot size.
        fact_rows = doc.xpath('//*[contains(@class, "home-facts-row")]')
        for row in fact_rows:
            label_nodes = row.xpath('.//*[contains(@class, "home-facts-label")]')
            value_nodes = row.xpath('.//*[contains(@class, "home-facts-value")]')
            if not label_nodes or not value_nodes:
                continue
            label = (label_nodes[0].text_content() or "").strip().lower()
            value = (value_nodes[0].text_content() or "").strip()
            if not value:
                continue
            if "year built" in label and "year_built" not in out:
                out["year_built"] = _first_int(value)
            elif "property type" in label and "property_type" not in out:
                out["property_type"] = _normalize_property_type(value)
            elif "hoa" in label and "hoa_monthly_usd" not in out:
                out["hoa_monthly_usd"] = _first_int(value)
            elif "days on" in label and "days_on_market" not in out:
                out["days_on_market"] = _first_int(value)
            elif "lot size" in label and "lot_size_sqft" not in out:
                out["lot_size_sqft"] = _parse_lot_size_sqft(value)

        # Photo gallery: `<img class="InlinePhotoViewer_image">`.
        photo_nodes = doc.xpath(
            '//img[contains(@class, "InlinePhotoViewer_image")]'
        )
        if photo_nodes:
            photos = tuple(
                PropertyPhoto(url=img.get("src"), caption=img.get("alt"))
                for img in photo_nodes
                if img.get("src")
            )
            if photos:
                out["photos"] = photos

        return out

    # ------------------------------------------------------------------
    # Assemble
    # ------------------------------------------------------------------
    def _assemble(
        self,
        raw: dict[str, Any],
        *,
        source_url: str,
        raw_html: str,
    ) -> CanonicalProperty:
        required = ("address_line1", "city", "state", "postal_code", "price_usd")
        missing = [key for key in required if not raw.get(key)]
        if missing:
            raise SchemaShiftError(
                f"Redfin extractor missing required fields: {missing}",
                portal=_PORTAL,
                url=source_url,
                field=missing[0],
                raw_snippet=raw_html,
            )
        photos_raw = raw.get("photos") or ()
        photos: tuple[PropertyPhoto, ...] = (
            photos_raw if isinstance(photos_raw, tuple) else tuple(photos_raw)
        )
        # Backfill listing_id from the source URL's `/home/<digits>` segment
        # when neither JSON-LD nor the Redux blob provided one.
        listing_id = raw.get("listing_id") or _listing_id_from_url(source_url)
        return CanonicalProperty(
            source_platform="redfin",
            source_url=source_url,
            listing_id=listing_id,
            mls_number=raw.get("mls_number"),
            extracted_at=datetime.now(UTC),
            address_line1=str(raw["address_line1"]),
            city=str(raw["city"]),
            state=str(raw["state"]),
            postal_code=str(raw["postal_code"]),
            latitude=raw.get("latitude"),
            longitude=raw.get("longitude"),
            property_type=raw.get("property_type"),
            price_usd=raw.get("price_usd"),
            beds=raw.get("beds"),
            baths=raw.get("baths"),
            living_area_sqft=raw.get("living_area_sqft"),
            lot_size_sqft=raw.get("lot_size_sqft"),
            year_built=raw.get("year_built"),
            days_on_market=raw.get("days_on_market"),
            hoa_monthly_usd=raw.get("hoa_monthly_usd"),
            description=raw.get("description"),
            photos=photos,
        )


# ----------------------------------------------------------------------
# Module-private helpers
# ----------------------------------------------------------------------
def _first_present(source: dict[str, Any], *keys: str) -> Any:
    """Return the first value in *keys* that is present and not None.

    Unlike ``source.get(a) or source.get(b)``, this preserves legitimate
    falsy values such as ``0`` and ``""`` — the `or` chain would coerce
    ``{"daysOnMarket": 0}`` to ``None`` and mask a brand-new listing.
    """
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        match = _PRICE_RE.search(value)
        if match is None:
            return None
        try:
            return int(match.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", ""))
        except ValueError:
            return None
    return None


def _first_int(text: str) -> int | None:
    """Return the first integer embedded in ``text`` (for "$285/mo", "18 days")."""
    match = re.search(r"(\d[\d,]*)", text)
    if match is None:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


_PRICE_SUFFIX_MULTIPLIER = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}


def _parse_price(text: str) -> int | None:
    match = _PRICE_RE.search(text)
    if match is None:
        return None
    raw = match.group("num").replace(",", "")
    suffix = (match.group("suffix") or "").upper()
    try:
        if suffix:
            return int(float(raw) * _PRICE_SUFFIX_MULTIPLIER[suffix])
        if "." in raw:
            return None
        return int(raw)
    except (ValueError, KeyError):
        return None


# Redfin listing URLs look like `.../home/12345678` — capture the trailing
# digits segment when other strategies did not supply a listing id.
_HOME_ID_RE = re.compile(r"/home/(\d+)(?:/|$|\?)")


def _listing_id_from_url(source_url: str) -> str | None:
    match = _HOME_ID_RE.search(source_url)
    return match.group(1) if match else None


# Residential schema.org / Redfin type tokens used to gate the JSON-LD
# `@type` fallback — generic container types like "RealEstateListing" or
# "Product" must NOT leak into `property_type`.
_RESIDENTIAL_TYPE_KEYS = {
    "condo",
    "condominium",
    "single_family",
    "singlefamilyresidence",
    "house",
    "townhouse",
    "townhome",
    "multi_family",
    "multifamily",
    "duplex",
    "triplex",
    "fourplex",
    "land",
    "vacantland",
    "new_construction",
    "apartment",
    "apartmentcomplex",
    "residence",
}


def _is_residential_type(value: str) -> bool:
    key = value.strip().lower().replace(" ", "_").replace("-", "_")
    return key in _RESIDENTIAL_TYPE_KEYS


# Lot-size parsing for HTML fallback. Redfin reports lot size as either
# "8,712 sq ft" or "0.2 acres"; downstream code wants square feet.
_LOT_SIZE_SQFT_RE = re.compile(r"([\d,]+(?:\.\d+)?)\s*(sq\s*ft|sqft|acres?)", re.IGNORECASE)
_SQFT_PER_ACRE = 43_560


def _parse_lot_size_sqft(text: str) -> int | None:
    """Parse Redfin's lot size strings ("8,712 sq ft" / "0.2 acres") to sqft."""
    match = _LOT_SIZE_SQFT_RE.search(text)
    if match is None:
        return None
    try:
        raw = float(match.group(1).replace(",", ""))
    except ValueError:
        return None
    unit = match.group(2).lower().replace(" ", "")
    if unit.startswith("acre"):
        return int(round(raw * _SQFT_PER_ACRE))
    return int(round(raw))


def _parse_address_line(text: str) -> dict[str, str] | None:
    match = _ADDRESS_RE.match(text)
    if match is None:
        return None
    return {
        "address_line1": match.group("line1").strip(),
        "city": match.group("city").strip(),
        "state": match.group("state").strip(),
        "postal_code": match.group("zip").strip(),
    }


def _meta_content(doc: lxml_html.HtmlElement, xpath: str) -> str | None:
    nodes = doc.xpath(f"//{xpath}")
    if not nodes:
        return None
    value = nodes[0].get("content")
    return str(value) if value is not None else None


def _normalize_property_type(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    key = text.lower().replace(" ", "_").replace("-", "_")
    if key in _PROPERTY_TYPE_MAP:
        return _PROPERTY_TYPE_MAP[key]
    return key


def _pick_residential_type(value: Any) -> Any:
    """Pick the most specific residential @type when JSON-LD provides a list.

    Schema.org lets `@type` be a single string or a list of strings (e.g.
    `["Product", "RealEstateListing", "SingleFamilyResidence"]`). Pass a
    list straight into the normalizer and it stringifies the whole list;
    instead, iterate and return the first value whose lowercase form is a
    known key in the property-type map, falling back to the last entry
    (typically the most specific) or the raw value for a string.
    """
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, list):
        for item in value:
            if not isinstance(item, str):
                continue
            key = item.strip().lower().replace(" ", "_").replace("-", "_")
            if key in _PROPERTY_TYPE_MAP:
                return item
        strings = [item for item in value if isinstance(item, str)]
        return strings[-1] if strings else None
    return value
