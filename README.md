# DV-WMS — DigitalVetri Workforce Management System

Monorepo for the DigitalVetri internal workforce management system. See `DV-WMS-PRD.md` (in the parent folder) for the full product spec.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19, Tailwind, ShadCN-style components |
| Backend | NestJS 10 (TypeScript), REST API behind `/api/v1` |
| Database | PostgreSQL 16 via Prisma 6 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh) with role-based guards and per-row scope filters |
| AI | Anthropic SDK (Claude Opus 4.7) — adaptive thinking + prompt caching |
| Notifications | In-app + email (nodemailer) + WhatsApp (Meta Cloud API, opt-in) |
| Shared types | `packages/types` |

## Modules shipped (PRD §7 + §18)

- Auth + RBAC, user management, team management
- Lead management (incl. import/export, AI scoring, lead activities)
- Project + task management (incl. AI risk assessment)
- Attendance, daily reports (incl. AI digest), tickets
- Performance scoring engine + leaderboard + AI narrative analysis
- Reports & analytics, CSV export
- Notifications (in-app + email + opt-in WhatsApp)
- AI features: performance narrative, lead scoring, project risk, daily-report digest, team productivity insights, conversational query
- Nightly AI jobs: lead rescore (03:00), project risk reassessment (03:30), daily-report digest email to leaders (workdays 08:30)

## Layout

```
dev-fusion/
├── apps/
│   ├── api/        # NestJS backend
│   └── web/        # Next.js frontend
├── packages/
│   └── types/      # Shared TypeScript contracts
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20.11+
- pnpm 9+
- Docker Desktop (for local Postgres + Redis, or for full containerized deploy)

## Local development

```bash
# 1. Install workspace deps
pnpm install

# 2. Copy env files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Start Postgres + Redis (no app containers)
pnpm db:up

# 4. Sync the Prisma schema to the DB (no migration history is committed yet,
#    so this uses `db push` instead of `migrate deploy`).
pnpm --filter @dv-wms/api exec prisma db push

# 5. Run both apps in dev
pnpm dev
```

API runs on `http://localhost:3001/api/v1`, web on `http://localhost:3000`.
Swagger lives at `http://localhost:3001/api/v1/docs` in non-production.

## Containerized deploy

The compose file ships an `app` profile that adds the API and web containers alongside the infra services.

```bash
# 1. Fill out the root .env (JWT_*_SECRET are required; everything else
#    has a sensible default).
cp .env.example .env
# … edit JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to long random strings

# 2. Build and start the whole stack
pnpm docker:build
pnpm docker:up

# 3. Tail logs
pnpm docker:logs

# To stop: pnpm docker:down
```

Endpoints once the stack is up:

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Health | http://localhost:3001/api/v1/health |

The API entrypoint runs `prisma db push --skip-generate --accept-data-loss` before starting, so the schema is synced on every boot. Once a migration history is committed, swap this for `prisma migrate deploy` in `apps/api/Dockerfile`.

### Optional integrations

| Integration | Env vars | Behavior when unset |
|---|---|---|
| SMTP (email) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email sends are logged instead of dispatched. |
| Anthropic (AI features) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | AI endpoints return 503; scheduled AI jobs skip silently. |
| WhatsApp (Meta Cloud) | `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_ACCESS_TOKEN`, `WHATSAPP_META_GRAPH_VERSION` | WhatsApp sends are logged instead of dispatched. |

`NEXT_PUBLIC_API_BASE_URL` is baked into the web image at **build** time — if you change it, rebuild the web container with `docker compose --profile app build web` so the new value lands in the client bundle.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run API and web in parallel |
| `pnpm dev:api` | Run only the NestJS API |
| `pnpm dev:web` | Run only the Next.js web app |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm db:up` / `db:down` | Start/stop local Postgres + Redis |
| `pnpm db:migrate` | `prisma migrate dev` (only useful once migrations are committed) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm --filter @dv-wms/api exec prisma db push` | Sync schema without migration history |
| `pnpm docker:build` | Build the API + web container images |
| `pnpm docker:up` / `docker:down` | Start/stop the full containerized stack (infra + api + web) |
| `pnpm docker:logs` | Tail API + web container logs |

## Roles

Three system roles per the PRD: `super_admin`, `team_leader`, `intern`. RBAC is enforced both at the route-guard layer and inside per-row scope filters (`userScopeWhere`, `leadScopeWhere`, etc. in `apps/api/src/common/utils/scope.ts`).

## AI features

All AI features run on Claude Opus 4.7 via the Anthropic SDK with adaptive thinking and prompt caching. Each system prompt is sized to clear the Opus 4.7 cache minimum so the cached prefix is reused across the working day.

| Endpoint | Trigger | Output |
|---|---|---|
| `GET /performance/:userId/ai-analysis` | Pull (staff) | Markdown narrative |
| `POST /daily-reports/digest` | Pull (staff) | Markdown digest |
| `POST /leads/score` | Pull (staff) + nightly cron | Per-lead score, band, signal, action — persisted on the lead |
| `POST /projects/assess-risk` | Pull (staff) + nightly cron | Per-project risk, concern, suggested actions — persisted on the project |
| `GET /dashboard/team-insights` | Pull (admin) | Markdown insights |
| `POST /ai/query` | Pull (staff, `/ask` UI) | Tool-use chat over the platform's data |

## Status

PRD §7 (functional modules), §10 (scoring engine), §11 (schema), §12 (API surface) and §18 (AI features) are all in place. The roadmap items still open are the deploy hardening polish (committed migrations, CI, production secrets management) and post-launch tuning.
