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

## Browser Use Cloud client

Browser Use Cloud is the canonical path for agent-driven browser automation going forward (county records searches, portal flows that Bright Data unlocker can't solve deterministically, etc.). We use the hosted product instead of self-hosted Browser Use on Railway because:

- **Residential proxies + IP rotation** are bundled — no separate proxy plan to manage.
- **Less ops overhead** than running a headless browser fleet on Railway (no Chromium crashes to babysit, no memory tuning).
- **Per-run billing** matches our current traffic profile better than a dedicated always-on worker.

### Where the wrapper lives

The thin Python client wrapper lives at `python-workers/lib/browser_use_client.py`. It exposes a small surface (`BrowserUseClient`, `is_configured()`, `create_run()`, `get_result()`) so callers can check configuration before instantiating and avoid import-time failures when the API key is absent.

### Required env vars

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `BROWSER_USE_API_KEY` | yes | — | Provisioned in the Browser Use Cloud dashboard; stored in Railway + `.env.local`, never committed. |
| `BROWSER_USE_BASE_URL` | no | `https://api.browser-use.com` | Override for staging / regional endpoints. |

### Usage pattern

```python
from lib.browser_use_client import BrowserUseClient, is_configured

if not is_configured():
    # Fall back to the deterministic parser path or surface a clear error to the caller —
    # do not raise at import time, since other extraction flows should keep working.
    ...

client = BrowserUseClient()
run = client.create_run(task="Search for 1234 Main St on bcpa.net")
result = client.get_result(run.run_id)
```

### Follow-up work (NOT in scope for KIN-1076)

KIN-1076 only ships the wrapper + docs. The following are tracked as separate follow-ups:

1. Provision the production `BROWSER_USE_API_KEY` and push it to Railway.
2. Run a soak period with Browser Use Cloud side-by-side against the existing self-hosted Railway Browser Use service.
3. Decommission the self-hosted Railway Browser Use service once the soak proves parity.
