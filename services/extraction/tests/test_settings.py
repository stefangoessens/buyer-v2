from src.settings import get_settings


def test_settings_reads_environment_contract(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("CORS_ORIGINS", "https://preview.buyer-v2.app,https://staging.buyer-v2.app")
    monkeypatch.setenv("LOG_LEVEL", "info")
    monkeypatch.setenv("PORT", "8100")
    monkeypatch.setenv("SERVICE_VERSION", "2026.04.12")

    settings = get_settings()

    assert settings.app_env == "staging"
    assert settings.cors_origins == (
        "https://preview.buyer-v2.app",
        "https://staging.buyer-v2.app",
    )
    assert settings.log_level == "info"
    assert settings.port == 8100
    assert settings.service_version == "2026.04.12"
