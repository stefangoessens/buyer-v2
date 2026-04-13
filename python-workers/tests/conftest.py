"""Shared pytest fixtures for the fetch-layer test suite."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from collections.abc import Iterator

pytest_plugins = ["pytest_asyncio"]


_BRIGHT_DATA_ENV_VARS = (
    "BRIGHT_DATA_UNLOCKER_TOKEN",
    "BRIGHT_DATA_ZONE",
    "BRIGHT_DATA_MAX_CONCURRENT",
    "BRIGHT_DATA_MAX_REQUESTS_PER_MIN",
    "BRIGHT_DATA_MONTHLY_BUDGET_USD",
    "BRIGHT_DATA_FALLBACK_COST_PER_REQUEST_USD",
)


@pytest.fixture
def monkey_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    """Clear all ``BRIGHT_DATA_*`` env vars so tests start from a clean slate.

    Tests can then call ``monkey_env.setenv(...)`` to add the specific values
    they need without leaking configuration between cases.
    """
    for var in _BRIGHT_DATA_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    yield monkeypatch


@pytest.fixture
def fake_unlocker() -> Any:
    """Return a fresh :class:`fetch.unlocker.FakeUnlocker` instance.

    Imported lazily so tests that do not touch the fetch layer (``test_portals``,
    ``test_errors``) can run even if the fetch module is under construction.
    """
    from fetch.unlocker import FakeUnlocker

    return FakeUnlocker()
