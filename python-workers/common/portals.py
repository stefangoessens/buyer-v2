"""Portal detection from listing URLs."""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlparse

from common.errors import InvalidPortalError

if TYPE_CHECKING:
    from common.types import Portal

_PORTAL_HOSTS: dict[str, Portal] = {
    "zillow.com": "zillow",
    "www.zillow.com": "zillow",
    "redfin.com": "redfin",
    "www.redfin.com": "redfin",
    "realtor.com": "realtor",
    "www.realtor.com": "realtor",
}


def detect_portal(url: str) -> Portal:
    """Return the :data:`Portal` that owns ``url``.

    Raises :class:`common.errors.InvalidPortalError` for hosts we do not
    support. The error carries empty request/vendor metadata because portal
    detection happens before a fetch is issued.
    """

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise InvalidPortalError(
            f"Unsupported URL scheme: {parsed.scheme!r}",
            request_id="",
            portal=None,
            url=url,
            vendor="",
        )
    host = (parsed.hostname or "").lower()
    portal = _PORTAL_HOSTS.get(host)
    if portal is None:
        raise InvalidPortalError(
            f"Unsupported portal host: {host!r}",
            request_id="",
            portal=None,
            url=url,
            vendor="",
        )
    return portal
