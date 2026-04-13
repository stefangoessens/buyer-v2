"""Zillow search results page parser.

Separate from `parsers/zillow.py` (which handles HDP = home detail pages).
Search results pages (`/{city}/sold/`) embed their data in the same
`__NEXT_DATA__` script tag but under a different path:

    props.pageProps.searchPageState.cat1.searchResults.listResults[]

Each list result is a fully-populated sold comp with zpid, address,
soldPrice, beds, baths, area (sqft), latLong, and an `hdpData.homeInfo`
block that has dateSold + zestimate + taxAssessedValue.

This parser is used by the `/seed-comps` endpoint on the extraction
service to populate the comp pool for a subject property. The pipeline
is: subject → zip + beds → `/seed-comps` → parse → insert rows into
Convex `properties` with `role: "comp"` → the comps/insights engines
read from that pool.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from lxml import html as lxml_html


_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)


@dataclass(frozen=True, slots=True)
class SoldComp:
    """A single sold-comp extracted from a Zillow search results page.

    All numeric fields are optional — Zillow does not always populate
    every attribute on every card. Callers must handle None.
    """

    zpid: str
    source_url: str
    address_line1: str
    city: str
    state: str
    postal_code: str
    latitude: float | None
    longitude: float | None
    sold_price_usd: int | None
    sold_date: str | None  # ISO-8601
    beds: int | None
    baths: float | None
    living_area_sqft: int | None
    property_type: str | None
    days_on_market: int | None
    zestimate_usd: int | None


def parse_zillow_search_results(html_text: str, source_url: str) -> list[SoldComp]:
    """Parse a Zillow search results HTML page into a list of SoldComp.

    Returns an empty list if the page has no `__NEXT_DATA__` blob, no
    `listResults` key, or the blob has an unexpected shape. Never raises
    for parse failures — the caller decides what to do with empty lists.
    """
    match = _NEXT_DATA_RE.search(html_text)
    if not match:
        return []

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    try:
        results = (
            payload["props"]["pageProps"]["searchPageState"]["cat1"]
            ["searchResults"]["listResults"]
        )
    except (KeyError, TypeError):
        return []

    if not isinstance(results, list):
        return []

    comps: list[SoldComp] = []
    for raw in results:
        comp = _parse_one(raw, source_url)
        if comp is not None:
            comps.append(comp)
    return comps


def _parse_one(raw: dict[str, Any], source_url: str) -> SoldComp | None:
    zpid = raw.get("zpid")
    if not zpid:
        return None

    detail_url = raw.get("detailUrl") or ""
    street = raw.get("addressStreet")
    city = raw.get("addressCity")
    state = raw.get("addressState")
    zip_code = raw.get("addressZipcode")
    if not (street and city and state and zip_code):
        return None

    lat_long = raw.get("latLong") or {}
    lat = _as_float(lat_long.get("latitude"))
    lng = _as_float(lat_long.get("longitude"))

    sold_price = _as_int(raw.get("unformattedPrice"))
    hdp = (raw.get("hdpData") or {}).get("homeInfo") or {}
    if sold_price is None:
        sold_price = _as_int(hdp.get("price"))

    sold_date = _iso_from_ms(hdp.get("dateSold"))
    beds = _as_int(raw.get("beds") or hdp.get("bedrooms"))
    baths = _as_float(raw.get("baths") or hdp.get("bathrooms"))
    sqft = _as_int(raw.get("area") or hdp.get("livingArea"))
    home_type = hdp.get("homeType")
    dom = _as_int(hdp.get("daysOnZillow"))
    zestimate = _as_int(hdp.get("zestimate"))

    return SoldComp(
        zpid=str(zpid),
        source_url=detail_url or source_url,
        address_line1=str(street).strip(),
        city=str(city).strip(),
        state=str(state).strip().upper(),
        postal_code=str(zip_code).strip(),
        latitude=lat,
        longitude=lng,
        sold_price_usd=sold_price,
        sold_date=sold_date,
        beds=beds,
        baths=baths,
        living_area_sqft=sqft,
        property_type=_normalize_property_type(home_type),
        days_on_market=dom,
        zestimate_usd=zestimate,
    )


def _as_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _iso_from_ms(value: Any) -> str | None:
    ms = _as_int(value)
    if ms is None or ms <= 0:
        return None
    try:
        return (
            datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )
    except (OSError, OverflowError, ValueError):
        return None


def _normalize_property_type(value: Any) -> str | None:
    if not value or not isinstance(value, str):
        return None
    mapping = {
        "CONDO": "condo",
        "SINGLE_FAMILY": "single_family",
        "TOWNHOUSE": "townhouse",
        "MULTI_FAMILY": "multi_family",
        "APARTMENT": "apartment",
        "MANUFACTURED": "manufactured",
        "LOT": "lot",
    }
    return mapping.get(value.upper(), value.lower())


def search_url_for_zip(
    zip_code: str,
    *,
    beds_min: int | None = None,
    status: str = "sold",
) -> str:
    """Build a Zillow search URL for a given zip and optional bed filter."""
    base = f"https://www.zillow.com/homes/{zip_code}_rb/"
    parts: list[str] = []
    if status == "sold":
        parts.append("sold")
    if beds_min is not None and beds_min > 0:
        parts.append(f"{beds_min}-_beds")
    if parts:
        return base + "/".join(parts) + "/"
    return base
