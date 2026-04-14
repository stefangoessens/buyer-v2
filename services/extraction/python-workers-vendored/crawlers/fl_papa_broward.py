"""Broward County Property Appraiser (BCPA) crawler.

Fetches assessed value, ownership history, exemptions, and the most
recent sale from web.bcpa.net via the Browser Use Cloud client (KIN-1076).
The crawler is gated behind ``is_configured()`` — when the Cloud API
key is absent, ``lookup_property`` returns ``None`` so callers can
fall back to a "data unavailable" UI state instead of raising at
import time.

The actual production cutover (API key provisioning, soak period,
real BCPA HTML capture) is tracked as follow-up work — this module
ships the contract + types + Browser Use task description so crawl
card consumers can wire it in today.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lib.browser_use_client import (
    BrowserUseClient,
    BrowserUseError,
    is_configured,
)


BCPA_PORTAL_URL = "https://web.bcpa.net/bcpaclient/"


@dataclass(frozen=True, slots=True)
class OwnershipHistoryEntry:
    owner: str
    sale_date: str | None
    sale_price: int | None


@dataclass(frozen=True, slots=True)
class BrowardPapaRecord:
    folio: str
    current_owner: str
    is_corporate: bool
    assessed_value: int | None
    just_value: int | None
    taxable_value: int | None
    exemptions: tuple[str, ...]
    last_sale_price: int | None
    last_sale_date: str | None
    ownership_history: tuple[OwnershipHistoryEntry, ...]
    tax_bill_total: int | None
    source_url: str


_CORPORATE_KEYWORDS = ("LLC", "INC", "CORP", "TRUST", "LP", "LTD", "HOLDINGS")


def _detect_corporate_owner(owner: str) -> bool:
    """Heuristic: corporate owners contain LLC/INC/CORP/TRUST/etc."""
    upper = owner.upper()
    return any(kw in upper for kw in _CORPORATE_KEYWORDS)


def _build_task_description(address: str | None, folio: str | None) -> str:
    """Build the Browser Use task prompt for a BCPA lookup."""
    if folio:
        target = f"folio number {folio}"
    elif address:
        target = f'street address "{address}"'
    else:
        raise ValueError("Either address or folio must be provided")
    return (
        f"Visit {BCPA_PORTAL_URL}, search for {target}, navigate to the "
        "property detail page, and return a JSON object with: "
        "folio, currentOwner, assessedValue, justValue, taxableValue, "
        "exemptions (array of strings), lastSalePrice, lastSaleDate, "
        "ownershipHistory (array of {owner, saleDate, salePrice}), "
        "taxBillTotal, sourceUrl. Use the most recent values from the "
        "current tax year."
    )


def _parse_run_output(output: dict[str, Any], source_url: str) -> BrowardPapaRecord:
    """Project the Cloud run output dict into a BrowardPapaRecord.

    Defensive parsing: missing fields become None, malformed numeric
    fields fall through to None rather than raising.
    """
    def _to_int(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    current_owner = str(output.get("currentOwner") or "")
    history_raw = output.get("ownershipHistory") or []
    ownership_history: list[OwnershipHistoryEntry] = []
    if isinstance(history_raw, list):
        for entry in history_raw:
            if not isinstance(entry, dict):
                continue
            ownership_history.append(
                OwnershipHistoryEntry(
                    owner=str(entry.get("owner") or ""),
                    sale_date=entry.get("saleDate"),
                    sale_price=_to_int(entry.get("salePrice")),
                )
            )
    exemptions_raw = output.get("exemptions") or []
    exemptions: tuple[str, ...] = (
        tuple(str(e) for e in exemptions_raw)
        if isinstance(exemptions_raw, list)
        else ()
    )
    return BrowardPapaRecord(
        folio=str(output.get("folio") or ""),
        current_owner=current_owner,
        is_corporate=_detect_corporate_owner(current_owner),
        assessed_value=_to_int(output.get("assessedValue")),
        just_value=_to_int(output.get("justValue")),
        taxable_value=_to_int(output.get("taxableValue")),
        exemptions=exemptions,
        last_sale_price=_to_int(output.get("lastSalePrice")),
        last_sale_date=output.get("lastSaleDate"),
        ownership_history=tuple(ownership_history),
        tax_bill_total=_to_int(output.get("taxBillTotal")),
        source_url=source_url or BCPA_PORTAL_URL,
    )


def lookup_property(
    *,
    address: str | None = None,
    folio: str | None = None,
    client: BrowserUseClient | None = None,
) -> BrowardPapaRecord | None:
    """Look up a Broward property via the Browser Use Cloud crawler.

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
        allowed_domains=["bcpa.net", "web.bcpa.net"],
    )
    result = cloud_client.get_result(run.run_id)
    if result.status != "success":
        raise BrowserUseError(
            f"BCPA lookup failed with status: {result.status}"
        )
    return _parse_run_output(result.output, source_url=BCPA_PORTAL_URL)
