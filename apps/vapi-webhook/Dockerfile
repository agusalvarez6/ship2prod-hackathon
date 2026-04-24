# syntax=docker/dockerfile:1.7
# Builds apps/vapi-webhook on the shared Chainguard distroless base.
# Equivalent to docker/chainguard.base.Dockerfile with APP_PATH pinned
# and PORT / CMD wired for the webhook handler on :8787.

FROM cgr.dev/chainguard/node:latest-dev AS builder

USER root
WORKDIR /repo

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/vapi-webhook build
RUN pnpm --filter ./apps/vapi-webhook --prod deploy /out

FROM cgr.dev/chainguard/node:latest AS runtime

WORKDIR /app

COPY --from=builder --chown=65532:65532 /out ./
COPY --chown=65532:65532 apps/vapi-webhook/healthcheck.js ./healthcheck.js

USER 65532

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

CMD ["node", "dist/index.js"]
