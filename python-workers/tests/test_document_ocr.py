"""Unit tests for the OCR extraction pipeline.

These exercise :func:`ocr.extract_text.extract_from_bytes` directly — no HTTP
layer — so they stay fast and close to the logic under test. Tests that need
a real tesseract or poppler binary are guarded with ``pytest.importorskip`` /
``skipif`` so they skip cleanly in environments without the system deps.
"""

from __future__ import annotations

import shutil

import pytest

from ocr.extract_text import (
    OcrFailedError,
    OcrInvalidFileError,
    extract_from_bytes,
)
from ocr.types import OcrResponse

# Tiny single-page text-native PDF carrying the string
# "buyer-v2 ocr smoke test" in a single Tj operator. Built by hand so we
# don't need reportlab or any other PDF-building dep.
_SMOKE_PDF_TEXT = "buyer-v2 ocr smoke test"
_SMOKE_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n"
    b"<< /Type /Catalog /Pages 2 0 R >>\n"
    b"endobj\n"
    b"2 0 obj\n"
    b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>\n"
    b"endobj\n"
    b"3 0 obj\n"
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
    b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
    b"endobj\n"
    b"4 0 obj\n"
    b"<< /Length 70 >>\n"
    b"stream\n"
    b"BT\n"
    b"/F1 12 Tf\n"
    b"72 720 Td\n"
    b"(buyer-v2 ocr smoke test) Tj\n"
    b"ET\n"
    b"endstream\n"
    b"endobj\n"
    b"5 0 obj\n"
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n"
    b"endobj\n"
    b"xref\n"
    b"0 6\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000058 00000 n \n"
    b"0000000109 00000 n \n"
    b"0000000202 00000 n \n"
    b"0000000290 00000 n \n"
    b"trailer\n"
    b"<< /Size 6 /Root 1 0 R >>\n"
    b"startxref\n"
    b"353\n"
    b"%%EOF\n"
)


def _require_pdfplumber() -> None:
    """Skip the caller if pdfplumber is not importable.

    The core OCR tests depend on pdfplumber being available — tests that only
    check mime-type validation don't need it.
    """

    pytest.importorskip("pdfplumber")


async def test_extract_rejects_unsupported_mime() -> None:
    """Unknown mime types must raise :class:`OcrInvalidFileError`."""

    with pytest.raises(OcrInvalidFileError):
        await extract_from_bytes(content=b"fake", mime_type="application/x-zip")


async def test_extract_rejects_blank_mime() -> None:
    """Empty / missing mime types must also be rejected as invalid files."""

    with pytest.raises(OcrInvalidFileError):
        await extract_from_bytes(content=b"fake", mime_type="")


async def test_extract_text_from_simple_pdf() -> None:
    """The pdfplumber fast path extracts text from a text-native PDF."""

    _require_pdfplumber()

    response = await extract_from_bytes(
        content=_SMOKE_PDF_BYTES,
        mime_type="application/pdf",
    )

    assert isinstance(response, OcrResponse)
    assert _SMOKE_PDF_TEXT in response.text
    assert len(response.per_page) == 1
    assert response.per_page[0].page_number == 1
    assert _SMOKE_PDF_TEXT in response.per_page[0].text


async def test_extract_returns_confidence_in_range() -> None:
    """Confidence must be a float in the [0, 1] interval."""

    _require_pdfplumber()

    response = await extract_from_bytes(
        content=_SMOKE_PDF_BYTES,
        mime_type="application/pdf",
    )

    assert 0.0 <= response.confidence <= 1.0
    # Fast-path hit should return the high-confidence default.
    assert response.confidence >= 0.9


async def test_extract_per_page_count_matches_pdf_pages() -> None:
    """``per_page`` must carry exactly one entry for a single-page PDF."""

    _require_pdfplumber()

    response = await extract_from_bytes(
        content=_SMOKE_PDF_BYTES,
        mime_type="application/pdf",
    )

    assert len(response.per_page) == 1
    assert response.per_page[0].page_number == 1


async def test_extract_detects_language_for_english_pdf() -> None:
    """``detected_lang`` is a short ISO 639-1 code (default 'en' on failure)."""

    _require_pdfplumber()

    response = await extract_from_bytes(
        content=_SMOKE_PDF_BYTES,
        mime_type="application/pdf",
    )

    # Either langdetect returned a real code, or we fell back to 'en'. Both
    # are acceptable — we just need it to be a short ISO code.
    assert isinstance(response.detected_lang, str)
    assert 1 <= len(response.detected_lang) <= 5


@pytest.mark.skipif(
    shutil.which("tesseract") is None,
    reason="tesseract binary not installed",
)
async def test_extract_rejects_unreadable_image() -> None:
    """Pillow must reject garbage bytes claiming to be an image."""

    pytest.importorskip("PIL")

    with pytest.raises((OcrInvalidFileError, OcrFailedError)):
        await extract_from_bytes(
            content=b"not an image",
            mime_type="image/png",
        )
