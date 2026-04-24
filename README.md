# PreCallBot

Voice-first meeting-prep agent. Built for Ship to Prod 2026-04-24.

Full concept in [IDEA.md](./IDEA.md). Project rules in [CLAUDE.md](./CLAUDE.md). Sponsor roles in [SPONSORS.md](./SPONSORS.md). Judging criteria in [CRITERIA.md](./CRITERIA.md).

## Critical path

Three flows power the product.

1. Briefing generation. Contact in, structured briefing out. TinyFish research, InsForge storage.
2. Voice Q&A. Vapi call answers questions grounded in the briefing.
3. Meeting prep. The user sees the briefing before the meeting.

## Stack

Vapi, TinyFish, Redis, InsForge, WunderGraph Cosmo Router, Chainguard distroless images. Full architecture in [docs/specs/00-master.md](./docs/specs/00-master.md).

## Prerequisites

- Node 20 LTS. See `.nvmrc`.
- pnpm 9 or newer. Install once with `npm install -g pnpm`.
- Docker Desktop for the local test stack (Postgres, PostgREST, Redis).

## Install and verify

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
```

## Workspace layout

- `apps/`: runtime services (`web`, `graph`, `graph/router`, `vapi-webhook`, `worker`).
- `packages/`: shared libraries (`schema`, `errors`, `integrations`, `sdk`).
- `infra/`: SQL migrations and seed fixtures.
- `docker/`: shared Chainguard base image and healthcheck.
- `docs/specs/`: authoritative specs. Start with `00-master.md`.

## Contributing

Feature branches only. See [.claude/skills/good-vcs/SKILL.md](./.claude/skills/good-vcs/SKILL.md) for branch naming, commit format, and PR conventions.
