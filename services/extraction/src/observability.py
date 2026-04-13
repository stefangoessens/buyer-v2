from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

try:
    import sentry_sdk
except ImportError:  # pragma: no cover - optional runtime integration
    sentry_sdk = None

REDACTED = "[REDACTED]"
_PII_PATTERNS = ("authorization", "cookie", "token", "secret", "email", "phone")

logger = logging.getLogger("buyer_v2.extraction")
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def _first_value(*values: str | None) -> str | None:
    for value in values:
        if value is None:
            continue
        trimmed = value.strip()
        if trimmed:
            return trimmed
    return None


def _redact_dict(payload: dict[str, Any]) -> dict[str, Any]:
    scrubbed: dict[str, Any] = {}
    for key, value in payload.items():
        key_lower = key.lower()
        if any(pattern in key_lower for pattern in _PII_PATTERNS):
            scrubbed[key] = REDACTED
        elif isinstance(value, dict):
            scrubbed[key] = _redact_dict(value)
        else:
            scrubbed[key] = value
    return scrubbed


@dataclass(slots=True, frozen=True)
class ObservabilityContext:
    service: str
    environment: str
    deployment: str
    release: str
    version: str


def resolve_context(default_service: str, version: str) -> ObservabilityContext:
    environment = (
        _first_value(
            os.getenv("SENTRY_ENVIRONMENT"),
            os.getenv("RAILWAY_ENVIRONMENT_NAME"),
            os.getenv("RAILWAY_ENVIRONMENT"),
            os.getenv("NODE_ENV"),
        )
        or "development"
    )
    deployment = (
        _first_value(
            os.getenv("RAILWAY_ENVIRONMENT_NAME"),
            os.getenv("RAILWAY_ENVIRONMENT"),
            os.getenv("NODE_ENV"),
        )
        or environment
    )
    release = (
        _first_value(
            os.getenv("SENTRY_RELEASE"),
            os.getenv("RAILWAY_GIT_COMMIT_SHA"),
            os.getenv("SOURCE_VERSION"),
        )
        or version
    )
    service = (
        _first_value(
            os.getenv("OBSERVABILITY_SERVICE_NAME"),
            os.getenv("RAILWAY_SERVICE_NAME"),
        )
        or default_service
    )

    return ObservabilityContext(
        service=service,
        environment=environment,
        deployment=deployment,
        release=release,
        version=version,
    )


@dataclass(slots=True)
class HealthState:
    started_monotonic: float = field(default_factory=time.monotonic)
    started_at: str = field(
        default_factory=lambda: datetime.now(UTC).isoformat().replace("+00:00", "Z")
    )
    request_count: int = 0
    failure_count: int = 0
    last_failure: dict[str, Any] | None = None

    def record_request(self) -> None:
        self.request_count += 1

    def record_failure(self, *, route: str, method: str, request_id: str, error: Exception) -> None:
        self.failure_count += 1
        self.last_failure = {
          "route": route,
          "method": method,
          "requestId": request_id,
          "errorType": type(error).__name__,
          "message": str(error),
          "recordedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }

    def snapshot(self) -> dict[str, Any]:
        return {
            "startedAt": self.started_at,
            "uptimeMs": round((time.monotonic() - self.started_monotonic) * 1000),
            "requestCount": self.request_count,
            "failureCount": self.failure_count,
            "lastFailure": self.last_failure,
        }


def init_sentry(context: ObservabilityContext) -> bool:
    dsn = os.getenv("SENTRY_DSN")
    if not dsn or sentry_sdk is None:
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=context.environment,
        release=context.release,
        send_default_pii=False,
    )
    sentry_sdk.set_tag("service", context.service)
    sentry_sdk.set_tag("deployment", context.deployment)
    sentry_sdk.set_context(
        "app",
        {
            "service": context.service,
            "environment": context.environment,
            "deployment": context.deployment,
            "release": context.release,
            "version": context.version,
        },
    )
    return True


def capture_exception(error: Exception, *, metadata: dict[str, Any]) -> None:
    if sentry_sdk is None:
        return

    with sentry_sdk.push_scope() as scope:
        for key, value in _redact_dict(metadata).items():
            scope.set_extra(key, value)
        sentry_sdk.capture_exception(error)


def log_event(event: str, payload: dict[str, Any]) -> None:
    logger.info("%s %s", event, _redact_dict(payload))
