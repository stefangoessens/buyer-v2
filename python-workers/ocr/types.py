"""Pydantic request/response models for the OCR worker service.

The shapes here are the source of truth for the Convex disclosure engine that
calls this service. Any change to these models is a breaking API change and
must be mirrored in the ai-disclosure-engine TypeScript types.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ErrorKind = Literal["invalid_file", "unauthorized", "ocr_failed"]


class OcrRequest(BaseModel):
    """Incoming request body for ``POST /ocr/extract``."""

    file_url: str = Field(
        ...,
        description="Signed HTTPS URL to the raw file in Convex storage.",
    )
    file_id: str = Field(
        ...,
        description="Opaque id used for logging / trace correlation.",
    )
    storage_key: str = Field(
        ...,
        description="Convex storage key for idempotency keying.",
    )


class OcrPage(BaseModel):
    """Extracted text for a single page.

    For multi-page PDFs there is one entry per page; for single images the
    response carries a single entry with ``page_number = 1``.
    """

    page_number: int = Field(..., ge=1)
    text: str


class OcrResponse(BaseModel):
    """Successful response body for ``POST /ocr/extract``."""

    text: str = Field(..., description="Concatenated plain text across all pages.")
    per_page: list[OcrPage] = Field(..., description="Per-page extracted text.")
    detected_lang: str = Field(
        ...,
        description="ISO 639-1 language code (e.g. 'en', 'es').",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Overall confidence in [0, 1].",
    )


class OcrErrorBody(BaseModel):
    """JSON body returned with any non-200 status."""

    error: str
    kind: ErrorKind
    detail: str | None = None
