# Specs — PreCall (s2p-hackathon)

Canonical Specs for the PreCall build. Cross-reference [`../../CLAUDE.md`](../../CLAUDE.md) for project rules and [`../../IDEA.md`](../../IDEA.md) for the concept. Hackathon judging criteria at [`../../CRITERIA.md`](../../CRITERIA.md). Sponsor integration surface at [`../../SPONSORS.md`](../../SPONSORS.md).

## Index

| # | Spec | Owner | Scope |
|---|------|-------|-------|
| 00 | [Master](./00-master.md) | Dev A | Cross-cutting architecture, shared data model, Phase 0 contracts, parallelization plan, demo + submission choreography. Supersedes `api/SKILL.md` §6. |
| 01 | [Briefing generation](./01-briefing-generation.md) | Dev B | Async pipeline: "Brief me" → Redis job → TinyFish extraction → LLM synthesis → InsForge persist. Source-backed briefing in about a minute. |
| 02 | [Voice Q&A](./02-voice-qa.md) | Dev C | Vapi assistant config, HMAC webhook, function-calling bridge to the briefing, Redis session memory, transcript persistence. Builds against fixture row from hour zero — does not block on Dev B. |
| 03 | [Meeting prep](./03-meeting-prep.md) | Dev D | Frontend: upcoming meetings list, "Brief me" trigger, Notion page picker, progress UI, briefing viewer, "Call briefing agent" launcher. Google Calendar + Notion adapters. |

## Conventions

- **Domain vocabulary**: briefing, research job, source, contact, company. Enforced by `spec-inspector-naming`.
- **Branded IDs**: `BriefingId`, `SourceId`, `MeetingId`, `UserId`, `JobId`, `TranscriptId`, `NotionPageId` — declared in `packages/schema/src/ids.ts`. (Contact / company are denormalized onto `briefings` — no separate `ContactId` / `CompanyId`.)
- **Critical path**: briefing generation, voice Q&A, meeting prep. Anything outside this is out of scope unless `IDEA.md` or `SPONSORS.md` scopes it in.
- **Phase 0 foundations** are owned by Dev A and listed concretely in master §8.2. Devs B/C/D start the moment Phase 0 lands.

## Status

All 4 specs passed the three-inspector convergence loop (formatting, naming, parsimony) with zero Critical/Major findings. Completion Review (Mandate → Spec) APPROVED with zero findings across 70 requirements.

## Simplification pass (2026-04-24)

A post-convergence simplification pass applied 12 cuts that preserve every sponsor's load-bearing role while halving the data model and removing dead-code paths. Summary:

- **Tables removed** (3): `research_jobs`, `contacts`, `companies`. State denormalized onto `briefings`.
- **Redis keys removed** (2): `research_jobs:dlq`, `cache:gcal:{userId}`.
- **Columns removed** (3): `sources.tinyfish_tool`, `sources.tinyfish_run_id`, `research_jobs.progress` (folded into Redis Streams only).
- **Operations collapsed**: `fetchBriefingSection` + `askBriefingQuestion` → `answerFromBriefing(mode)`. `warmBriefingCache` removed (cache populates on `getBriefing`).
- **Packages consolidated**: `packages/{llm,tinyfish,notion,gcal}` → `packages/integrations/`.
- **Infra**: single `docker-compose.yml` with `profiles: ["test"]`; SQL files auto-applied via Postgres `docker-entrypoint-initdb.d/` (no `seeder` service).

Authoritative state lives in [00-master.md](./00-master.md). Subspecs carry a "Simplification pass" banner listing the swaps at the top of each file.
