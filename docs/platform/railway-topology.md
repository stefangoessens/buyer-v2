# Railway Deploy Topology

This document is the source of truth for KIN-976. It defines how buyer-v2 is
laid out in Railway so the web app and Python extraction worker can move
independently without environment drift.

## Services

| Service | Railway name | Root dir | Config | Health check | Restart policy |
| --- | --- | --- | --- | --- | --- |
| Web | `buyer-v2-web` | repo root (`.`) | [`railway.json`](../../railway.json) | `/api/health` | `ON_FAILURE`, max 3 retries |
| Extraction worker | `buyer-v2-extraction` | `services/extraction` | [`services/extraction/railway.json`](../../services/extraction/railway.json) | `/health` | `ON_FAILURE`, max 3 retries |

Independent deploys come from the service roots above:

- Web deploys only the Next.js app build graph.
- Extraction deploys only the FastAPI service under `services/extraction`.
- Shared code changes can be promoted to one or both services, but Railway
  release history and rollback remain service-scoped.

## Environment Model

| Stage | Promotion source | Host/domain strategy | Notes |
| --- | --- | --- | --- |
| `local` | n/a | `localhost` only | Bootstrapped from `.env.example` and `services/extraction/.env.example`. |
| `preview` | `local` | Railway-generated preview domains | Created per PR. No custom DNS. Safe place for branch validation. |
| `staging` | `preview` | Railway-generated staging domains by default | Shared release-candidate environment. Custom staging DNS can be added later without changing service contracts. |
| `production` | `staging` | Custom buyer-v2 domains | Customer-facing only after staging validation. |

Promotion rule: `local -> preview -> staging -> production`. `APP_ENV` is the
runtime discriminator for every deployable service. `NEXT_PUBLIC_APP_ENV` is
the public mirror used by the Next.js client.

## Environment Variables

### Shared runtime contract

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | Distinguishes `local`, `preview`, `staging`, `production`. |
| `LOG_LEVEL` | Normalized service log verbosity. |
| `SERVICE_VERSION` | Release identifier surfaced in health responses and release audits. |

### Web service

Public vars live in [`.env.example`](../../.env.example):

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`

Server vars live in the same file and are injected only into the Railway web
service:

- `APP_ENV`
- `LOG_LEVEL`
- `SERVICE_VERSION`
- `CONVEX_DEPLOY_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_DSN`
- `POSTHOG_PERSONAL_API_KEY`
- `NODE_ENV`

### Extraction worker

Worker vars live in [`services/extraction/.env.example`](../../services/extraction/.env.example):

- `APP_ENV`
- `LOG_LEVEL`
- `SERVICE_VERSION`
- `PORT`
- `CORS_ORIGINS`

## Lower-Environment Provisioning

The checked-in `railway.json` files are the provisioning contract. To create the
lower environments in Railway:

1. Create two Railway services in the `buyer-v2` project.
2. Point `buyer-v2-web` at repo root `.`.
3. Point `buyer-v2-extraction` at `services/extraction`.
4. Enable preview environments for both services.
5. For staging, create a shared Railway environment and set `APP_ENV=staging`
   plus the matching public URL vars on the web service.
6. Keep preview/staging on Railway-generated domains. Reserve custom DNS for
   production until the marketing/app host split is final.

## Health Checks And Restarts

- Web health: `GET /api/health` returns `status`, `service`, `environment`,
  `timestamp`, and `version`.
- Extraction health: `GET /health` returns `status`, `service`,
  `environment`, and `version`.
- Both services use `ON_FAILURE` with `maxRetries=3`.
- A failing health check should trigger service-only rollback, not a whole
  project redeploy.

## Rollback Posture

- Roll back the affected Railway service to the previous healthy release.
- If a release changed environment variables, restore the previous variable set
  before or alongside the rollback.
- Convex deploys are not implicitly coupled to either Railway service; backend
  promotion remains a separate decision.
