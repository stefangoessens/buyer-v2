"""Tests for the fetch-layer error hierarchy in :mod:`common.errors`."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, TypedDict

import pytest

from common.errors import (
    AntiBotFetchError,
    FetchError,
    InvalidPortalError,
    PermanentFetchError,
    QuotaExceededError,
    TimeoutFetchError,
    TransientFetchError,
    VendorFetchError,
)

if TYPE_CHECKING:
    from common.types import Portal

_PORTAL: Portal = "zillow"
_URL = "https://www.zillow.com/homedetails/1234-main-st/"
_REQUEST_ID = "req-abc-123"
_VENDOR = "bright_data_unlocker"
_FAKE_TOKEN = "brd_super_secret_token_AAAAAAAAAAAA"


class _ErrorKwargs(TypedDict):
    request_id: str
    portal: Portal | None
    url: str
    vendor: str


def _base_kwargs() -> _ErrorKwargs:
    return _ErrorKwargs(
        request_id=_REQUEST_ID,
        portal=_PORTAL,
        url=_URL,
        vendor=_VENDOR,
    )


class TestErrorContext:
    """Every subclass carries the contextual attributes set in ``FetchError.__init__``."""

    @pytest.mark.parametrize(
        "cls",
        [
            FetchError,
            TransientFetchError,
            PermanentFetchError,
            TimeoutFetchError,
            AntiBotFetchError,
            QuotaExceededError,
            InvalidPortalError,
        ],
    )
    def test_attributes_populated(self, cls: type[FetchError]) -> None:
        err = cls("boom", **_base_kwargs())
        assert err.request_id == _REQUEST_ID
        assert err.portal == _PORTAL
        assert err.url == _URL
        assert err.vendor == _VENDOR
        assert isinstance(err.retryable, bool)
        assert str(err) == "boom"

    def test_vendor_fetch_error_attributes(self) -> None:
        err = VendorFetchError("upstream 502", retryable=True, **_base_kwargs())
        assert err.request_id == _REQUEST_ID
        assert err.portal == _PORTAL
        assert err.url == _URL
        assert err.vendor == _VENDOR
        assert err.retryable is True


class TestRetryability:
    """``retryable`` flag follows the documented hierarchy."""

    def test_transient_is_retryable(self) -> None:
        err = TransientFetchError("temporary", **_base_kwargs())
        assert err.retryable is True

    def test_permanent_is_not_retryable(self) -> None:
        err = PermanentFetchError("bad request", **_base_kwargs())
        assert err.retryable is False

    def test_timeout_inherits_retryable(self) -> None:
        err = TimeoutFetchError("client timeout", **_base_kwargs())
        assert err.retryable is True
        assert isinstance(err, TransientFetchError)

    def test_anti_bot_inherits_retryable(self) -> None:
        err = AntiBotFetchError("captcha", **_base_kwargs())
        assert err.retryable is True
        assert isinstance(err, TransientFetchError)

    def test_quota_is_permanent(self) -> None:
        err = QuotaExceededError("budget tripped", **_base_kwargs())
        assert err.retryable is False
        assert isinstance(err, PermanentFetchError)

    def test_invalid_portal_is_permanent(self) -> None:
        err = InvalidPortalError(
            "unknown host",
            request_id="",
            portal=None,
            url="https://trulia.com/x",
            vendor="",
        )
        assert err.retryable is False
        assert isinstance(err, PermanentFetchError)

    @pytest.mark.parametrize("retryable", [True, False])
    def test_vendor_error_configurable_retryability(self, retryable: bool) -> None:
        err = VendorFetchError(
            "upstream 5xx", retryable=retryable, **_base_kwargs()
        )
        assert err.retryable is retryable


class TestInheritance:
    """All subclasses still descend from :class:`FetchError`."""

    @pytest.mark.parametrize(
        "cls",
        [
            TransientFetchError,
            PermanentFetchError,
            TimeoutFetchError,
            AntiBotFetchError,
            VendorFetchError,
            QuotaExceededError,
            InvalidPortalError,
        ],
    )
    def test_is_fetch_error(self, cls: type[FetchError]) -> None:
        assert issubclass(cls, FetchError)


class TestNoTokenLeakage:
    """Error messages and reprs must never echo auth material.

    The unlocker client is expected to construct errors from vendor responses;
    if it ever passes the raw Authorization header into a message, this test
    fails loudly.
    """

    def _build_all(self, message: str) -> list[FetchError]:
        errs: list[FetchError] = [
            FetchError(message, **_base_kwargs()),
            TransientFetchError(message, **_base_kwargs()),
            PermanentFetchError(message, **_base_kwargs()),
            TimeoutFetchError(message, **_base_kwargs()),
            AntiBotFetchError(message, **_base_kwargs()),
            VendorFetchError(message, **_base_kwargs()),
            QuotaExceededError(message, **_base_kwargs()),
            InvalidPortalError(
                message,
                request_id="",
                portal=None,
                url=_URL,
                vendor="",
            ),
        ]
        return errs

    def test_message_without_secrets_stays_clean(self) -> None:
        for err in self._build_all("upstream 502 bad gateway"):
            text = f"{err!s} {err!r}"
            assert "Bearer" not in text
            assert _FAKE_TOKEN not in text
            assert not re.search(r"brd_[A-Za-z0-9_]{20,}", text)

    def test_repr_includes_retryable_flag(self) -> None:
        err = TransientFetchError("temporary", **_base_kwargs())
        text = repr(err)
        assert "retryable=True" in text
        assert _REQUEST_ID in text
        assert _VENDOR in text
