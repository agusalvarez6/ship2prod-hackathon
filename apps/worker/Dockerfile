# syntax=docker/dockerfile:1.7
# Builds apps/worker on the shared Chainguard distroless base. Worker has
# no HTTP surface in Phase 0; healthcheck is a no-op.

FROM cgr.dev/chainguard/node:latest-dev AS builder

USER root
WORKDIR /repo

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/worker build
RUN pnpm --filter ./apps/worker --prod deploy /out

FROM cgr.dev/chainguard/node:latest AS runtime

WORKDIR /app

COPY --from=builder --chown=65532:65532 /out ./
COPY --chown=65532:65532 apps/worker/healthcheck.js ./healthcheck.js

USER 65532

ENV NODE_ENV=production

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

CMD ["node", "dist/index.js"]
