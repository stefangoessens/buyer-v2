# extraction worker service

Deployable FastAPI worker surface for buyer-v2 extraction tasks.

## Local commands

```bash
cd services/extraction
python3 -m pip install -e '.[dev]'
python3 -m uvicorn src.main:app --reload
python3 -m pytest
```

## Boundary

- Keep service wiring and HTTP concerns in this workspace.
- Reusable worker primitives stay in `python-workers/`.
- Do not import web-only or Swift code into this service.
