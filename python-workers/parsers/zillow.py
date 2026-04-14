"""Deterministic Zillow listing extractor.

The extractor runs four strategies in order and merges whatever each one
yields into a single raw-field dict:

1. **Next.js __NEXT_DATA__** — ``<script id="__NEXT_DATA__" ...>`` with
   SSR state. Modern Zillow's authoritative source: full property record
   lives under ``props.pageProps.componentProps.gdpClientCache`` keyed by
   a ``ForSalePriorityQuery`` / ``NotForSalePriorityQuery`` JSON string.
2. **JSON-LD** — ``<script type="application/ld+json">`` blocks. Richest
   schema.org source when Zillow ships it.
3. **Apollo preload** — legacy ``hdpApolloPreloadedData = {...};`` inline
   script. Retained for older fixtures / pages still shipping the old
   blob alongside the new Next.js data.
4. **HTML fallback** — ``<meta>`` tags, ``<h1>``, and ``data-testid`` spans.
   Last-resort parse for pages that strip all JSON blobs.

Strategies are additive: earlier strategies win on conflicts, later
strategies fill in any missing keys. Only after all four have run is the
raw dict converted to a :class:`CanonicalProperty`. Missing *required*
fields (address, price) raise :class:`SchemaShiftError`; missing optional
fields are left as ``None``.
"""

from __future__ import annotations

import contextlib
import json
import re
from datetime import UTC, datetime
from typing import Any

from lxml import html as lxml_html
from lxml.etree import LxmlError, XMLSyntaxError
from lxml.etree import ParserError as LxmlParserError

from common.parser_errors import MalformedHTMLError, SchemaShiftError
from common.property import CanonicalProperty, PropertyPhoto

_PORTAL = "zillow"

# Matches the inline `hdpApolloPreloadedData = {...};` assignment. Uses a
# balanced-brace walk via non-greedy match against the trailing `};`.
_APOLLO_RE = re.compile(
    r"hdpApolloPreloadedData\s*=\s*(\{.*?\})\s*;",
    re.DOTALL,
)

# Matches the Next.js SSR state block. Zillow ships this on every HDP page
# as of the 2026 frontend rewrite; the inner JSON carries the entire
# property record under `props.pageProps.componentProps.gdpClientCache`.
_NEXT_DATA_RE = re.compile(
    r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
    re.DOTALL,
)

# Matches price strings in two formats:
#   1. Full numeric: "$1,250,000" / "$675,000" / "1250000"
#   2. Compact shorthand: "$1.2M" / "$750K" / "1.25M"
# Compact suffixes (K/M/B) are resolved in `_parse_price`.
_PRICE_RE = re.compile(
    r"\$?\s*(?P<num>\d+(?:[,.]\d+)*)\s*(?P<suffix>[KkMmBb])?",
)

# Address like "7421 Mirabella Way, Boca Raton, FL 33433" (state is 2-letter,
# ZIP is 5 digits). Kept deliberately lenient on the street portion.
_ADDRESS_RE = re.compile(
    r"^\s*(?P<line1>.+?),\s*(?P<city>[^,]+),\s*(?P<state>[A-Z]{2})\s+(?P<zip>\d{5})\s*$",
)

_PROPERTY_TYPE_MAP: dict[str, str] = {
    "condo": "condo",
    "condominium": "condo",
    "single_family": "single_family",
    "singlefamilyresidence": "single_family",
    "house": "single_family",
    "townhouse": "townhouse",
    "townhome": "townhouse",
    "multi_family": "multi_family",
    "duplex": "multi_family",
    "triplex": "multi_family",
    "fourplex": "multi_family",
    "land": "land",
    "vacantland": "land",
    "new_construction": "new_construction",
}


