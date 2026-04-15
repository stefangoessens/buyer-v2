"""FastAPI entry point for the OCR worker service.

Exposes ``GET /healthz`` (unauthenticated) and ``POST /ocr/extract`` (bearer
auth). Downloads the target file from the Convex signed URL carried in the
request body, then delegates extraction to :func:`ocr.extract_text.extract_from_bytes`.

Run locally:

.. code-block:: bash

   OCR_SERVICE_TOKEN=local-dev-token \\
       uvicorn ocr.app:app --host 0.0.0.0 --port 8080 --reload
"""

from __future__ import annotations

import logging
import os

import httpx
from fastapi import FastAPI, Header, HTTPException

from .extract_text import (
    OcrFailedError,
    OcrInvalidFileError,
    extract_from_bytes,
)
from .types import OcrErrorBody, OcrRequest, OcrResponse

logger = logging.getLogger(__name__)

# 20 MB cap matches the acceptance criteria in KIN-1078.
_MAX_FILE_BYTES = 20 * 1024 * 1024
_DOWNLOAD_TIMEOUT_SECONDS = 60.0

app = FastAPI(
    title="buyer-v2 OCR worker",
    description=(
        "Standalone FastAPI service that extracts text from PDF / JPEG / "
        "PNG files. Used by the Convex disclosure parser engine to turn "
        "buyer-uploaded disclosure packets into searchable text."
    ),
)


def _get_token() -> str | None:
    """Read the shared secret from the environment (``None`` if unset)."""

    return os.environ.get("OCR_SERVICE_TOKEN")


def _check_auth(authorization: str | None) -> None:
    """Raise ``401`` on missing/bad bearer, ``500`` if the service is unconfigured."""

    token = _get_token()
    if not token:
        # Refuse to serve if the operator forgot to wire the secret — leaking
        # an unauthenticated OCR endpoint is worse than a loud 500.
        raise HTTPException(
            status_code=500,
            detail=OcrErrorBody(
                error="service_not_configured",
                kind="ocr_failed",
                detail="OCR_SERVICE_TOKEN is not set",
            ).model_dump(),
        )
    expected = f"Bearer {token}"
    if not authorization or authorization != expected:
        raise HTTPException(
            status_code=401,
            detail=OcrErrorBody(
                error="unauthorized",
                kind="unauthorized",
            ).model_dump(),
        )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness probe used by Railway and local dev."""

    return {"status": "ok"}


@app.post("/ocr/extract", response_model=OcrResponse)
async def ocr_extract(
    req: OcrRequest,
    authorization: str | None = Header(default=None),
) -> OcrResponse:
    """Download ``req.file_url`` and return extracted text."""

    _check_auth(authorization)

    try:
        async with httpx.AsyncClient(timeout=_DOWNLOAD_TIMEOUT_SECONDS) as client:
            resp = await client.get(req.file_url)
    except httpx.HTTPError as exc:
        logger.warning("ocr download failed file_id=%s: %s", req.file_id, exc)
        raise HTTPException(
            status_code=400,
            detail=OcrErrorBody(
                error="invalid_file",
                kind="invalid_file",
                detail=f"download failed: {exc}",
            ).model_dump(),
        ) from exc

    if resp.status_code != 200:
        logger.warning(
            "ocr download non-200 file_id=%s status=%s", req.file_id, resp.status_code
        )
        raise HTTPException(
            status_code=400,
            detail=OcrErrorBody(
                error="invalid_file",
                kind="invalid_file",
                detail=f"source responded with {resp.status_code}",
            ).model_dump(),
        )

    content = resp.content
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=OcrErrorBody(
                error="file_too_large",
                kind="invalid_file",
                detail=f"{len(content)} bytes > {_MAX_FILE_BYTES}",
            ).model_dump(),
        )

    content_type = (
        resp.headers.get("Content-Type", "application/octet-stream")
        .split(";")[0]
        .strip()
    )

    try:
        return await extract_from_bytes(content=content, mime_type=content_type)
    except OcrInvalidFileError as exc:
        logger.info("ocr invalid file file_id=%s: %s", req.file_id, exc)
        raise HTTPException(
            status_code=400,
            detail=OcrErrorBody(
                error="invalid_file",
                kind="invalid_file",
                detail=str(exc),
            ).model_dump(),
        ) from exc
    except OcrFailedError as exc:
        logger.warning("ocr engine failed file_id=%s: %s", req.file_id, exc)
        raise HTTPException(
            status_code=422,
            detail=OcrErrorBody(
                error="ocr_failed",
                kind="ocr_failed",
                detail=str(exc),
            ).model_dump(),
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — catch-all for truly unexpected
        logger.exception("ocr internal error file_id=%s", req.file_id)
        raise HTTPException(
            status_code=500,
            detail=OcrErrorBody(
                error="internal",
                kind="ocr_failed",
                detail=str(exc),
            ).model_dump(),
        ) from exc
