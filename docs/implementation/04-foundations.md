---
status: in_progress
branch: feat/foundations
started: 2026-04-24
---

# 04 — Foundations

## Mandate
do the Foundations so that we can start developing in parallel

## Tracks

### Wave 0 — completed

Dispatched 2026-04-24 T+0. Disjoint file ownership across five tracks.

| Track | Owner | Commit(s) | Notes |
|-------|-------|-----------|-------|
| W0-A repo scaffolding | swe-01 | `9fc1285`, `babf11c` | pnpm workspace, tsconfig, eslint, prettier (singleQuote / no-semi / printWidth-100), no-console rule |
| W0-B `@ship2prod/schema` | swe-02 | `d816067` | branded ids + briefing/source/jobs/redis/insforge types + Zod schemas; 53 tests |
| W0-C `@ship2prod/errors` | swe-03 | `7f47c1b`, `d8efe42` | single-shape AppError union + Result<T,E> + withRetry + isTransient per architect v2 §6.2 + .claude/skills/errors/SKILL.md; follow-up extends upstream.service for notion/gcal/openai; 15 tests |
| W0-D test harness | swe-04 | `c4581b9` | vitest + globalSetup + MSW + docker-compose.test.yml; 87/88 tests (1 docker-gated) |
| W0-E SQL + seeds + Docker + compose | swe-05 | `b7239c1` | infra/seed/* (InsForge schema + fixture briefing UUID 11111111-2222-3333-4444-555555555555), docker/* (Chainguard base), docker-compose.yml |

**Wave 0 sealed 2026-04-24 by engineering-manager-01.** All five tracks landed; Wave 1 dispatch cleared.

### Wave 1

Dispatched 2026-04-24 in two micro-waves: 1.0 (F+G) landed first, 1.1 (H/I/J/K) in flight.

#### Wave 1.0 — completed

| Track | Owner | Commit | Notes |
|-------|-------|--------|-------|
| W1-F `@ship2prod/integrations` | swe-02-w1 | `2200071` | 4 client interfaces (LLM / TinyFish / Notion / GCal) + not-implemented factories; 12 tests |
| W1-G `@ship2prod/sdk` | swe-03-w1 | `1697d24` | PrecallClient with 9 methods; MSW happy-path test |

#### Wave 1.1 — in flight

- W1-H `apps/graph` subgraph + Cosmo router (swe-04-w1)
- W1-I `apps/vapi-webhook` skeleton (swe-05-w1)
- W1-J `apps/worker` skeleton (swe-06)
- W1-K `apps/web` Next.js scaffold (swe-07)

### Wave 2 — pending

Chainguard base Dockerfile + healthcheck, docker-compose.yml test profile, .env.example, CI workflow, SKILL.md/README.md submission stubs.

## Decisions

Captured during Wave 0:

- Error taxonomy: `.claude/skills/errors/SKILL.md` is authoritative (single-shape AppError union + Result). Architect v2 §6.2 is the binding reference. Master §4 TransientError/PermanentError/UserInputError classes are NOT shipped.
- `AppError.upstream.service` literal: `vapi | tinyfish | insforge | wundergraph | notion | gcal | openai` (NOT `redis` — Redis errors are `internal` per the skill).
- Package scope: `@ship2prod/*`. Architect v2 will be revised from `@precall/*`.
- `research_jobs` Postgres table dropped per simplification banner; `research_jobs:pending` and `:processing` Redis LISTs kept (master §4 Redis inventory is canonical).
- Subgraph runs as Hono wrapping graphql-yoga (not bare yoga) per architect v2 + spec 03 §6.
- Simplification banners in specs 01/02/03 supersede body-text residue. Master §4 is canonical.

## Quality gates
_Populated as inspectors run._

## PR
- #1 — https://github.com/agusalvarez6/ship2prod-hackathon/pull/1 (draft, opened 2026-04-24)
