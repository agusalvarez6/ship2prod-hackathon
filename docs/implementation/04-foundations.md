---
status: in_progress
branch: feat/foundations
started: 2026-04-24
---

# 04 — Foundations

## Mandate
do the Foundations so that we can start developing in parallel

## Tracks
_Populated by engineering-manager-01 as SWEs complete their work._

## Wave 0 (in flight)

Four tracks, disjoint file ownership, dispatched 2026-04-24 T+0.

| Track | Owner | Files | Status |
|-------|-------|-------|--------|
| W0-A repo scaffolding | swe-01 | package.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.json, eslint config, prettier config, .nvmrc, .gitignore, .editorconfig, README.md skeleton, vitest.config.ts stub | pending |
| W0-B packages/schema | swe-02 | packages/schema/** — ids, briefing, source, jobs, redis, insforge row types + Zod schemas | pending, blocked by W0-A |
| W0-C packages/errors | swe-03 | packages/errors/** — AppError discriminated union + Result<T,E> + ok/err + withRetry + isTransient (per .claude/skills/errors/SKILL.md) | pending, blocked by W0-A |
| W0-D SQL + seeds | swe-04 | infra/seed/migrations/001_init.sql + seed SQL + briefings.seed.json fixture (UUID 11111111-2222-3333-4444-555555555555) | pending, blocked by W0-A |

**Decisions bound into prompts:**
- Error taxonomy: `.claude/skills/errors/SKILL.md` is authoritative; the master §4 TransientError/PermanentError/UserInputError shape is superseded.
- Simplification banners in specs 01/02/03 win over body-text residue. Master §4 is canonical.

**Planned waves:**
- Wave 1 (blocked by Wave 0): `packages/integrations`, subgraph skeleton + operations + Cosmo router config, vapi-webhook skeleton, worker skeleton, Next.js scaffold.
- Wave 2 (blocked by Wave 1): Chainguard base Dockerfile + healthcheck, docker-compose.yml with test profile, .env.example, CI workflow, SKILL.md/README.md submission stubs.

## Wave 0 — completed

| Track | Owner | Commit | Notes |
|-------|-------|--------|-------|
| W0-A repo scaffolding | swe-01 | `9fc1285` then `babf11c` (follow-up) | pnpm workspace, tsconfig, eslint, prettier (singleQuote/no-semi/printWidth-100), no-console rule |
| W0-B `@ship2prod/schema` | swe-02 | `d816067` | branded ids + briefing/source/jobs/redis/insforge types + Zod schemas; 53 tests |
| W0-C `@ship2prod/errors` | swe-03 | `7f47c1b` (+ follow-up extending upstream.service for notion/gcal/openai) | single-shape AppError union + Result<T,E> + withRetry + isTransient per architect v2 §6.2 |
| W0-D test harness | swe-04 | `c4581b9` | vitest config + globalSetup + MSW + docker-compose.test.yml; 87/88 tests (1 docker-gated) |
| W0-E SQL + seeds + Docker + compose | swe-05 | _pending_ | infra/seed/* + docker/* + docker-compose.yml |

**Decisions captured during Wave 0**:
- Error taxonomy: `.claude/skills/errors/SKILL.md` is authoritative (single-shape AppError union + Result). Architect v2 §6.2 is the binding reference. Master §4 TransientError/PermanentError/UserInputError classes are NOT shipped.
- `AppError.upstream.service` literal: `vapi | tinyfish | insforge | wundergraph | notion | gcal | openai` (NOT `redis` — Redis errors are `internal` per the skill).
- Package scope: `@ship2prod/*`. Architect v2 will be revised from `@precall/*`.
- `research_jobs` Postgres table dropped per simplification banner; `research_jobs:pending` and `:processing` Redis LISTs kept (master §4 Redis inventory is canonical).
- Subgraph runs as Hono wrapping graphql-yoga (not bare yoga) per architect v2 + spec 03 §6.

## Quality gates
_Populated as inspectors run._

## PR
- #1 — https://github.com/agusalvarez6/ship2prod-hackathon/pull/1 (draft, opened 2026-04-24)
