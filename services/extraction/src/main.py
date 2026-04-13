from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .contracts import (
    ErrorResponse,
    ExtractListingRequest,
    ExtractListingResponse,
    FetchObservabilityResponse,
    SeedCompsRequest,
    SeedCompsResponse,
)
from .observability import (
    HealthState,
    capture_exception,
    init_sentry,
    log_event,
    resolve_context,
)
from .runtime import (
    ExtractionRuntime,
    ExtractionRuntimeError,
    close_runtime,
    get_runtime,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_runtime()


app = FastAPI(
    title="buyer-v2 extraction worker",
    version="0.0.1",
    lifespan=lifespan,
)

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
    except ExtractionRuntimeError:
        raise
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


@app.exception_handler(ExtractionRuntimeError)
async def handle_runtime_error(_: object, exc: ExtractionRuntimeError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.error.model_dump(exclude_none=True),
    )


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


@app.get("/metrics/fetch", response_model=FetchObservabilityResponse)
async def fetch_metrics(
    runtime: ExtractionRuntime = Depends(get_runtime),
) -> FetchObservabilityResponse:
    return runtime.fetch_observability()


@app.post(
    "/extract",
    response_model=ExtractListingResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
        504: {"model": ErrorResponse},
    },
)
async def extract_listing(
    request: ExtractListingRequest,
    runtime: ExtractionRuntime = Depends(get_runtime),
) -> ExtractListingResponse:
    return await runtime.extract(request)


@app.post(
    "/seed-comps",
    response_model=SeedCompsResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
        504: {"model": ErrorResponse},
    },
)
async def seed_comps(
    request: SeedCompsRequest,
    runtime: ExtractionRuntime = Depends(get_runtime),
) -> SeedCompsResponse:
    """Scrape Zillow sold-listings search for a zip + bed filter.

    Returns up to `limit` comparable sold listings for the requested
    zip code. Used by the engine orchestrator Phase 0 to populate the
    Convex comp pool before pricing/comps/leverage engines run.
    """
    return await runtime.seed_comps(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