class ZillowExtractor:
    """Portal extractor for Zillow homedetails pages."""

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
                "Zillow HTML contains NUL bytes — treating as malformed binary",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            )
        try:
            doc = lxml_html.fromstring(html)
        except (LxmlError, LxmlParserError, XMLSyntaxError, ValueError) as exc:
            raise MalformedHTMLError(
                f"lxml could not parse Zillow HTML: {exc}",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            ) from exc

        raw: dict[str, Any] = {}
        self._apply(raw, self._extract_next_data(html))
        self._apply(raw, self._extract_json_ld(doc))
        self._apply(raw, self._extract_apollo(html))
        self._apply(raw, self._extract_html_fallback(doc))

        if not raw:
            raise SchemaShiftError(
                "Zillow page yielded no structured fields from any strategy",
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
    # Strategy 1: Next.js __NEXT_DATA__
    # ------------------------------------------------------------------
    def _extract_next_data(self, html: str) -> dict[str, Any]:
        """Pull the property record out of Zillow's Next.js SSR blob."""
        match = _NEXT_DATA_RE.search(html)
        if match is None:
            return {}
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            return {}

        # Walk ``props.pageProps.componentProps.gdpClientCache``. The cache
        # value is itself a JSON string (a second parse), keyed by a query
        # descriptor like ``ForSalePriorityQuery{...}`` whose value wraps
        # the raw ``property`` dict we care about.
        try:
            cache_raw = payload["props"]["pageProps"]["componentProps"]["gdpClientCache"]
        except (KeyError, TypeError):
            return {}
        if not isinstance(cache_raw, str) or not cache_raw:
            return {}
        try:
            cache = json.loads(cache_raw)
        except json.JSONDecodeError:
            return {}
        if not isinstance(cache, dict) or not cache:
            return {}
        prop: dict[str, Any] | None = None
        for value in cache.values():
            if isinstance(value, dict) and isinstance(value.get("property"), dict):
                prop = value["property"]
                break
        if prop is None:
            return {}

        out: dict[str, Any] = {
            "listing_id": _clean_str(prop.get("zpid")),
            "mls_number": _clean_str(prop.get("mlsid") or prop.get("mlsNumber")),
            "address_line1": _clean_str(prop.get("streetAddress")),
            "city": _clean_str(prop.get("city")),
            "state": _clean_str(prop.get("state")),
            "postal_code": _clean_str(prop.get("zipcode") or prop.get("zipCode")),
            "latitude": _to_float(prop.get("latitude")),
            "longitude": _to_float(prop.get("longitude")),
            "property_type": _normalize_property_type(prop.get("homeType")),
            "price_usd": _to_int(prop.get("price")),
            "beds": _to_float(prop.get("bedrooms")),
            "baths": _to_float(prop.get("bathrooms")),
            "living_area_sqft": _to_int(
                prop.get("livingArea") or prop.get("livingAreaValue")
            ),
            "lot_size_sqft": _lot_size_sqft(prop),
            "year_built": _to_int(prop.get("yearBuilt")),
            "days_on_market": _to_int(prop.get("daysOnZillow")),
            "hoa_monthly_usd": _to_int(
                prop.get("monthlyHoaFee") or prop.get("hoaFee")
            ),
            "zestimate_usd": _to_int(prop.get("zestimate")),
            "rent_zestimate_usd": _to_int(prop.get("rentZestimate")),
            "description": _clean_str(prop.get("description")),
        }

        photos = _next_data_photos(prop)
        if photos:
            out["photos"] = photos
        return out

    # ------------------------------------------------------------------
    # Strategy 2: JSON-LD
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
        # JSON-LD `@type` may be a string or a list of type strings. Pick
        # the most specific residential type when a list is provided rather
        # than passing the raw list to the normalizer (which would stringify
        # it to a junk value that could override the later Apollo homeType).
        additional_type = node.get("additionalType") or node.get("@type")
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
    # Strategy 3: Apollo preload (legacy)
    # ------------------------------------------------------------------
    def _extract_apollo(self, html: str) -> dict[str, Any]:
        match = _APOLLO_RE.search(html)
        if match is None:
            return {}
        blob = match.group(1)
        try:
            payload = json.loads(blob)
        except json.JSONDecodeError:
            return {}
        prop = payload.get("property") if isinstance(payload, dict) else None
        if not isinstance(prop, dict):
            return {}
        out: dict[str, Any] = {
            "listing_id": _clean_str(prop.get("zpid")),
            "mls_number": _clean_str(prop.get("mlsNumber")),
            "address_line1": _clean_str(prop.get("streetAddress")),
            "city": _clean_str(prop.get("city")),
            "state": _clean_str(prop.get("state")),
            "postal_code": _clean_str(prop.get("zipcode")),
            "latitude": _to_float(prop.get("latitude")),
            "longitude": _to_float(prop.get("longitude")),
            "property_type": _normalize_property_type(prop.get("homeType")),
            "price_usd": _to_int(prop.get("price")),
            "beds": _to_float(prop.get("bedrooms")),
            "baths": _to_float(prop.get("bathrooms")),
            "living_area_sqft": _to_int(prop.get("livingArea")),
            "lot_size_sqft": _to_int(prop.get("lotSize")),
            "year_built": _to_int(prop.get("yearBuilt")),
            "days_on_market": _to_int(prop.get("daysOnZillow")),
            "hoa_monthly_usd": _to_int(prop.get("hoaFee")),
            "zestimate_usd": _to_int(prop.get("zestimate")),
            "rent_zestimate_usd": _to_int(prop.get("rentZestimate")),
            "description": _clean_str(prop.get("description")),
        }
        return out

    # ------------------------------------------------------------------
    # Strategy 4: HTML fallback
    # ------------------------------------------------------------------
    def _extract_html_fallback(self, doc: lxml_html.HtmlElement) -> dict[str, Any]:
        out: dict[str, Any] = {}
        h1_nodes = doc.xpath("//h1")
        if h1_nodes:
            h1_text = (h1_nodes[0].text_content() or "").strip()
            parsed = _parse_address_line(h1_text)
            if parsed is not None:
                out.update(parsed)
        price_text = _meta_content(doc, 'meta[@name="twitter:data1"]')
        meta_price = _parse_price(price_text) if price_text else None
        if meta_price is not None:
            out["price_usd"] = meta_price
        else:
            # Fall through to the visible price span when the twitter meta
            # tag is absent OR present but non-numeric (e.g. "Contact agent",
            # "Price on request"). Previously a non-numeric meta wrote
            # `price_usd=None` and short-circuited the span path, causing
            # extraction to wrongly raise SchemaShiftError.
            price_spans = doc.xpath('//span[@data-testid="price"]')
            if price_spans:
                span_price = _parse_price(price_spans[0].text_content() or "")
                if span_price is not None:
                    out["price_usd"] = span_price
        description_nodes = doc.xpath('//*[@data-testid="description"]')
        if description_nodes:
            out["description"] = (description_nodes[0].text_content() or "").strip() or None
        home_type_nodes = doc.xpath('//*[@data-testid="fact-home-type"]')
        if home_type_nodes:
            out["property_type"] = _normalize_property_type(
                home_type_nodes[0].text_content() or ""
            )
        year_nodes = doc.xpath('//*[@data-testid="fact-year-built"]')
        if year_nodes:
            out["year_built"] = _first_int(year_nodes[0].text_content() or "")
        hoa_nodes = doc.xpath('//*[@data-testid="fact-hoa"]')
        if hoa_nodes:
            out["hoa_monthly_usd"] = _first_int(hoa_nodes[0].text_content() or "")
        dom_nodes = doc.xpath('//*[@data-testid="fact-days-on-zillow"]')
        if dom_nodes:
            out["days_on_market"] = _first_int(dom_nodes[0].text_content() or "")
        beds_baths_nodes = doc.xpath('//*[@data-testid="bed-bath-beyond"]')
        if beds_baths_nodes:
            text = beds_baths_nodes[0].text_content() or ""
            bb = _parse_beds_baths_sqft(text)
            for key, value in bb.items():
                out.setdefault(key, value)
        photo_nodes = doc.xpath('//img[starts-with(@data-testid, "media-tile-")]')
        if photo_nodes:
            out["photos"] = tuple(
                PropertyPhoto(url=img.get("src"), caption=img.get("alt"))
                for img in photo_nodes
                if img.get("src")
            )
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
                f"Zillow extractor missing required fields: {missing}",
                portal=_PORTAL,
                url=source_url,
                field=missing[0],
                raw_snippet=raw_html,
            )
        photos_raw = raw.get("photos") or ()
        photos: tuple[PropertyPhoto, ...] = (
            photos_raw if isinstance(photos_raw, tuple) else tuple(photos_raw)
        )
        # Backfill listing_id from the source URL's `<zpid>_zpid/` segment
        # when neither JSON-LD nor Apollo provided one. This keeps the
        # provenance/dedup key stable on HTML-only flows.
        listing_id = raw.get("listing_id") or _listing_id_from_url(source_url)
        return CanonicalProperty(
            source_platform="zillow",
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
            zestimate_usd=raw.get("zestimate_usd"),
            rent_zestimate_usd=raw.get("rent_zestimate_usd"),
            description=raw.get("description"),
            photos=photos,
        )


