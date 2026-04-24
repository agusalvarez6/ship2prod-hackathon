# apps/graph Dockerfile. Mirrors docker/chainguard.base.Dockerfile
# pattern: latest-dev builder compiles the workspace, latest distroless
# runtime executes node on dist/. Expose 4001.

FROM cgr.dev/chainguard/node:latest-dev AS builder

USER root
WORKDIR /repo

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @ship2prod/graph build

RUN pnpm --filter @ship2prod/graph --prod deploy /out

# Schema SDL is read at runtime; copy it into the deployed dist so the
# runtime path resolves next to the compiled index.js.
RUN cp apps/graph/src/schema.graphql /out/dist/schema.graphql

FROM cgr.dev/chainguard/node:latest AS runtime

WORKDIR /app

COPY --from=builder --chown=65532:65532 /out ./
COPY --chown=65532:65532 docker/healthcheck.js ./healthcheck.js

USER 65532

ENV NODE_ENV=production
ENV PORT=4001
ENV HEALTHCHECK_PORT=4001

EXPOSE 4001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

CMD ["node", "dist/index.js"]
