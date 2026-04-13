"""Deterministic Realtor.com listing extractor.

The extractor runs three strategies in order and merges whatever each one
yields into a single raw-field dict:

1. **JSON-LD** — ``<script type="application/ld+json">`` blocks. Carries the
   schema.org ``RealEstateListing`` / ``SingleFamilyResidence`` payload when
   Realtor.com ships it.
2. **__NEXT_DATA__** — ``<script id="__NEXT_DATA__" type="application/json">``
   block. Realtor.com embeds the entire Next.js page state here; the listing
   dict lives under ``props.pageProps.property``,
   ``props.pageProps.initialReduxState.propertyDetails.listing``, or
   ``props.pageProps.listing`` depending on the page template. We scan *all*
   ``__NEXT_DATA__`` occurrences with ``finditer`` so a decoy/malformed first
   blob cannot short-circuit extraction.
3. **HTML fallback** — lxml XPath on the visible ``data-testid``/``data-label``
   nodes (``address-block``, ``price``, ``property-meta``, ``property-type``,
   ``year-built``, ``hoa-fee``, ``days-on-market``, ``lot-size``) plus
   ``meta[og:*]`` / ``meta[twitter:*]``. Last-resort parse.

Strategies are additive: earlier strategies win on conflicts, later strategies
fill in any missing keys. Only after all three have run is the raw dict
converted to a :class:`CanonicalProperty`. Missing *required* fields
(address, price) raise :class:`SchemaShiftError`; missing optional fields are
left as ``None``.
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

_PORTAL = "realtor"

# Matches *every* `<script id="__NEXT_DATA__" ...>...</script>` block in the
# document. We iterate with `finditer` rather than `search` because a decoy or
# malformed first occurrence (e.g. an empty stub injected by an A/B test) must
# fall through to later valid blobs instead of forcing the HTML fallback.
_NEXT_DATA_RE = re.compile(
    r'<script[^>]*id="__NEXT_DATA__"[^>]*>(?P<body>.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)

# Matches price strings in two formats:
#   1. Full numeric: "$1,250,000" / "$675,000" / "1250000"
#   2. Compact shorthand: "$1.2M" / "$750K" / "1.25M"
# Compact suffixes (K/M/B) are resolved in `_parse_price`.
_PRICE_RE = re.compile(
    r"\$?\s*(?P<num>\d+(?:[,.]\d+)*)\s*(?P<suffix>[KkMmBb])?",
)

# Address like "18220 NW 23rd St, Pembroke Pines, FL 33029".
_ADDRESS_RE = re.compile(
    r"^\s*(?P<line1>.+?),\s*(?P<city>[^,]+),\s*(?P<state>[A-Z]{2})\s+(?P<zip>\d{5})\s*$",
)

_PROPERTY_TYPE_MAP: dict[str, str] = {
    "condo": "condo",
    "condominium": "condo",
    "condo_townhome_rowhome_coop": "condo",
    "condo_co_op": "condo",
    "co_op": "condo",
    "single_family": "single_family",
    "single_family_home": "single_family",
    "singlefamilyresidence": "single_family",
    "house": "single_family",
    "townhome": "townhouse",
    "townhouse": "townhouse",
    "multi_family": "multi_family",
    "multi_family_home": "multi_family",
    "duplex": "multi_family",
    "triplex": "multi_family",
    "fourplex": "multi_family",
    "mobile": "mobile_home",
    "mobile_home": "mobile_home",
    "mfd_mobile_home": "mobile_home",
    "manufactured": "mobile_home",
    "land": "land",
    "vacantland": "land",
    "vacant_land": "land",
    "farms_ranches": "land",
    "new_construction": "new_construction",
}


class RealtorExtractor:
    """Portal extractor for Realtor.com home detail pages."""

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
                "Realtor HTML contains NUL bytes — treating as malformed binary",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            )
        try:
            doc = lxml_html.fromstring(html)
        except (LxmlError, LxmlParserError, XMLSyntaxError, ValueError) as exc:
            raise MalformedHTMLError(
                f"lxml could not parse Realtor HTML: {exc}",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            ) from exc

        raw: dict[str, Any] = {}
        self._apply(raw, self._extract_json_ld(doc))
        self._apply(raw, self._extract_next_data(html))
        self._apply(raw, self._extract_html_fallback(doc))

        if not raw:
            raise SchemaShiftError(
                "Realtor page yielded no structured fields from any strategy",
                portal=_PORTAL,
                url=source_url,
                raw_snippet=html,
            )

        return self._assemble(raw, source_url=source_url, raw_html=html)

    @staticmethod
    def _apply(target: dict[str, Any], patch: dict[str, Any]) -> None:
        """Fill missing keys in ``target`` from ``patch`` (earlier wins).

        Exception: ``photos`` prefers the LONGER gallery across strategies.
        JSON-LD on modern Realtor pages only exposes a single hero image,
        while __NEXT_DATA__ carries the full 40+ photo array — setdefault
        would otherwise lock in the hero-only result and strand the rich
        gallery from later strategies.
        """
        for key, value in patch.items():
            if value is None:
                continue
            if key == "photos" and isinstance(value, (tuple, list)):
                existing = target.get("photos")
                if not isinstance(existing, (tuple, list)) or len(value) > len(
                    existing
                ):
                    target["photos"] = value
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
        # `additionalType` is Realtor.com's specific sub-type (e.g. "Condo",
        # "Single Family Home"). Only fall back to `@type` if it carries a
        # residential token — generic schema.org values like "RealEstateListing"
        # or "Product" must NOT leak into `property_type`, otherwise the
        # setdefault-based merge below blocks later __NEXT_DATA__ corrections.
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
    # Strategy 2: __NEXT_DATA__ JSON blob
    # ------------------------------------------------------------------
    def _extract_next_data(self, html: str) -> dict[str, Any]:
        # Walk *every* __NEXT_DATA__ script tag, not just the first — a decoy
        # or malformed early blob must fall through to later valid ones
        # (see Redfin/Zillow codex lessons).
        for match in _NEXT_DATA_RE.finditer(html):
            blob = (match.group("body") or "").strip()
            if not blob:
                continue
            try:
                payload = json.loads(blob)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            page_props = _safe_dict(payload, "props", "pageProps")
            if page_props is None:
                continue
            prop = self._find_listing_in_page_props(page_props)
            if prop is None:
                continue
            # Don't short-circuit on an empty/stub dict: when a page has
            # multiple __NEXT_DATA__ scripts, an early placeholder (e.g.
            # a fallback / SSR hydration stub) that is structurally valid
            # but carries no listing fields would previously block the
            # scanner from reaching the later blob with the real payload.
            # Require at least one recognisable listing field before
            # returning.
            if not self._next_blob_has_listing_fields(prop):
                continue
            return self._next_to_raw(prop)
        return {}

    @staticmethod
    def _next_blob_has_listing_fields(prop: dict[str, Any]) -> bool:
        """Return True if a __NEXT_DATA__ dict carries real listing data.

        An ID by itself is NOT sufficient — a metadata-only blob with
        just a `listing_id` or `property_id` (no address, price, or
        description) would otherwise short-circuit extraction of later
        scripts that carry the full payload. We require at least one
        *substantive* field (price / address / description) alongside
        any ID. Stubs like ``{"status": "sold"}`` or
        ``{"listing_id": "X"}`` now correctly fall through.
        """
        substantive_fields = (
            "list_price",
            "price",
            "current_price",
            "address",
            "location",
            "description",
        )
        for key in substantive_fields:
            value = prop.get(key)
            if value is None:
                continue
            if isinstance(value, dict) and not value:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            return True
        return False

    @classmethod
    def _find_listing_in_page_props(
        cls, page_props: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Locate the real listing dict under ``pageProps`` across templates.

        Walks all known locations (direct `property`/`listing`/`home`,
        then the Redux-nested variant) and returns the first dict that
        actually carries listing data. Crucially, a stub
        ``pageProps.property`` does NOT block us from reaching a populated
        ``pageProps.listing`` sibling — the old "return first dict"
        behaviour caused `_extract_next_data` to reject the script
        outright and emit a false `SchemaShiftError` when later siblings
        carried the real payload.
        """
        direct_keys = ("property", "listing", "home")
        first_stub: dict[str, Any] | None = None
        for key in direct_keys:
            candidate = page_props.get(key)
            if not isinstance(candidate, dict):
                continue
            if cls._next_blob_has_listing_fields(candidate):
                return candidate
            if first_stub is None:
                first_stub = candidate
        # Redux-style nesting: pageProps.initialReduxState.propertyDetails.{listing,property}
        # AND the current template where propertyDetails IS the listing dict
        # (the full object lives directly at propertyDetails with fields like
        # description/photos/address/list_price on it — no child wrapper).
        redux = _safe_dict(page_props, "initialReduxState", "propertyDetails")
        if redux is not None:
            for key in ("listing", "property", "home"):
                candidate = redux.get(key)
                if not isinstance(candidate, dict):
                    continue
                if cls._next_blob_has_listing_fields(candidate):
                    return candidate
                if first_stub is None:
                    first_stub = candidate
            # propertyDetails itself carries the listing payload on modern
            # Realtor pages — treat it as the listing dict when it has real
            # fields (address/description/list_price). This MUST be gated on
            # has_listing_fields, otherwise we'd capture a metadata-only stub
            # on pages where the real data still lives under a child key.
            if cls._next_blob_has_listing_fields(redux):
                return redux
            if first_stub is None:
                first_stub = redux
        # Nothing matched — return the first stub seen so the caller can
        # decide (it will then reject via `_next_blob_has_listing_fields`
        # and keep scanning later `__NEXT_DATA__` scripts).
        return first_stub

    @staticmethod
    def _next_to_raw(prop: dict[str, Any]) -> dict[str, Any]:
        """Project a Realtor `__NEXT_DATA__` listing dict onto raw fields.

        Uses `_first_present` instead of Python's `or` chain to preserve
        legitimate zero values (e.g. `days_on_market=0` for a new listing,
        studio beds, zero HOA) that would otherwise be silently coerced
        to `None` and skew downstream filtering and ranking.
        """
        description = prop.get("description")
        if not isinstance(description, dict):
            description = {}
        hoa = prop.get("hoa")
        hoa_fee = hoa.get("fee") if isinstance(hoa, dict) else None

        out: dict[str, Any] = {
            "listing_id": _clean_str(
                _first_present(prop, "listing_id", "property_id", "plan_id")
            ),
            "mls_number": _clean_str(
                _first_present(prop, "mls_number", "mls_id", "mls")
            ),
            "property_type": _normalize_property_type(
                _first_present(prop, "type", "prop_type", "sub_type")
            ),
            "price_usd": _to_int(
                _first_present(prop, "list_price", "price", "current_price")
            ),
            "beds": _to_float(
                _first_present(description, "beds", "beds_max", "beds_min")
            ),
            # `baths` is the decimal total (2.5); `baths_full` is only the
            # integer full-bath count (2). Preferring `baths_full` over
            # `baths_total` silently truncates half baths — a 2 full + 1
            # half listing becomes `baths=2.0` instead of `2.5`. Prefer the
            # decimal total first, fall back to full only when total is
            # absent.
            "baths": _to_float(
                _first_present(description, "baths", "baths_total", "baths_full")
            ),
            "living_area_sqft": _to_int(
                _first_present(description, "sqft", "sqft_max", "sqft_min")
            ),
            "lot_size_sqft": _to_int(
                _first_present(description, "lot_sqft", "lot_size")
            ),
            "year_built": _to_int(description.get("year_built")),
            "days_on_market": _to_int(
                _first_present(prop, "days_on_market", "list_date_days")
            ),
            "hoa_monthly_usd": _to_int(hoa_fee),
            "description": _clean_str(
                _first_present(prop, "public_remarks", "description_text")
            ),
        }
        coordinate = prop.get("coordinate")
        if isinstance(coordinate, dict):
            out["latitude"] = _to_float(coordinate.get("lat"))
            out["longitude"] = _to_float(coordinate.get("lon"))
        address = prop.get("address")
        if isinstance(address, dict):
            out["address_line1"] = _clean_str(
                _first_present(address, "line", "street_address", "line1")
            )
            out["city"] = _clean_str(address.get("city"))
            out["state"] = _clean_str(
                _first_present(address, "state_code", "state")
            )
            out["postal_code"] = _clean_str(
                _first_present(address, "postal_code", "zip", "zip_code")
            )
        photos_raw = prop.get("photos")
        if isinstance(photos_raw, list):
            photos: list[PropertyPhoto] = []
            for item in photos_raw:
                if isinstance(item, dict):
                    href = item.get("href") or item.get("url")
                    if isinstance(href, str) and href:
                        photos.append(PropertyPhoto(url=href))
                elif isinstance(item, str) and item:
                    photos.append(PropertyPhoto(url=item))
            if photos:
                out["photos"] = tuple(photos)
        return out

    # ------------------------------------------------------------------
    # Strategy 3: HTML fallback
    # ------------------------------------------------------------------
    def _extract_html_fallback(self, doc: lxml_html.HtmlElement) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Address: prefer the visible `data-testid="address-block"` h1;
        # fall back to og:title / twitter:title / a plain `<h1>` / `.pc-address`.
        address_nodes = doc.xpath('//*[@data-testid="address-block"]')
        if not address_nodes:
            address_nodes = doc.xpath('//*[contains(@class, "pc-address")]')
        parsed_address = None
        if address_nodes:
            parsed_address = _parse_address_line(
                (address_nodes[0].text_content() or "").strip()
            )
        if parsed_address is None:
            title = _meta_content(doc, 'meta[@property="og:title"]')
            parsed_address = _parse_address_line(title) if title else None
        if parsed_address is None:
            h1_nodes = doc.xpath("//h1")
            if h1_nodes:
                parsed_address = _parse_address_line(
                    (h1_nodes[0].text_content() or "").strip()
                )
        if parsed_address is not None:
            out.update(parsed_address)

        # Price: visible `[data-testid="price"]` or `[data-label="price-display"]`
        # first, then twitter:data1 meta tag.
        price_nodes = doc.xpath('//*[@data-testid="price"]')
        if not price_nodes:
            price_nodes = doc.xpath('//*[@data-label="price-display"]')
        if price_nodes:
            visible_price = _parse_price(price_nodes[0].text_content() or "")
            if visible_price is not None:
                out["price_usd"] = visible_price
        if "price_usd" not in out:
            meta_price_text = _meta_content(doc, 'meta[@name="twitter:data1"]')
            if meta_price_text:
                meta_price = _parse_price(meta_price_text)
                if meta_price is not None:
                    out["price_usd"] = meta_price

        # Beds / baths / sqft from a single `[data-testid="property-meta"]` row
        # like "3 bed | 2.5 bath | 1,620 sqft".
        meta_nodes = doc.xpath('//*[@data-testid="property-meta"]')
        if meta_nodes:
            bb = _parse_beds_baths_sqft(meta_nodes[0].text_content() or "")
            for key, value in bb.items():
                out.setdefault(key, value)

        # `[data-label="*"]` property-facts rows.
        for row in doc.xpath("//*[@data-label]"):
            label = (row.get("data-label") or "").strip().lower()
            value = (row.text_content() or "").strip()
            if not label or not value:
                continue
            if label == "property-type" and "property_type" not in out:
                out["property_type"] = _normalize_property_type(value)
            elif label == "year-built" and "year_built" not in out:
                out["year_built"] = _first_int(value)
            elif label == "hoa-fee" and "hoa_monthly_usd" not in out:
                out["hoa_monthly_usd"] = _first_int(value)
            elif label == "days-on-market" and "days_on_market" not in out:
                out["days_on_market"] = _first_int(value)
            elif label == "lot-size" and "lot_size_sqft" not in out:
                out["lot_size_sqft"] = _parse_lot_size_sqft(value)

        # Photo strip: `<img data-testid="photo-*">` or `<img class="photo-card">`.
        photo_nodes = doc.xpath('//img[starts-with(@data-testid, "photo-")]')
        if not photo_nodes:
            photo_nodes = doc.xpath('//img[contains(@class, "photo-card")]')
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
                f"Realtor extractor missing required fields: {missing}",
                portal=_PORTAL,
                url=source_url,
                field=missing[0],
                raw_snippet=raw_html,
            )
        photos_raw = raw.get("photos") or ()
        photos: tuple[PropertyPhoto, ...] = (
            photos_raw if isinstance(photos_raw, tuple) else tuple(photos_raw)
        )
        # Backfill listing_id from the source URL's `_M<digits>-<digits>`
        # segment when neither JSON-LD nor __NEXT_DATA__ supplied one. This
        # keeps the provenance/dedup key stable on HTML-only flows.
        listing_id = raw.get("listing_id") or _listing_id_from_url(source_url)
        return CanonicalProperty(
            source_platform="realtor",
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
    ``{"days_on_market": 0}`` to ``None`` and mask a brand-new listing.
    """
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def _safe_dict(source: dict[str, Any], *keys: str) -> dict[str, Any] | None:
    """Walk a nested dict path and return the terminal dict, or None."""
    cursor: Any = source
    for key in keys:
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(key)
    return cursor if isinstance(cursor, dict) else None


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
        # Reject unsuffixed decimals — a bare "1.2" is never a valid USD price
        # and usually means we matched a stray numeric like "1" from "1.2M"
        # when the suffix match failed.
        if "." in raw:
            return None
        return int(raw)
    except (ValueError, KeyError):
        return None


# Realtor listing URLs look like `.../realestateandhomes-detail/<slug>_M<digits>-<digits>`.
# Capture the full `M<digits>-<digits>` token as the listing id fallback.
_REALTOR_MID_RE = re.compile(r"_M(\d+-\d+)(?:/|$|\?)")


def _listing_id_from_url(source_url: str) -> str | None:
    match = _REALTOR_MID_RE.search(source_url)
    return match.group(1) if match else None


# Residential schema.org / Realtor type tokens used to gate the JSON-LD
# `@type` fallback — generic container types like "RealEstateListing" or
# "Product" must NOT leak into `property_type`.
_RESIDENTIAL_TYPE_KEYS = {
    "condo",
    "condominium",
    "condo_townhome_rowhome_coop",
    "single_family",
    "single_family_home",
    "singlefamilyresidence",
    "house",
    "townhouse",
    "townhome",
    "multi_family",
    "multi_family_home",
    "multifamily",
    "duplex",
    "triplex",
    "fourplex",
    "land",
    "vacantland",
    "vacant_land",
    "farms_ranches",
    "new_construction",
    "mobile",
    "mobile_home",
    "mfd_mobile_home",
    "manufactured",
    "apartment",
    "apartmentcomplex",
    "residence",
}


def _is_residential_type(value: str) -> bool:
    key = value.strip().lower().replace(" ", "_").replace("-", "_")
    return key in _RESIDENTIAL_TYPE_KEYS


# Lot-size parsing for HTML fallback. Realtor reports lot size as either
# "8,712 sq ft" or "0.2 acres"; downstream code wants square feet.
_LOT_SIZE_SQFT_RE = re.compile(
    r"([\d,]+(?:\.\d+)?)\s*(sq\s*ft|sqft|acres?)",
    re.IGNORECASE,
)
_SQFT_PER_ACRE = 43_560


def _parse_lot_size_sqft(text: str) -> int | None:
    """Parse Realtor's lot size strings ("8,712 sq ft" / "0.2 acres") to sqft."""
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


def _parse_beds_baths_sqft(text: str) -> dict[str, Any]:
    """Parse strings like '3 bed | 2.5 bath | 1,620 sqft'."""
    out: dict[str, Any] = {}
    bed_match = re.search(r"(\d+(?:\.\d+)?)\s*bed", text, re.IGNORECASE)
    if bed_match:
        out["beds"] = float(bed_match.group(1))
    bath_match = re.search(r"(\d+(?:\.\d+)?)\s*bath", text, re.IGNORECASE)
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
    key = text.lower().replace(" ", "_").replace("-", "_").replace("/", "_")
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
