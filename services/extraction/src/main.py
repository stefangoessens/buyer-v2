import uuid
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .observability import (
    HealthState,
    capture_exception,
    init_sentry,
    log_event,
    resolve_context,
)

app = FastAPI(title="buyer-v2 extraction worker", version="0.0.1")

import os

context = resolve_context(default_service="buyer-v2-extraction", version=app.version)
health_state = HealthState()
sentry_enabled = init_sentry(context)
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def observe_requests(request: Request, call_next):
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex)
    request.state.request_id = request_id
    health_state.record_request()
    start = perf_counter()

    try:
        response = await call_next(request)
    except Exception as error:
        health_state.record_failure(
            route=request.url.path,
            method=request.method,
            request_id=request_id,
            error=error,
        )
        metadata = {
            "requestId": request_id,
            "route": request.url.path,
            "method": request.method,
            "service": context.service,
            "environment": context.environment,
            "release": context.release,
        }
        capture_exception(error, metadata=metadata)
        log_event("worker_request_failed", metadata | {"errorType": type(error).__name__})

        response = JSONResponse(
            status_code=500,
            content={"status": "error", "requestId": request_id},
        )

    latency_ms = round((perf_counter() - start) * 1000)
    response.headers["x-request-id"] = request_id
    log_event(
        "worker_request_completed",
        {
            "requestId": request_id,
            "route": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "latencyMs": latency_ms,
            "service": context.service,
            "environment": context.environment,
            "release": context.release,
        },
    )
    return response


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": context.service,
        "version": context.version,
        "release": context.release,
        "environment": context.environment,
        "deployment": context.deployment,
        "observability": {
            "sentryConfigured": sentry_enabled,
            "structuredLogging": True,
        },
        "checks": {
            "service": {
                "status": "ok",
                "detail": "FastAPI process is serving requests",
            }
        },
        "health": health_state.snapshot(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
