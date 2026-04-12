# Test fixtures

Shared test data for the `python-workers` package.

## Layout

```
fixtures/
  html/                     # Real portal HTML samples (one file per test case)
  vendor_responses/         # Helpers that build fake Bright Data API responses
    bright_data.py          # respx/httpx response factories
```

## `html/`

Populated by KIN-777 (Zillow parser), KIN-779 (Redfin parser), KIN-780 (Realtor
parser). Each file is a snapshot of a real detail page captured via Bright
Data Web Unlocker and scrubbed of PII. File names follow the pattern
`<portal>_<slug>.html`, e.g. `zillow_12345_main_st.html`.

Parser tests load these directly from disk; do NOT inline HTML in test files.

Currently only `.gitkeep` lives here — the directory will be filled in by the
portal-parser cards.

## `vendor_responses/bright_data.py`

Factory helpers for mocking Bright Data Web Unlocker API responses in tests
that use `respx`. They return `httpx.Response` objects pre-shaped with the
headers (`x-brd-cost-usd`, `x-brd-request-id`) and status codes the unlocker
client expects. Tests compose them with `respx.post(...).mock(return_value=...)`.

## Rules

- Never commit fixtures containing live auth tokens or customer PII.
- Never hit real Bright Data or portal endpoints from tests — all outbound
  HTTP must go through `respx`.
- Keep fixture files small and focused; prefer one file per scenario.
