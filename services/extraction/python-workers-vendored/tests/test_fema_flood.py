"""Tests for :mod:`sources.fema_flood` — pure HTTP FEMA NFHL client.

All tests use :class:`httpx.MockTransport` — no real network calls.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from sources.fema_flood import (
    FemaFloodZone,
    FemaLookupError,
    lookup_flood_zone,
)


def _make_client(handler: Any) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_lookup_returns_zone_ae_with_bfe_for_coastal_point() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["params"] = dict(request.url.params)
        return httpx.Response(
            200,
            json={
                "features": [
                    {
                        "attributes": {
                            "FLD_ZONE": "AE",
                            "STATIC_BFE": 8.0,
                            "ZONE_SUBTY": None,
                        }
                    }
                ]
            },
        )

    with _make_client(handler) as client:
        result = lookup_flood_zone(27.1, -82.4, client=client)

    assert isinstance(result, FemaFloodZone)
    assert result.zone == "AE"
    assert result.base_flood_elevation == 8.0
    assert result.flood_insurance_required is True
    assert "base flood elevation" in result.zone_description
    assert result.latitude == 27.1
    assert result.longitude == -82.4
    # FEMA expects lon,lat order in the geometry param.
    assert captured["params"]["geometry"] == "-82.4,27.1"
    assert captured["params"]["f"] == "json"
    assert captured["params"]["returnGeometry"] == "false"


def test_lookup_returns_zone_x_with_no_bfe_for_inland_point() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "features": [
                    {
                        "attributes": {
                            "FLD_ZONE": "X",
                            "STATIC_BFE": -9999,
                            "ZONE_SUBTY": "AREA OF MINIMAL FLOOD HAZARD",
                        }
                    }
                ]
            },
        )

    with _make_client(handler) as client:
        result = lookup_flood_zone(28.5, -81.3, client=client)

    assert result.zone == "X"
    assert result.base_flood_elevation is None
    assert result.flood_insurance_required is False
    assert result.zone_description == "Minimal flood risk"


def test_lookup_returns_unknown_when_features_array_empty() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"features": []})

    with _make_client(handler) as client:
        result = lookup_flood_zone(25.0, -80.0, client=client)

    assert result.zone == "Unknown"
    assert result.base_flood_elevation is None
    assert result.flood_insurance_required is False


def test_lookup_wraps_http_error_into_fema_lookup_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="upstream boom")

    with _make_client(handler) as client:
        with pytest.raises(FemaLookupError) as excinfo:
            lookup_flood_zone(27.0, -82.0, client=client)

    assert isinstance(excinfo.value.__cause__, httpx.HTTPError)


def test_lookup_raises_when_fld_zone_missing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"features": [{"attributes": {}}]})

    with _make_client(handler) as client:
        with pytest.raises(FemaLookupError):
            lookup_flood_zone(27.0, -82.0, client=client)
