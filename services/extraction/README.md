# extraction worker service

Deployable FastAPI worker surface for buyer-v2 extraction tasks.

## Local commands

```bash
cp .env.example .env
cd services/extraction
python -m uvicorn src.main:app --reload
python -m pytest
```

## Boundary

- Keep service wiring and HTTP concerns in this workspace.
- Reusable worker primitives stay in `python-workers/`.
- Do not import web-only or Swift code into this service.

## Railway

- Railway service root: `services/extraction`
- Service config: `services/extraction/railway.json`
- Health check: `/health`
- Lower environments use Railway-generated domains; production can add custom DNS later.
