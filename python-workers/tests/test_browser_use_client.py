"""Tests for :mod:`lib.browser_use_client` — Browser Use Cloud REST wrapper.

All tests use :class:`httpx.MockTransport` — no real network calls.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from lib.browser_use_client import (
    DEFAULT_BASE_URL,
    BrowserUseClient,
    BrowserUseError,
    BrowserUseResult,
    BrowserUseRun,
    is_configured,
)


def _make_client(handler: Any) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_is_configured_returns_true_when_api_key_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BROWSER_USE_API_KEY", "test-key-xyz")
    assert is_configured() is True


def test_is_configured_returns_false_when_api_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROWSER_USE_API_KEY", raising=False)
    assert is_configured() is False


def test_create_run_posts_to_runs_with_auth_and_residential_proxy() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["content_type"] = request.headers.get("content-type")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "id": "run_abc123",
                "status": "queued",
                "started_at": None,
                "finished_at": None,
            },
        )

    with _make_client(handler) as http_client:
        client = BrowserUseClient(
            api_key="test-key-xyz",
            client=http_client,
        )
        run = client.create_run(
            task="Scrape property list",
            allowed_domains=["example.com"],
        )

    assert isinstance(run, BrowserUseRun)
    assert run.run_id == "run_abc123"
    assert run.status == "queued"
    assert captured["method"] == "POST"
    assert captured["url"] == f"{DEFAULT_BASE_URL}/runs"
    assert captured["auth"] == "Bearer test-key-xyz"
    assert captured["content_type"] == "application/json"
    assert captured["body"]["task"] == "Scrape property list"
    assert captured["body"]["max_steps"] == 25
    assert captured["body"]["use_residential_proxy"] is True
    assert captured["body"]["allowed_domains"] == ["example.com"]


def test_create_run_wraps_non_2xx_response_as_browser_use_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="rate limited")

    with _make_client(handler) as http_client:
        client = BrowserUseClient(api_key="test-key", client=http_client)
        with pytest.raises(BrowserUseError) as excinfo:
            client.create_run(task="boom")

    assert excinfo.value.status_code == 429
    assert excinfo.value.body == "rate limited"
    assert "429" in str(excinfo.value)


def test_create_run_raises_when_api_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BROWSER_USE_API_KEY", raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with _make_client(handler) as http_client:
        client = BrowserUseClient(client=http_client)
        with pytest.raises(BrowserUseError) as excinfo:
            client.create_run(task="no key")

    assert "BROWSER_USE_API_KEY is not set" in str(excinfo.value)


def test_get_result_parses_cost_and_duration_fields() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url) == f"{DEFAULT_BASE_URL}/runs/run_abc123"
        return httpx.Response(
            200,
            json={
                "id": "run_abc123",
                "status": "success",
                "output": {"records": [{"address": "123 Main St"}]},
                "cost_usd": 0.42,
                "duration_ms": 18500,
                "proxy_country": "US",
            },
        )

    with _make_client(handler) as http_client:
        client = BrowserUseClient(api_key="test-key", client=http_client)
        result = client.get_result("run_abc123")

    assert isinstance(result, BrowserUseResult)
    assert result.run_id == "run_abc123"
    assert result.status == "success"
    assert result.output == {"records": [{"address": "123 Main St"}]}
    assert result.cost_usd == 0.42
    assert result.duration_ms == 18500
    assert result.proxy_country == "US"


def test_get_result_wraps_non_2xx_response_as_browser_use_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="run not found")

    with _make_client(handler) as http_client:
        client = BrowserUseClient(api_key="test-key", client=http_client)
        with pytest.raises(BrowserUseError) as excinfo:
            client.get_result("missing")

    assert excinfo.value.status_code == 404
    assert excinfo.value.body == "run not found"


def test_custom_base_url_is_honored(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(
            200,
            json={"id": "run_x", "status": "queued"},
        )

    with _make_client(handler) as http_client:
        client = BrowserUseClient(
            api_key="key",
            base_url="https://custom.example.com/",
            client=http_client,
        )
        client.create_run(task="probe")

    assert captured["url"] == "https://custom.example.com/runs"
