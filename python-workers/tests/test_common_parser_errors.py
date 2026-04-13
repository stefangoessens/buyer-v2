"""Tests for :mod:`common.parser_errors` — the deterministic-extractor error hierarchy."""

from __future__ import annotations

import re

import pytest

from common.parser_errors import (
    FieldMissingError,
    MalformedHTMLError,
    ParserError,
    SchemaShiftError,
)

_PORTAL = "zillow"
_URL = "https://www.zillow.com/homedetails/1234-main-st/"
_FIELD = "price_usd"
_SNIPPET_LIMIT = 200


class TestParserErrorInit:
    """``ParserError.__init__`` populates every context attribute."""

    def test_attributes_populated(self) -> None:
        err = ParserError(
            "boom",
            portal=_PORTAL,
            url=_URL,
            field=_FIELD,
            raw_snippet="<html>snippet</html>",
        )
        assert err.portal == _PORTAL
        assert err.url == _URL
        assert err.field == _FIELD
        assert err.raw_snippet == "<html>snippet</html>"
        assert str(err) == "boom"

    def test_field_defaults_to_none(self) -> None:
        err = ParserError("boom", portal=_PORTAL, url=_URL)
        assert err.field is None
        assert err.raw_snippet is None

    def test_raw_snippet_preserved_when_short(self) -> None:
        err = ParserError(
            "boom",
            portal=_PORTAL,
            url=_URL,
            raw_snippet="short",
        )
        assert err.raw_snippet == "short"


class TestSnippetTruncation:
    """``raw_snippet`` is clipped to ≤ 200 chars."""

    def test_raw_snippet_truncated_to_limit(self) -> None:
        big = "x" * 1000
        err = ParserError(
            "boom",
            portal=_PORTAL,
            url=_URL,
            raw_snippet=big,
        )
        assert err.raw_snippet is not None
        assert len(err.raw_snippet) == _SNIPPET_LIMIT

    def test_raw_snippet_truncated_boundary(self) -> None:
        boundary = "a" * _SNIPPET_LIMIT
        err = ParserError(
            "boom",
            portal=_PORTAL,
            url=_URL,
            raw_snippet=boundary,
        )
        assert err.raw_snippet == boundary
        assert len(err.raw_snippet) == _SNIPPET_LIMIT

    def test_repr_snippet_never_exceeds_limit(self) -> None:
        big = "y" * 5000
        err = ParserError(
            "boom",
            portal=_PORTAL,
            url=_URL,
            raw_snippet=big,
        )
        text = repr(err)
        # Extract the snippet value from the repr — everything between the
        # raw_snippet= quotes.
        match = re.search(r"raw_snippet='([^']*)'", text)
        assert match is not None
        assert len(match.group(1)) <= _SNIPPET_LIMIT

    def test_repr_does_not_contain_raw_html_beyond_limit(self) -> None:
        big = "<div>" + ("z" * 4000) + "</div>"
        err = ParserError(
            "boom",
            portal=_PORTAL,
            url=_URL,
            raw_snippet=big,
        )
        text = f"{err!s} {err!r}"
        # The repr should never contain more than _SNIPPET_LIMIT contiguous
        # characters from the input HTML.
        assert "z" * (_SNIPPET_LIMIT + 1) not in text


class TestSubclasses:
    """``MalformedHTMLError``, ``SchemaShiftError``, ``FieldMissingError`` are ``ParserError``."""

    @pytest.mark.parametrize(
        "cls",
        [MalformedHTMLError, SchemaShiftError, FieldMissingError],
    )
    def test_is_parser_error(self, cls: type[ParserError]) -> None:
        assert issubclass(cls, ParserError)

    @pytest.mark.parametrize(
        "cls",
        [MalformedHTMLError, SchemaShiftError, FieldMissingError],
    )
    def test_subclass_init_preserves_attributes(
        self, cls: type[ParserError]
    ) -> None:
        err = cls(
            "boom",
            portal=_PORTAL,
            url=_URL,
            field=_FIELD,
            raw_snippet="<html/>",
        )
        assert err.portal == _PORTAL
        assert err.url == _URL
        assert err.field == _FIELD
        assert err.raw_snippet == "<html/>"
        assert isinstance(err, ParserError)
        assert isinstance(err, Exception)

    def test_subclasses_are_distinct(self) -> None:
        assert MalformedHTMLError is not SchemaShiftError
        assert SchemaShiftError is not FieldMissingError
        assert MalformedHTMLError is not FieldMissingError
        assert not issubclass(MalformedHTMLError, SchemaShiftError)
        assert not issubclass(SchemaShiftError, FieldMissingError)


class TestNoHtmlLeakage:
    """Regex sweep: error messages and reprs never dump more than 200 chars of raw HTML."""

    def test_message_never_contains_unbounded_html(self) -> None:
        huge = "<html>" + ("a" * 10_000) + "</html>"
        err = ParserError(
            "oops",
            portal=_PORTAL,
            url=_URL,
            raw_snippet=huge,
        )
        text = f"{err!s} {err!r}"
        # No run of more than _SNIPPET_LIMIT identical chars should appear.
        assert not re.search(r"a{" + str(_SNIPPET_LIMIT + 1) + r",}", text)

    def test_repr_is_safe_to_log(self) -> None:
        huge = "x" * 10_000
        for cls in (ParserError, MalformedHTMLError, SchemaShiftError, FieldMissingError):
            err = cls(
                "failure",
                portal=_PORTAL,
                url=_URL,
                field="description",
                raw_snippet=huge,
            )
            text = repr(err)
            # repr should be bounded: class name + attributes + clipped snippet.
            # A safe upper bound: the class info + 200 chars of snippet + surrounding
            # quoting is well under 1 KB.
            assert len(text) < 1024
