"""Tests for :func:`common.portals.detect_portal`."""

from __future__ import annotations

import pytest

from common.errors import InvalidPortalError
from common.portals import detect_portal


class TestDetectPortalHappyPath:
    """Known portal hosts resolve to the expected Portal literal."""

    @pytest.mark.parametrize(
        ("url", "expected"),
        [
            ("https://www.zillow.com/homedetails/1234-main-st/", "zillow"),
            ("https://zillow.com/homedetails/1234-main-st/", "zillow"),
            ("https://www.redfin.com/FL/Miami/123-Main-St/home/9999", "redfin"),
            ("https://redfin.com/FL/Miami/123-Main-St/home/9999", "redfin"),
            ("https://www.realtor.com/realestateandhomes-detail/1234", "realtor"),
            ("https://realtor.com/realestateandhomes-detail/1234", "realtor"),
        ],
    )
    def test_known_portal_host(self, url: str, expected: str) -> None:
        assert detect_portal(url) == expected

    def test_uppercase_host_normalized(self) -> None:
        assert detect_portal("https://WWW.ZILLOW.COM/homedetails/1234-main-st/") == "zillow"


class TestDetectPortalRejects:
    """Unsupported hosts and schemes raise :class:`InvalidPortalError`."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://www.trulia.com/p/fl/miami/1234-main-st",
            "https://hotpads.com/1234-main-st-miami-fl",
            "https://example.com/listing/1",
            "https://subdomain.zillow.com/1234",
        ],
    )
    def test_unsupported_host(self, url: str) -> None:
        with pytest.raises(InvalidPortalError) as excinfo:
            detect_portal(url)
        assert excinfo.value.url == url
        assert excinfo.value.portal is None

    def test_non_http_scheme(self) -> None:
        with pytest.raises(InvalidPortalError):
            detect_portal("ftp://zillow.com/homedetails/1234-main-st/")

    def test_empty_string(self) -> None:
        with pytest.raises(InvalidPortalError):
            detect_portal("")