# ----------------------------------------------------------------------
# Module-private helpers
# ----------------------------------------------------------------------
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
            # "1.2M" / "750K" / "1.25B" → float × multiplier.
            return int(float(raw) * _PRICE_SUFFIX_MULTIPLIER[suffix])
        # Bare "1.2" makes no sense as a USD price (the comma branch above
        # handles "1,250,000"); reject unsuffixed decimals to avoid parsing
        # a stray "1" out of "1.2M"-like text when the suffix match failed.
        if "." in raw:
            return None
        return int(raw)
    except (ValueError, KeyError):
        return None


_ZPID_RE = re.compile(r"/(\d+)_zpid(?:/|$)")


def _listing_id_from_url(source_url: str) -> str | None:
    match = _ZPID_RE.search(source_url)
    return match.group(1) if match else None


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


def _parse_beds_baths_sqft(text: str) -> dict[str, Any]:
    """Parse strings like '3 bd | 2.5 ba | 1,750 sqft'."""
    out: dict[str, Any] = {}
    bed_match = re.search(r"(\d+(?:\.\d+)?)\s*bd", text, re.IGNORECASE)
    if bed_match:
        out["beds"] = float(bed_match.group(1))
    bath_match = re.search(r"(\d+(?:\.\d+)?)\s*ba", text, re.IGNORECASE)
    if bath_match:
        out["baths"] = float(bath_match.group(1))
    sqft_match = re.search(r"([\d,]+)\s*sqft", text, re.IGNORECASE)
    if sqft_match:
        with contextlib.suppress(ValueError):
            out["living_area_sqft"] = int(sqft_match.group(1).replace(",", ""))
    return out


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


