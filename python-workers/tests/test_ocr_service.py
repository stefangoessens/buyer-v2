"""HTTP-level tests for the OCR worker FastAPI app.

Uses ``respx`` (already a dev dep) to mock the outbound signed-URL fetch,
and FastAPI's ``TestClient`` to exercise the endpoint without a running
uvicorn process.
"""

from __future__ import annotations

import pytest

# Skip the whole module if FastAPI (and therefore Starlette's TestClient) is
# not importable in the current environment — the code is still shipped, the
# tests just don't run here.
fastapi = pytest.importorskip("fastapi")
testclient_module = pytest.importorskip("fastapi.testclient")
respx = pytest.importorskip("respx")

from fastapi.testclient import TestClient  # noqa: E402

from ocr.app import app  # noqa: E402

# Tiny valid text-native PDF — duplicated from test_document_ocr so the two
# test modules don't cross-import. If you update one, update both.
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

_FAKE_URL = "https://example.convex.cloud/storage/fake.pdf"
_AUTH_TOKEN = "test-token"
_VALID_HEADERS = {"Authorization": f"Bearer {_AUTH_TOKEN}"}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Build a TestClient with the shared-secret env var set."""

    monkeypatch.setenv("OCR_SERVICE_TOKEN", _AUTH_TOKEN)
    return TestClient(app)


def _make_request_body() -> dict[str, str]:
    return {
        "file_url": _FAKE_URL,
        "file_id": "doc_abc123",
        "storage_key": "disclosure/doc_abc123",
    }


def test_healthz_returns_ok(client: TestClient) -> None:
    """The liveness probe always returns 200 with a stable body."""

    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ocr_extract_missing_authorization(client: TestClient) -> None:
    """Requests without any ``Authorization`` header must 401."""

    response = client.post("/ocr/extract", json=_make_request_body())
    assert response.status_code == 401
    body = response.json()
    # FastAPI nests HTTPException detail under "detail"
    detail = body["detail"]
    assert detail["kind"] == "unauthorized"
    assert detail["error"] == "unauthorized"


def test_ocr_extract_wrong_bearer_token(client: TestClient) -> None:
    """Requests with the wrong bearer token must 401."""

    response = client.post(
        "/ocr/extract",
        json=_make_request_body(),
        headers={"Authorization": "Bearer not-the-real-token"},
    )
    assert response.status_code == 401
    assert response.json()["detail"]["kind"] == "unauthorized"


@respx.mock
def test_ocr_extract_success_returns_text(client: TestClient) -> None:
    """A valid signed URL serving a real PDF yields a parsed OcrResponse."""

    pytest.importorskip("pdfplumber")

    respx.get(_FAKE_URL).respond(
        status_code=200,
        content=_SMOKE_PDF_BYTES,
        headers={"Content-Type": "application/pdf"},
    )

    response = client.post(
        "/ocr/extract",
        json=_make_request_body(),
        headers=_VALID_HEADERS,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "buyer-v2 ocr smoke test" in body["text"]
    assert len(body["per_page"]) == 1
    assert body["per_page"][0]["page_number"] == 1
    assert 0.0 <= body["confidence"] <= 1.0
    assert isinstance(body["detected_lang"], str)


@respx.mock
def test_ocr_extract_404_from_source_returns_400(client: TestClient) -> None:
    """If the signed URL 404s, the endpoint reports an invalid file."""

    respx.get(_FAKE_URL).respond(status_code=404)

    response = client.post(
        "/ocr/extract",
        json=_make_request_body(),
        headers=_VALID_HEADERS,
    )
    assert response.status_code == 400
    assert response.json()["detail"]["kind"] == "invalid_file"


@respx.mock
def test_ocr_extract_oversized_file_returns_413(client: TestClient) -> None:
    """Files larger than 20 MB must be rejected with 413 + invalid_file."""

    too_big = b"x" * (20 * 1024 * 1024 + 1)
    respx.get(_FAKE_URL).respond(
        status_code=200,
        content=too_big,
        headers={"Content-Type": "application/pdf"},
    )

    response = client.post(
        "/ocr/extract",
        json=_make_request_body(),
        headers=_VALID_HEADERS,
    )
    assert response.status_code == 413
    assert response.json()["detail"]["kind"] == "invalid_file"


def test_ocr_extract_service_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If ``OCR_SERVICE_TOKEN`` is unset the service refuses to serve."""

    monkeypatch.delenv("OCR_SERVICE_TOKEN", raising=False)
    unconfigured = TestClient(app)

    response = unconfigured.post(
        "/ocr/extract",
        json=_make_request_body(),
        headers=_VALID_HEADERS,
    )
    assert response.status_code == 500
    assert response.json()["detail"]["kind"] == "ocr_failed"
