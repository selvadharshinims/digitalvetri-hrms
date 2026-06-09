# syntax=docker/dockerfile:1.7
#
# Multi-stage Docker build for the DV-WMS Next.js web app.
#
# Uses Next.js `output: 'standalone'` so the runtime image only carries the
# minimal server bundle + static assets, not the full pnpm workspace.
#
# Build context is the repo root.
#
#   docker build -f apps/web/Dockerfile -t dv-wms-web .
#
# Build-time env (must be passed at `docker build` time, NOT at runtime,
# because Next bakes NEXT_PUBLIC_* into the client bundle):
#   --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1

ARG NODE_VERSION=20-alpine

# ────────────────────────────── builder ─────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

RUN corepack enable

WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/

RUN pnpm install --frozen-lockfile

COPY packages/types packages/types
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
ARG NEXT_PUBLIC_APP_NAME=DV-WMS
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
# Triggers `output: 'standalone'` in next.config.mjs.
ENV BUILD_STANDALONE=1

RUN pnpm --filter @dv-wms/web build

# ────────────────────────────── runtime ─────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime

RUN apk add --no-cache tini

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Standalone output: a self-contained server bundle.
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
# Static assets aren't included in the standalone bundle — copy them in.
COPY --from=builder --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /repo/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

USER app

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
