"""FEMA NFHL flood zone lookup via the public ArcGIS REST endpoint.

Hits FEMA's National Flood Hazard Layer at:
  https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query

The 'identify' / 'query' endpoint accepts a point geometry and returns
the matching flood zone polygon attributes (FLD_ZONE, STATIC_BFE, etc).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

_NFHL_QUERY_URL = (
    "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query"
)

_ZONE_DESCRIPTIONS: dict[str, str] = {
    "X": "Minimal flood risk",
    "AE": "1% annual chance flood (base flood elevation determined)",
    "VE": "Coastal high hazard with wave action",
    "A": "1% annual chance flood (no base flood elevation)",
    "AH": "Shallow flooding (1-3 feet, ponding)",
    "AO": "Shallow flooding (1-3 feet, sheet flow)",
    "D": "Possible but undetermined flood hazard",
}
_MANDATED_ZONES = {"AE", "VE", "A", "AH", "AO"}
_BFE_SENTINEL = -9999.0


class FemaLookupError(Exception):
    """Raised when the FEMA NFHL lookup fails or returns unparseable data."""


@dataclass(frozen=True, slots=True)
class FemaFloodZone:
    zone: str
    base_flood_elevation: float | None
    zone_description: str
    flood_insurance_required: bool
    source_url: str
    latitude: float
    longitude: float


def _unknown(lat: float, lon: float, source_url: str) -> FemaFloodZone:
    return FemaFloodZone(
        zone="Unknown",
        base_flood_elevation=None,
        zone_description="No NFHL flood zone polygon intersects this point",
        flood_insurance_required=False,
        source_url=source_url,
        latitude=lat,
        longitude=lon,
    )


def _coerce_bfe(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value <= _BFE_SENTINEL:
        return None
    return value


def lookup_flood_zone(
    lat: float,
    lon: float,
    *,
    timeout_s: float = 15.0,
    client: httpx.Client | None = None,
) -> FemaFloodZone:
    """Query FEMA NFHL for the flood zone covering ``(lat, lon)``.

    Pass an ``httpx.Client`` (with a ``MockTransport`` in tests) to avoid
    real network calls. When ``client`` is ``None`` a one-shot client is
    created using ``timeout_s``.
    """

    params: dict[str, str] = {
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "FLD_ZONE,STATIC_BFE,ZONE_SUBTY",
        "returnGeometry": "false",
        "f": "json",
    }

    owns_client = client is None
    http = client if client is not None else httpx.Client(timeout=timeout_s)
    try:
        try:
            response = http.get(_NFHL_QUERY_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise FemaLookupError(f"FEMA NFHL request failed: {exc}") from exc
        except ValueError as exc:
            raise FemaLookupError(f"FEMA NFHL returned non-JSON body: {exc}") from exc
    finally:
        if owns_client:
            http.close()

    features = payload.get("features") if isinstance(payload, dict) else None
    if not features:
        return _unknown(lat, lon, _NFHL_QUERY_URL)

    try:
        attributes = features[0]["attributes"]
        raw_zone = attributes["FLD_ZONE"]
    except (KeyError, IndexError, TypeError) as exc:
        raise FemaLookupError(f"FEMA NFHL response missing FLD_ZONE: {exc}") from exc

    if raw_zone is None:
        return _unknown(lat, lon, _NFHL_QUERY_URL)

    zone = str(raw_zone).strip().upper()
    bfe = _coerce_bfe(attributes.get("STATIC_BFE"))
    description = _ZONE_DESCRIPTIONS.get(zone, f"FEMA flood zone {zone}")

    return FemaFloodZone(
        zone=zone,
        base_flood_elevation=bfe,
        zone_description=description,
        flood_insurance_required=zone in _MANDATED_ZONES,
        source_url=_NFHL_QUERY_URL,
        latitude=lat,
        longitude=lon,
    )
