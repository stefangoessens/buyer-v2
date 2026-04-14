"""Tests for :mod:`crawlers.fl_papa_broward`.

These tests avoid any real network: the Cloud client is either
injected as a tiny stub or skipped entirely by gating on
``is_configured()``. The synthetic fixture under
``python-workers/fixtures/papa_broward/sample_response.json`` stands
in for a Browser Use Cloud run output — when the API key arrives we
will capture a real run and replace it.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest

from crawlers.fl_papa_broward import (
    BCPA_PORTAL_URL,
    BrowardPapaRecord,
    OwnershipHistoryEntry,
    _detect_corporate_owner,
    _parse_run_output,
    lookup_property,
)
from lib.browser_use_client import (
    BrowserUseError,
    BrowserUseResult,
    BrowserUseRun,
)


FIXTURE_PATH = (
    pathlib.Path(__file__).resolve().parent.parent
    / "fixtures"
    / "papa_broward"
    / "sample_response.json"
)


def _load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


class _StubBrowserUseClient:
    """Tiny handwritten stub — avoids pulling in unittest.mock magic."""

    def __init__(
        self,
        *,
        output: dict[str, Any] | None = None,
        result_status: str = "success",
    ) -> None:
        self._output = output or {}
        self._result_status = result_status
        self.create_run_calls: list[dict[str, Any]] = []
        self.get_result_calls: list[str] = []

    def create_run(
        self,
        *,
        task: str,
        allowed_domains: list[str] | None = None,
        max_steps: int = 25,
    ) -> BrowserUseRun:
        self.create_run_calls.append(
            {
                "task": task,
                "allowed_domains": allowed_domains,
                "max_steps": max_steps,
            }
        )
        return BrowserUseRun(
            run_id="run_stub_1",
            status="queued",
            started_at=None,
            finished_at=None,
        )

    def get_result(self, run_id: str) -> BrowserUseResult:
        self.get_result_calls.append(run_id)
        return BrowserUseResult(
            run_id=run_id,
            status=self._result_status,
            output=self._output,
            cost_usd=0.12,
            duration_ms=12345,
            proxy_country="US",
        )


def test_lookup_property_returns_none_when_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROWSER_USE_API_KEY", raising=False)
    assert lookup_property(address="123 Main St, Fort Lauderdale, FL") is None
    assert lookup_property(folio="5042-19-01-0560") is None


def test_lookup_property_raises_value_error_without_address_or_folio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Inject a stub client so the is_configured() early-return doesn't
    # short-circuit the validation path we want to exercise here.
    stub = _StubBrowserUseClient(output=_load_fixture())
    with pytest.raises(ValueError, match="address or folio"):
        lookup_property(client=stub)  # type: ignore[arg-type]


def test_lookup_property_parses_record_from_injected_client() -> None:
    fixture = _load_fixture()
    stub = _StubBrowserUseClient(output=fixture, result_status="success")

    record = lookup_property(
        folio="5042-19-01-0560",
        client=stub,  # type: ignore[arg-type]
    )

    assert isinstance(record, BrowardPapaRecord)
    assert record.folio == "5042-19-01-0560"
    assert record.current_owner == "MIRABELLA HOLDINGS LLC"
    assert record.is_corporate is True
    assert record.assessed_value == 412000
    assert record.just_value == 425000
    assert record.taxable_value == 412000
    assert record.exemptions == ()
    assert record.last_sale_price == 380000
    assert record.last_sale_date == "2024-08-15"
    assert record.tax_bill_total == 7842
    assert record.source_url == BCPA_PORTAL_URL
    assert len(record.ownership_history) == 2
    assert record.ownership_history[0] == OwnershipHistoryEntry(
        owner="MIRABELLA HOLDINGS LLC",
        sale_date="2024-08-15",
        sale_price=380000,
    )
    assert record.ownership_history[1].owner == "SMITH JOHN R"
    # Verify the stub was actually invoked with the expected allowed domains.
    assert len(stub.create_run_calls) == 1
    assert stub.create_run_calls[0]["allowed_domains"] == [
        "bcpa.net",
        "web.bcpa.net",
    ]
    assert "folio number 5042-19-01-0560" in stub.create_run_calls[0]["task"]
    assert stub.get_result_calls == ["run_stub_1"]


def test_detect_corporate_owner_identifies_entity_suffixes() -> None:
    assert _detect_corporate_owner("MIRABELLA HOLDINGS LLC") is True
    assert _detect_corporate_owner("Acme Inc") is True
    assert _detect_corporate_owner("BIG CAPITAL CORP") is True
    assert _detect_corporate_owner("SMITH FAMILY TRUST") is True
    assert _detect_corporate_owner("sunshine lp") is True
    assert _detect_corporate_owner("Harbor Ltd") is True
    assert _detect_corporate_owner("SMITH JOHN R") is False
    assert _detect_corporate_owner("Jane Doe") is False


def test_parse_run_output_handles_malformed_numeric_fields() -> None:
    malformed: dict[str, Any] = {
        "folio": "1234",
        "currentOwner": "SMITH JOHN R",
        "assessedValue": "not-a-number",
        "justValue": None,
        "taxableValue": "412000",  # stringified int still parses
        "exemptions": "homestead",  # wrong type — should fall through to ()
        "lastSalePrice": {"nested": True},
        "lastSaleDate": "2024-01-01",
        "ownershipHistory": [
            {"owner": "SMITH JOHN R", "saleDate": "2024-01-01", "salePrice": "abc"},
            "not a dict",
        ],
        "taxBillTotal": None,
    }
    record = _parse_run_output(malformed, source_url="")
    assert record.folio == "1234"
    assert record.is_corporate is False
    assert record.assessed_value is None
    assert record.just_value is None
    assert record.taxable_value == 412000
    assert record.exemptions == ()
    assert record.last_sale_price is None
    assert record.tax_bill_total is None
    # String-valued lastSaleDate is preserved as-is.
    assert record.last_sale_date == "2024-01-01"
    # Only the dict-shaped ownership entry survives.
    assert len(record.ownership_history) == 1
    assert record.ownership_history[0].sale_price is None
    # Source URL falls back to the default portal URL when empty.
    assert record.source_url == BCPA_PORTAL_URL


def test_lookup_property_raises_when_run_status_is_not_success() -> None:
    stub = _StubBrowserUseClient(
        output={},
        result_status="failed",
    )
    with pytest.raises(BrowserUseError, match="BCPA lookup failed"):
        lookup_property(
            folio="5042-19-01-0560",
            client=stub,  # type: ignore[arg-type]
        )