def _next_data_photos(prop: dict[str, Any]) -> tuple[PropertyPhoto, ...]:
    """Extract high-resolution photo URLs from a Next.js property record.

    Zillow serves photos as a list of ``responsivePhotos`` (fallback keys:
    ``hugePhotos``, ``originalPhotos``) where each entry has a
    ``mixedSources.jpeg`` list of ``{url, width}`` dicts sorted ascending.
    We pick the last (largest) jpeg URL per photo so downstream consumers
    get the highest-resolution version available.
    """
    photos_raw: Any = (
        prop.get("responsivePhotos")
        or prop.get("hugePhotos")
        or prop.get("originalPhotos")
        or []
    )
    if not isinstance(photos_raw, list):
        return ()
    photos: list[PropertyPhoto] = []
    for entry in photos_raw:
        if not isinstance(entry, dict):
            continue
        mixed = entry.get("mixedSources")
        best_url: str | None = None
        if isinstance(mixed, dict):
            jpeg = mixed.get("jpeg")
            if isinstance(jpeg, list) and jpeg:
                last = jpeg[-1]
                if isinstance(last, dict):
                    best_url = _clean_str(last.get("url"))
        if best_url is None:
            best_url = _clean_str(entry.get("url"))
        if not best_url:
            continue
        caption = _clean_str(entry.get("caption"))
        photos.append(PropertyPhoto(url=best_url, caption=caption))
    return tuple(photos)


def _lot_size_sqft(prop: dict[str, Any]) -> int | None:
    """Normalize Zillow's lot-size fields to square feet.

    ``lotSize`` is an integer square-foot count on modern payloads, but
    older records expose ``lotAreaValue`` + ``lotAreaUnits`` where units
    may be ``"Acres"`` or ``"Square Feet"``. Convert acres to sqft
    (1 acre = 43_560 sqft) when needed.
    """
    lot_size = prop.get("lotSize")
    if lot_size is not None:
        return _to_int(lot_size)
    value = _to_float(prop.get("lotAreaValue"))
    if value is None:
        return None
    units = str(prop.get("lotAreaUnits") or "").strip().lower()
    if units.startswith("acre"):
        return int(value * 43_560)
    return int(value)


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
        # No match — prefer the last string entry (schema.org convention).
        strings = [item for item in value if isinstance(item, str)]
        return strings[-1] if strings else None
    return value
