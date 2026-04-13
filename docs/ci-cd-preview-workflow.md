# CI/CD, Quality Gates, and Preview Workflow

This repo uses GitHub Actions for deterministic quality gates and Railway for
environment deployment.

## What the workflows enforce

- Pull requests to `main` run only the affected surface checks.
- `Quality gates` is the single aggregate status for required CI checks.
- `Preview ready` is the single aggregate status for preview verification.
- Failing web checks block web promotion.
- Failing worker checks block worker promotion.
- `staging` pushes verify the lower environment before a production release.
- `main` pushes verify production health after Railway finishes deploying.

## Surface mapping

- Web surface: Next.js app at repo root, health endpoint `/api/health`
- Worker surface: FastAPI extraction service at `services/extraction`, health endpoint `/health`
- Convex and shared package changes are treated as web-affecting for promotion because the web surface consumes those contracts directly.

## Required GitHub repository variables

Set these in GitHub Actions repository variables before relying on the deploy
verification workflows:

- `PREVIEW_WEB_URL_TEMPLATE`
- `PREVIEW_EXTRACTION_URL_TEMPLATE`
- `STAGING_WEB_URL`
- `STAGING_EXTRACTION_URL`
- `PRODUCTION_WEB_URL`
- `PRODUCTION_EXTRACTION_URL`

`PRODUCTION_URL` is still accepted as a fallback for the web surface.

### Preview URL templates

Preview URLs are resolved from repository variables with placeholder expansion.
Supported placeholders:

- `{PR_NUMBER}`
- `{PR_HEAD_REF}` — sanitized branch name
- `{REF_NAME}` — sanitized Git ref name
- `{SHA}`
- `{SHORT_SHA}`

Example templates:

```text
PREVIEW_WEB_URL_TEMPLATE=https://buyer-v2-pr-{PR_NUMBER}.up.railway.app
PREVIEW_EXTRACTION_URL_TEMPLATE=https://buyer-v2-extraction-pr-{PR_NUMBER}.up.railway.app
```

## Railway service contract

- The web Railway service points at the repo root and uses [railway.json](../railway.json).
- The extraction Railway service points at `services/extraction` and uses [services/extraction/railway.json](../services/extraction/railway.json).
- Railway GitHub integration is responsible for creating PR previews and deploying `staging` / `main`.
- GitHub Actions is responsible for waiting for those deploys and failing the workflow if the health endpoints do not recover.

## Branch protection

Require these PR checks on `main`:

- `Quality gates`
- `Preview ready`

Do not allow direct pushes to `main`.

## Merge and release flow

1. Open a PR against `main`.
2. Wait for `Quality gates` and `Preview ready` to pass.
3. Review the Railway preview environments for the web and worker surfaces touched by the PR.
4. Merge once the PR checks are green.
5. If a persistent lower environment is needed before production, promote the exact release candidate commit to `staging` and wait for `Staging deploy summary` to pass.
6. Promote the same commit to `main`.
7. Wait for `Production deploy summary` to pass.
8. If the change includes Convex schema or backend runtime changes, run `pnpm --dir convex deploy` as part of the release checklist after the app deploy succeeds.

## Notes

- Docs-only changes skip unaffected surface jobs and still pass the aggregate checks.
- CI workflow changes force all surface gates to run on the next PR so the pipeline itself is validated.
- Missing repository variables fail the relevant deployment verification job intentionally; promotion should stop until the environment contract is configured.
