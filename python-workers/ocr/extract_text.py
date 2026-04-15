"""OCR extraction pipeline — pure logic, no HTTP.

Dispatches on MIME type:

* ``application/pdf`` — tries ``pdfplumber`` first (fast path for text-native
  PDFs). If the fast path yields fewer than 50 characters total, falls back to
  rasterising each page via ``pdf2image`` and running ``pytesseract`` on the
  images.
* ``image/jpeg`` / ``image/png`` — runs ``pytesseract`` directly on the image
  and returns a single-page response with ``page_number = 1``.
* anything else raises :class:`OcrInvalidFileError`.

The HTTP layer in :mod:`ocr.app` converts the typed exceptions below into
``400`` / ``422`` / ``500`` responses.
"""

from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

from .types import OcrPage, OcrResponse

if TYPE_CHECKING:
    from collections.abc import Iterable

logger = logging.getLogger(__name__)

# Below this many characters we assume the PDF is a scan rather than
# text-native and fall back to the OCR path.
_PDFPLUMBER_MIN_CHARS = 50

# Default confidence scores used when an engine does not report its own.
_PDFPLUMBER_CONFIDENCE = 0.95
_PYTESSERACT_FALLBACK_CONFIDENCE = 0.6

_PDF_MIME_TYPES = {"application/pdf", "application/x-pdf"}
_IMAGE_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png"}


class OcrInvalidFileError(Exception):
    """Raised when the input bytes/mime type are unusable."""


class OcrFailedError(Exception):
    """Raised when an OCR engine fails to produce any usable output."""


async def extract_from_bytes(
    *,
    content: bytes,
    mime_type: str,
) -> OcrResponse:
    """Extract text from raw file ``content`` with MIME type ``mime_type``.

    This is the single entry point for all extraction. It is safe to call from
    async code; the underlying libraries are sync but the function is declared
    ``async`` so the HTTP layer can ``await`` it uniformly and we can later
    off-load to a thread pool without touching callers.
    """

    mime = (mime_type or "").strip().lower()

    if mime in _PDF_MIME_TYPES:
        return _extract_pdf(content)
    if mime in _IMAGE_MIME_TYPES:
        return _extract_image(content)

    raise OcrInvalidFileError(f"unsupported mime type: {mime_type!r}")


def _extract_pdf(content: bytes) -> OcrResponse:
    """Extract text from a PDF, preferring the fast text-native path."""

    fast_pages = _pdfplumber_extract(content)
    fast_total = sum(len(p.text) for p in fast_pages)

    if fast_total >= _PDFPLUMBER_MIN_CHARS:
        full_text = _join_pages(fast_pages)
        return OcrResponse(
            text=full_text,
            per_page=fast_pages,
            detected_lang=_detect_lang(full_text),
            confidence=_PDFPLUMBER_CONFIDENCE,
        )

    # Fast path was empty / very short — treat as a scanned PDF and fall back
    # to rasterise-then-OCR. If that also yields nothing, raise OcrFailedError.
    ocr_pages, ocr_confidence = _pytesseract_pdf(content)
    ocr_total = sum(len(p.text) for p in ocr_pages)

    if ocr_total == 0 and fast_total == 0:
        raise OcrFailedError(
            "neither pdfplumber nor pytesseract produced any text for the PDF",
        )

    pages = ocr_pages if ocr_total >= fast_total else fast_pages
    confidence = ocr_confidence if ocr_total >= fast_total else _PDFPLUMBER_CONFIDENCE
    full_text = _join_pages(pages)

    return OcrResponse(
        text=full_text,
        per_page=pages,
        detected_lang=_detect_lang(full_text),
        confidence=confidence,
    )


def _extract_image(content: bytes) -> OcrResponse:
    """Extract text from a single image via pytesseract."""

    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise OcrFailedError(f"pytesseract/Pillow not installed: {exc}") from exc

    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except Exception as exc:  # noqa: BLE001 — Pillow raises many concrete types
        raise OcrInvalidFileError(f"unreadable image: {exc}") from exc

    try:
        text = pytesseract.image_to_string(image)
        confidence = _pytesseract_confidence(image)
    except pytesseract.TesseractNotFoundError as exc:
        raise OcrFailedError(
            "tesseract binary not found on PATH; install tesseract to enable OCR",
        ) from exc
    except Exception as exc:  # noqa: BLE001 — pytesseract raises subprocess errors
        raise OcrFailedError(f"pytesseract failed: {exc}") from exc

    cleaned = text.strip()
    page = OcrPage(page_number=1, text=cleaned)
    return OcrResponse(
        text=cleaned,
        per_page=[page],
        detected_lang=_detect_lang(cleaned),
        confidence=confidence,
    )


