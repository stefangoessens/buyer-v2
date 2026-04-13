# extraction worker service

Deployable FastAPI worker surface for buyer-v2 extraction tasks.

## Local commands

```bash
cd services/extraction
python3 -m uvicorn src.main:app --reload
python3 -m pytest
```

## Observability baseline

- `GET /health` returns service, environment, release, deployment, and in-memory request/failure counters.
- Every response carries an `x-request-id` header so Railway logs can be correlated back to a request.
- Unhandled request errors emit structured log payloads with route, method, request id, environment, and release metadata.
- If `SENTRY_DSN` is configured and `sentry_sdk` is present in the runtime, unhandled request errors are also forwarded to Sentry with the same context.

## Boundary

- Keep service wiring and HTTP concerns in this workspace.
- Reusable worker primitives stay in `python-workers/`.
- Do not import web-only or Swift code into this service.

## Endpoints

- `GET /health` — liveness probe for Railway.
- `GET /metrics/fetch` — Bright Data fetch-layer limits, usage, cost, latency, and per-portal counters.
- `POST /extract` — fetch a supported portal listing through the Bright Data unlocker/orchestrator, then hand the fetched HTML to the deterministic parser for that portal.
