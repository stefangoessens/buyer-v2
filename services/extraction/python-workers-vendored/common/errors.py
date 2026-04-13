"""Typed errors for the fetch layer.

Orchestrators retry on exceptions whose ``retryable`` flag is True. Subclasses
carry enough context (``request_id``, ``portal``, ``url``, ``vendor``) to be
correlated with structured logs and metrics without forcing callers to
re-construct their own request state.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from common.types import Portal


class FetchError(Exception):
    """Base for all fetch-layer errors.

    Subclass choice communicates whether the orchestrator should retry. The
    ``retryable`` attribute is set by subclasses and overridden on a
    per-instance basis only where a vendor error can be either (see
    :class:`VendorFetchError`).
    """

    retryable: bool = False

    def __init__(
        self,
        message: str,
        *,
        request_id: str,
        portal: Portal | None,
        url: str,
        vendor: str,
    ) -> None:
        super().__init__(message)
        self.request_id = request_id
        self.portal: Portal | None = portal
        self.url = url
        self.vendor = vendor

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}("
            f"message={self.args[0]!r}, "
            f"request_id={self.request_id!r}, "
            f"portal={self.portal!r}, "
            f"url={self.url!r}, "
            f"vendor={self.vendor!r}, "
            f"retryable={self.retryable!r})"
        )


class TransientFetchError(FetchError):
    """Temporary failure — the orchestrator should retry with backoff."""

    retryable = True


class PermanentFetchError(FetchError):
    """Non-recoverable failure — do not retry."""

    retryable = False


class TimeoutFetchError(TransientFetchError):
    """Client-side or vendor-side timeout."""


class AntiBotFetchError(TransientFetchError):
    """Vendor flagged a bot challenge (403, empty body, captcha signal)."""


class VendorFetchError(FetchError):
    """Vendor-internal error (5xx). Retryability is configurable per instance."""

    def __init__(
        self,
        message: str,
        *,
        request_id: str,
        portal: Portal | None,
        url: str,
        vendor: str,
        retryable: bool = True,
    ) -> None:
        super().__init__(
            message,
            request_id=request_id,
            portal=portal,
            url=url,
            vendor=vendor,
        )
        self.retryable = retryable


class QuotaExceededError(PermanentFetchError):
    """Per-minute or monthly budget tripped before issuing the request."""


class InvalidPortalError(PermanentFetchError):
    """Portal detection failed for the given URL."""
