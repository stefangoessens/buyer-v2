from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "buyer-v2-extraction"
    assert data["version"] == "0.0.1"
    assert "release" in data
    assert "environment" in data
    assert data["observability"]["structuredLogging"] is True
    assert "x-request-id" in response.headers
    assert data["health"]["requestCount"] >= 1
