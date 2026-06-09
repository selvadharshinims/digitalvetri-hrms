# syntax=docker/dockerfile:1.7
#
# Multi-stage Docker build for the DV-WMS NestJS API.
#
# Stage 1 (builder): install all workspace deps, generate the Prisma client,
# and compile TypeScript.
# Stage 2 (runtime): copy the fully-built monorepo so the workspace symlinks
# and the generated Prisma client survive; run as a non-root user.
#
# Build context is the repo root, not apps/api.
#
#   docker build -f apps/api/Dockerfile -t dv-wms-api .

ARG NODE_VERSION=20-alpine

# ────────────────────────────── builder ─────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

RUN corepack enable

WORKDIR /repo

# Copy workspace manifests first so the deps layer caches well.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/

RUN pnpm install --frozen-lockfile

# Copy sources.
COPY packages/types packages/types
COPY apps/api apps/api

# Generate the Prisma client from the schema and build the NestJS bundle.
RUN pnpm --filter @dv-wms/api prisma:generate
RUN pnpm --filter @dv-wms/api build

# ────────────────────────────── runtime ─────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime

RUN apk add --no-cache openssl tini && corepack enable

# Drop root for the actual process.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /repo

# Copying the whole built monorepo preserves the pnpm workspace symlinks
# and the generated `node_modules/.prisma/client`. Image size cost is OK for
# v1 — optimize with `pnpm deploy` later if needed.
COPY --from=builder --chown=app:app /repo /repo

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

USER app

WORKDIR /repo/apps/api

# tini reaps zombie children and forwards signals cleanly so Nest shuts down
# on SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
# Apply any new migrations on boot, then start the API. `migrate deploy` is
# safe in production: it only forward-applies pending migrations and never
# drops data the way `db push --accept-data-loss` can.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
