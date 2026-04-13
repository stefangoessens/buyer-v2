"""Errors raised by portal-specific deterministic extractors.

These are distinct from ``common.errors`` (which covers transport / fetch
failures). Parser errors describe *content* problems: HTML that cannot be
parsed at all, required fields that have disappeared because a portal
shifted its schema, or optional fields that are simply absent.

``raw_snippet`` is clipped to the first 200 chars so that error objects
remain safe to log and repr without dumping an entire listing page.
"""

from __future__ import annotations

_SNIPPET_LIMIT = 200


class ParserError(Exception):
    """Base class for deterministic extractor failures."""

    def __init__(
        self,
        msg: str,
        *,
        portal: str,
        url: str,
        field: str | None = None,
        raw_snippet: str | None = None,
    ) -> None:
        super().__init__(msg)
        self.portal = portal
        self.url = url
        self.field = field
        self.raw_snippet = (
            raw_snippet[:_SNIPPET_LIMIT] if raw_snippet is not None else None
        )

    def __repr__(self) -> str:
        snippet = self.raw_snippet
        if snippet is not None and len(snippet) > _SNIPPET_LIMIT:
            snippet = snippet[:_SNIPPET_LIMIT]
        return (
            f"{type(self).__name__}("
            f"message={self.args[0]!r}, "
            f"portal={self.portal!r}, "
            f"url={self.url!r}, "
            f"field={self.field!r}, "
            f"raw_snippet={snippet!r})"
        )


class MalformedHTMLError(ParserError):
    """HTML cannot be parsed at all (lxml failure)."""


class SchemaShiftError(ParserError):
    """All extraction strategies failed for a required field.

    Signals that the portal's markup has changed in a way the deterministic
    extractor no longer handles — escalate to Browser Use fallback.
    """


class FieldMissingError(ParserError):
    """An optional field is simply absent from the listing."""
