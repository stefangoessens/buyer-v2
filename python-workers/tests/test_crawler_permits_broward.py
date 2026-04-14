"""Tests for :mod:`crawlers.fl_permits_broward`.

These tests avoid any real network: the Cloud client is either
injected as a tiny stub or skipped entirely by gating on
``is_configured()``. The synthetic fixture under
``python-workers/fixtures/permits_broward/sample_response.json`` stands
in for a Browser Use Cloud run output — when the API key arrives we
will capture a real run and replace it.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest

from crawlers.fl_permits_broward import (
    PERMITS_PORTAL_URL,
    BrowardPermitsRecord,
    Permit,
    _parse_run_output,
    lookup_permits,
)
from lib.browser_use_client import (
    BrowserUseError,
    BrowserUseResult,
    BrowserUseRun,
)


FIXTURE_PATH = (
    pathlib.Path(__file__).resolve().parent.parent
    / "fixtures"
    / "permits_broward"
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
            cost_usd=0.14,
            duration_ms=15432,
            proxy_country="US",
        )


def test_lookup_permits_returns_none_when_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROWSER_USE_API_KEY", raising=False)
    assert lookup_permits(address="123 Main St, Fort Lauderdale, FL") is None
    assert lookup_permits(folio="5042-19-01-0560") is None


def test_lookup_permits_raises_value_error_without_address_or_folio() -> None:
    # Inject a stub client so the is_configured() early-return doesn't
    # short-circuit the validation path we want to exercise here.
    stub = _StubBrowserUseClient(output=_load_fixture())
    with pytest.raises(ValueError, match="address or folio"):
        lookup_permits(client=stub)  # type: ignore[arg-type]


def test_lookup_permits_parses_record_from_injected_client() -> None:
    fixture = _load_fixture()
    stub = _StubBrowserUseClient(output=fixture, result_status="success")

    record = lookup_permits(
        folio="5042-19-01-0560",
        client=stub,  # type: ignore[arg-type]
    )

    assert isinstance(record, BrowardPermitsRecord)
    assert len(record.permits) == 3
    assert record.permits[0].permit_number == "BLD2024-12345"
    assert record.permits[0].type == "Roof"
    assert record.permits[0].cost == 18500
    assert record.permits[0].status == "Finalled"
    assert record.permits[0].final_date == "2024-04-22"
    # MEC2025-00450 is Issued -> should appear in open_permits.
    assert len(record.open_permits) == 1
    assert record.open_permits[0].permit_number == "MEC2025-00450"
    assert record.open_permits[0].status == "Issued"
    # Violations + inspections are parsed through.
    assert len(record.violations) == 1
    assert record.violations[0].violation_number == "CE2024-00231"
    assert record.violations[0].status == "Open"
    assert record.violations[0].resolved_date is None
    assert len(record.inspections) == 1
    assert record.inspections[0].permit_number == "BLD2024-12345"
    assert record.inspections[0].result == "Passed"
    assert record.source_url == PERMITS_PORTAL_URL
    # Verify the stub was invoked with the expected allowed domains.
    assert len(stub.create_run_calls) == 1
    assert stub.create_run_calls[0]["allowed_domains"] == [
        "broward.org",
        "www.broward.org",
    ]
    assert "folio number 5042-19-01-0560" in stub.create_run_calls[0]["task"]
    assert stub.get_result_calls == ["run_stub_1"]


def test_parse_run_output_computes_open_permits_from_active_statuses() -> None:
    output: dict[str, Any] = {
        "permits": [
            {"permitNumber": "A", "type": "Roof", "status": "Finalled"},
            {"permitNumber": "B", "type": "Electrical", "status": "Issued"},
            {"permitNumber": "C", "type": "Mechanical", "status": "In Progress"},
            {"permitNumber": "D", "type": "Plumbing", "status": "active"},
            {"permitNumber": "E", "type": "Demo", "status": "Pending"},
            {"permitNumber": "F", "type": "Roof", "status": "Expired"},
        ],
    }
    record = _parse_run_output(output, source_url="")
    assert len(record.permits) == 6
    open_numbers = [p.permit_number for p in record.open_permits]
    # Issued, In Progress, active, Pending — not Finalled or Expired.
    assert open_numbers == ["B", "C", "D", "E"]
    # Source URL falls back to the default portal URL when empty.
    assert record.source_url == PERMITS_PORTAL_URL


def test_parse_run_output_handles_malformed_cost_fields() -> None:
    malformed: dict[str, Any] = {
        "permits": [
            {
                "permitNumber": "BLD-1",
                "type": "Roof",
                "description": "x",
                "issueDate": "2024-01-01",
                "status": "Finalled",
                "finalDate": "2024-02-01",
                "cost": "not-a-number",
            },
            {
                "permitNumber": "BLD-2",
                "type": "Electrical",
                "description": "y",
                "status": "Issued",
                "cost": "3200",  # stringified int still parses
            },
            {
                "permitNumber": "BLD-3",
                "type": "Mechanical",
                "status": "Issued",
                "cost": None,
            },
            {
                "permitNumber": "BLD-4",
                "type": "Plumbing",
                "status": "Issued",
                "cost": {"nested": True},
            },
            "not a dict",  # should be skipped entirely
        ],
        "violations": [
            "not a dict",
            {
                "violationNumber": "V-1",
                "type": "Code",
                "issueDate": "2024-06-01",
                "status": "Open",
            },
        ],
        "inspections": "wrong type",  # should fall through to ()
    }
    record = _parse_run_output(malformed, source_url="")
    assert len(record.permits) == 4
    assert record.permits[0].cost is None
    assert record.permits[1].cost == 3200
    assert record.permits[2].cost is None
    assert record.permits[3].cost is None
    # Description passes through, missing date fields become None.
    assert record.permits[1].description == "y"
    assert record.permits[1].issue_date is None
    assert record.permits[1].final_date is None
    # Missing description on BLD-3 falls back to empty string.
    assert record.permits[2].description == ""
    # All four permits are "Issued" or "Finalled"; three Issued = open.
    assert len(record.open_permits) == 3
    # Malformed violation entry is skipped; dict entry survives.
    assert len(record.violations) == 1
    assert record.violations[0].violation_number == "V-1"
    assert record.violations[0].resolved_date is None
    # Non-list inspections falls through to empty tuple.
    assert record.inspections == ()


def test_lookup_permits_raises_when_run_status_is_not_success() -> None:
    stub = _StubBrowserUseClient(
        output={},
        result_status="failed",
    )
    with pytest.raises(BrowserUseError, match="Permits lookup failed"):
        lookup_permits(
            folio="5042-19-01-0560",
            client=stub,  # type: ignore[arg-type]
        )


def test_lookup_permits_uses_address_when_no_folio() -> None:
    stub = _StubBrowserUseClient(output=_load_fixture(), result_status="success")
    record = lookup_permits(
        address="123 Main St, Fort Lauderdale, FL",
        client=stub,  # type: ignore[arg-type]
    )
    assert isinstance(record, BrowardPermitsRecord)
    task = stub.create_run_calls[0]["task"]
    assert '"123 Main St, Fort Lauderdale, FL"' in task
    # Permit dataclass is frozen/slots — spot-check immutability.
    assert isinstance(record.permits[0], Permit)