def _pdfplumber_extract(content: bytes) -> list[OcrPage]:
    """Extract text from each page with pdfplumber.

    Returns an empty list if pdfplumber fails to open the file — the caller
    decides whether that's a hard error or a signal to fall back to OCR.
    """

    try:
        import pdfplumber
    except ImportError as exc:
        raise OcrFailedError(f"pdfplumber not installed: {exc}") from exc

    pages: list[OcrPage] = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                try:
                    raw = page.extract_text() or ""
                except Exception:  # noqa: BLE001 — pdfplumber raises various errors
                    logger.warning("pdfplumber failed on page %d", idx)
                    raw = ""
                pages.append(OcrPage(page_number=idx, text=raw.strip()))
    except Exception as exc:  # noqa: BLE001 — defensive: malformed PDFs
        logger.warning("pdfplumber could not open PDF: %s", exc)
        return []

    return pages


def _pytesseract_pdf(content: bytes) -> tuple[list[OcrPage], float]:
    """Rasterise each PDF page and OCR it with pytesseract.

    Returns ``(pages, confidence)``. Confidence is the mean word-level
    confidence reported by tesseract, falling back to a fixed default if
    tesseract did not return usable confidence numbers.
    """

    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError as exc:
        raise OcrFailedError(
            f"pytesseract/pdf2image not installed: {exc}",
        ) from exc

    try:
        images = convert_from_bytes(content)
    except Exception as exc:  # noqa: BLE001 — pdf2image surfaces poppler errors
        raise OcrFailedError(f"pdf2image failed to rasterise PDF: {exc}") from exc

    pages: list[OcrPage] = []
    confidences: list[float] = []
    for idx, image in enumerate(images, start=1):
        try:
            text = pytesseract.image_to_string(image)
        except pytesseract.TesseractNotFoundError as exc:
            raise OcrFailedError(
                "tesseract binary not found on PATH; install tesseract to enable OCR",
            ) from exc
        except Exception as exc:  # noqa: BLE001 — defensive around subprocess
            raise OcrFailedError(f"pytesseract failed on page {idx}: {exc}") from exc

        pages.append(OcrPage(page_number=idx, text=text.strip()))
        page_conf = _pytesseract_confidence(image)
        if page_conf is not None:
            confidences.append(page_conf)

    mean_confidence = (
        sum(confidences) / len(confidences)
        if confidences
        else _PYTESSERACT_FALLBACK_CONFIDENCE
    )
    return pages, mean_confidence


def _pytesseract_confidence(image: object) -> float:
    """Return mean word-level confidence in [0, 1] for an image.

    Tesseract reports per-word confidence on a 0–100 scale (or -1 for words it
    could not score). We compute the mean of the positive scores and fall back
    to a fixed default on any failure.
    """

    try:
        import pytesseract
    except ImportError:
        return _PYTESSERACT_FALLBACK_CONFIDENCE

    try:
        data = pytesseract.image_to_data(
            image,
            output_type=pytesseract.Output.DICT,
        )
    except Exception:  # noqa: BLE001 — never let confidence scoring break OCR
        return _PYTESSERACT_FALLBACK_CONFIDENCE

    raw_confidences: Iterable[object] = data.get("conf", []) or []
    scored: list[float] = []
    for value in raw_confidences:
        if not isinstance(value, (int, float, str)):
            continue
        try:
            score = float(value)
        except (TypeError, ValueError):
            continue
        if score < 0:
            continue
        scored.append(score)

    if not scored:
        return _PYTESSERACT_FALLBACK_CONFIDENCE

    mean = sum(scored) / len(scored) / 100.0
    return max(0.0, min(1.0, mean))


def _detect_lang(text: str) -> str:
    """Return an ISO 639-1 language code for ``text``.

    Falls back to ``"en"`` when ``langdetect`` is unavailable, the text is
    empty, or detection raises (``langdetect`` raises ``LangDetectException``
    for inputs that contain no alphabetic characters).
    """

    if not text or not text.strip():
        return "en"

    try:
        from langdetect import DetectorFactory, detect
    except ImportError:
        return "en"

    # Deterministic results across runs — required for tests.
    DetectorFactory.seed = 0

    try:
        detected = detect(text)
    except Exception:  # noqa: BLE001 — langdetect uses its own exception type
        return "en"
    return str(detected) if detected else "en"


def _join_pages(pages: list[OcrPage]) -> str:
    """Join per-page text into one string, skipping empty pages."""

    return "\n\n".join(p.text for p in pages if p.text).strip()
