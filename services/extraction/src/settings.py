from __future__ import annotations

import os
from dataclasses import dataclass


def _parse_origins(raw: str) -> tuple[str, ...]:
    origins = tuple(part.strip() for part in raw.split(",") if part.strip())
    return origins or ("http://localhost:3000",)


@dataclass(frozen=True)
class Settings:
    app_env: str
    cors_origins: tuple[str, ...]
    log_level: str
    port: int
    service_name: str
    service_version: str


def get_settings() -> Settings:
    return Settings(
        app_env=os.getenv("APP_ENV", "local"),
        cors_origins=_parse_origins(
            os.getenv("CORS_ORIGINS", "http://localhost:3000")
        ),
        log_level=os.getenv("LOG_LEVEL", "debug"),
        port=int(os.getenv("PORT", "8000")),
        service_name="extraction",
        service_version=os.getenv("SERVICE_VERSION", "0.0.0"),
    )
