"""Shared dataclass types for the fetch layer."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from collections.abc import Mapping
    from datetime import datetime

Portal = Literal["zillow", "redfin", "realtor"]
"""Supported listing portals. Detection lives in ``common.portals.detect_portal``."""


def _new_request_id() -> str:
    """Return a fresh uuid4 hex string used to correlate logs, metrics, and retries."""
    return uuid.uuid4().hex


@dataclass(frozen=True, slots=True)
class FetchRequest:
    """Immutable description of a fetch to be performed by the orchestrator."""

    url: str
    portal: Portal
    timeout_s: float = 30.0
    retries: int = 3
    request_id: str = field(default_factory=_new_request_id)


@dataclass(frozen=True, slots=True)
class FetchResult:
    """Result of a successful fetch, including cost and latency for observability."""

    url: str
    portal: Portal
    status_code: int
    html: str
    fetched_at: datetime
    cost_usd: float
    latency_ms: int
    vendor: str
    request_id: str
    attempts: int
    headers: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
