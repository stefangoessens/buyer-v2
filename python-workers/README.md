# buyer-v2 python workers

Python services that support property ingestion for buyer-v2: portal fetch
orchestration, deterministic extractors, and Browser Use fallback. Python 3.13,
async-first.

## Layout

```
python-workers/
  common/          # shared types, errors, portal detection
  fetch/           # Bright Data unlocker client + orchestrator + metrics
  tests/           # pytest suite (owned by test-builder)
```

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
