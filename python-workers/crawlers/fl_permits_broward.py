"""Broward Building Department permits crawler.

Mirrors the PAPA crawler pattern (KIN-1072) for the Broward permit
portal. Returns past permits, open permits, violations, and inspection
history for a single property. Gates behind ``is_configured()`` so the
module ships safely without the Browser Use Cloud API key provisioned.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lib.browser_use_client import (
    BrowserUseClient,
    BrowserUseError,
    is_configured,
)


PERMITS_PORTAL_URL = "https://www.broward.org/buildingpermits/"


@dataclass(frozen=True, slots=True)
class Permit:
    permit_number: str
    type: str
    description: str
    issue_date: str | None
    status: str
    final_date: str | None
    cost: int | None


@dataclass(frozen=True, slots=True)
class Violation:
    violation_number: str
    type: str
    issue_date: str | None
    status: str
    resolved_date: str | None


@dataclass(frozen=True, slots=True)
class Inspection:
    permit_number: str
    type: str
    date: str | None
    result: str
    notes: str


@dataclass(frozen=True, slots=True)
class BrowardPermitsRecord:
    permits: tuple[Permit, ...]
    open_permits: tuple[Permit, ...]
    violations: tuple[Violation, ...]
    inspections: tuple[Inspection, ...]
    source_url: str


_OPEN_PERMIT_STATUSES = {"issued", "in_progress", "active", "pending"}


def _is_open_status(status: str) -> bool:
    return status.lower().replace(" ", "_") in _OPEN_PERMIT_STATUSES


def _build_task_description(address: str | None, folio: str | None) -> str:
    """Build the Browser Use task prompt for a Broward permit lookup."""
    if folio:
        target = f"folio number {folio}"
    elif address:
        target = f'street address "{address}"'
    else:
        raise ValueError("Either address or folio must be provided")
    return (
        f"Visit {PERMITS_PORTAL_URL}, search for permits filed against "
        f"{target}, navigate to the property record, and return a JSON "
        "object with: permits (array of {permitNumber, type, description, "
        "issueDate, status, finalDate, cost}), violations (array of "
        "{violationNumber, type, issueDate, status, resolvedDate}), "
        "inspections (array of {permitNumber, type, date, result, notes}), "
        "sourceUrl. Include the most recent 50 permits and any open "
        "violations. Cost values should be plain integers in USD."
    )


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_permit(entry: dict[str, Any]) -> Permit:
    return Permit(
        permit_number=str(entry.get("permitNumber") or ""),
        type=str(entry.get("type") or ""),
        description=str(entry.get("description") or ""),
        issue_date=entry.get("issueDate"),
        status=str(entry.get("status") or "unknown"),
        final_date=entry.get("finalDate"),
        cost=_to_int(entry.get("cost")),
    )


def _parse_violation(entry: dict[str, Any]) -> Violation:
    return Violation(
        violation_number=str(entry.get("violationNumber") or ""),
        type=str(entry.get("type") or ""),
        issue_date=entry.get("issueDate"),
        status=str(entry.get("status") or "unknown"),
        resolved_date=entry.get("resolvedDate"),
    )


def _parse_inspection(entry: dict[str, Any]) -> Inspection:
    return Inspection(
        permit_number=str(entry.get("permitNumber") or ""),
        type=str(entry.get("type") or ""),
        date=entry.get("date"),
        result=str(entry.get("result") or ""),
        notes=str(entry.get("notes") or ""),
    )


def _parse_run_output(output: dict[str, Any], source_url: str) -> BrowardPermitsRecord:
    """Project the Cloud run output dict into a BrowardPermitsRecord.

    Defensive parsing: malformed entries are skipped, malformed numeric
    fields fall through to None rather than raising.
    """
    permits_raw = output.get("permits") or []
    violations_raw = output.get("violations") or []
    inspections_raw = output.get("inspections") or []

    permits = tuple(
        _parse_permit(p) for p in permits_raw if isinstance(p, dict)
    )
    open_permits = tuple(p for p in permits if _is_open_status(p.status))
    violations = tuple(
        _parse_violation(v) for v in violations_raw if isinstance(v, dict)
    )
    inspections = tuple(
        _parse_inspection(i) for i in inspections_raw if isinstance(i, dict)
    )

    return BrowardPermitsRecord(
        permits=permits,
        open_permits=open_permits,
        violations=violations,
        inspections=inspections,
        source_url=source_url or PERMITS_PORTAL_URL,
    )


def lookup_permits(
    *,
    address: str | None = None,
    folio: str | None = None,
    client: BrowserUseClient | None = None,
) -> BrowardPermitsRecord | None:
    """Look up permits + violations + inspections for a Broward property.

    Returns None when the Cloud API key is not configured — callers
    should treat None as "data unavailable" and surface a graceful
    empty state. Raises BrowserUseError only when configuration is
    present but the upstream call fails.
    """
    if client is None and not is_configured():
        return None
    if address is None and folio is None:
        raise ValueError("Either address or folio must be provided")
    task = _build_task_description(address=address, folio=folio)
    cloud_client = client or BrowserUseClient()
    run = cloud_client.create_run(
        task=task,
        allowed_domains=["broward.org", "www.broward.org"],
    )
    result = cloud_client.get_result(run.run_id)
    if result.status != "success":
        raise BrowserUseError(
            f"Permits lookup failed with status: {result.status}"
        )
    return _parse_run_output(result.output, source_url=PERMITS_PORTAL_URL)
