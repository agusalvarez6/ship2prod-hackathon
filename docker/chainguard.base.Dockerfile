# Shared Chainguard distroless base for PreCall services that touch
# untrusted input or untrusted external content: apps/vapi-webhook and
# apps/worker. Builder stage is latest-dev (has shell + pnpm + node).
# Runtime stage is latest (distroless, nonroot UID 65532, no shell, no
# package manager). See docs/specs/00-master.md §4 Invariants.
#
# Per-service Dockerfiles extend this one with a final COPY of their own
# dist/ and a CMD. Expect them to pass the build arg APP_PATH pointing at
# the workspace package under the repo, e.g. apps/vapi-webhook.

# Stage 1: build with the dev-flavored Chainguard Node image.
FROM cgr.dev/chainguard/node:latest-dev AS builder

ARG APP_PATH

USER root
WORKDIR /repo

# pnpm is available inside latest-dev through corepack. Enable and pin via
# packageManager in root package.json.
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile

RUN pnpm --filter "./${APP_PATH}" build

# Collect a minimal prod node_modules tree for the target workspace package.
RUN pnpm --filter "./${APP_PATH}" --prod deploy /out

# Stage 2: runtime on the distroless Chainguard Node image.
FROM cgr.dev/chainguard/node:latest AS runtime

ARG APP_PATH

WORKDIR /app

COPY --from=builder --chown=65532:65532 /out ./
COPY --chown=65532:65532 docker/healthcheck.js ./healthcheck.js

USER 65532

ENV NODE_ENV=production

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

# Per-service Dockerfiles override CMD with their own entry point.
CMD ["node", "dist/index.js"]
