# buyer-v2 python workers

Python services that support property ingestion for buyer-v2: portal fetch
orchestration, deterministic extractors, Browser Use fallback, and disclosure
OCR. Python 3.13, async-first.

## Layout

```
python-workers/
  common/          # shared types, errors, portal detection
  fetch/           # Bright Data unlocker client + orchestrator + metrics
  ocr/             # FastAPI OCR service for disclosure packets (KIN-1078)
  tests/           # pytest suite (owned by test-builder)
```

## OCR worker service

Standalone FastAPI service that extracts text from PDF / JPEG / PNG files.
Used by the Convex disclosure parser engine (KIN-1078) to turn buyer-uploaded
disclosure packets into searchable text before passing them to the AI
red-flag analyzer.

### System deps

The OCR worker shells out to two native binaries that must be present on the
host — neither is installed by `pip install`:

- `tesseract` — the OCR engine used for scanned PDFs and images
  (`brew install tesseract` on macOS, `apt-get install tesseract-ocr` on
  Debian/Ubuntu).
- `poppler-utils` — used by `pdf2image` to rasterise PDF pages
  (`brew install poppler` on macOS, `apt-get install poppler-utils` on
  Debian/Ubuntu).

Missing binaries do not crash the service at boot — the error surfaces as a
`422 ocr_failed` response on the first request that needs them.

### Env

| Variable             | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `OCR_SERVICE_TOKEN`  | Shared secret matched against incoming `Authorization: Bearer ...`. If unset, the service refuses to serve. |

### Run locally

```bash
cd python-workers
source .venv/bin/activate           # or create one per "Setup" below
OCR_SERVICE_TOKEN=local-dev-token \
    uvicorn ocr.app:app --host 0.0.0.0 --port 8080 --reload
```

### API

| Endpoint           | Auth             | Notes                               |
| ------------------ | ---------------- | ----------------------------------- |
| `GET /healthz`     | none             | Liveness probe — returns `{"status": "ok"}`. |
| `POST /ocr/extract`| `Bearer <token>` | Downloads the file at `file_url`, extracts text, returns per-page results. Rejects files over 20 MB with 413. |

See `ocr/types.py` for the exact request/response pydantic models.

## Setup

```bash
cd python-workers
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

## Dev commands

```bash
pytest          # run the suite
ruff check .    # lint
mypy .          # typecheck
```

## Environment variables

| Variable                                    | Default                 | Purpose                                          |
| -------------------------------------------- | ----------------------- | ------------------------------------------------ |
| `BRIGHT_DATA_UNLOCKER_TOKEN`                | _empty_                 | Bearer token for the Bright Data Unlocker API.   |
| `BRIGHT_DATA_ZONE`                          | `buyer_v2_unlocker`     | Unlocker zone name.                              |
| `BRIGHT_DATA_MAX_CONCURRENT`                | `4`                     | Orchestrator concurrency semaphore size.         |
| `BRIGHT_DATA_MAX_REQUESTS_PER_MIN`          | `60`                    | Client-side token-bucket rate limit.             |
| `BRIGHT_DATA_MONTHLY_BUDGET_USD`            | `500`                   | Hard cap before requests are refused.            |
| `BRIGHT_DATA_FALLBACK_COST_PER_REQUEST_USD` | `0.0015`                | Used when Bright Data omits `x-brd-cost-usd`.    |

Copy `.env.example` to `.env` and fill in the token for local development.
The token is never logged, stringified, or repr'd — reviewers should treat
any leak as a P0 bug.

## Notes on fixtures vs live traffic

Unit and integration tests should use the `FakeUnlocker` exposed from
`fetch.unlocker` and recorded fixture HTML stored under `tests/fixtures/`.
Real HTTP calls to Bright Data are reserved for opt-in smoke scripts, not
the default `pytest` run, so CI cost stays at $0.
