# @ship2prod/schema

Shared domain types and Zod schemas for PreCall.

Authoritative source: `docs/specs/00-master.md`. Every type and constant here mirrors the master spec's §4 "Shared packages" and §4 "Redis namespace inventory", after the Simplification pass (2026-04-24). This package is pure: no I/O, no HTTP, no Redis or InsForge clients.

## Exports

| Module | What |
|---|---|
| `ids` | Branded id types (`UserId`, `MeetingId`, `BriefingId`, `JobId`, `SourceId`, `TranscriptId`, `NotionPageId`) + Zod schemas + `new()` factories for client-minted ids |
| `briefing` | `Briefing`, `BriefingSections`, `BriefingListItem`, `BriefingStatus`, `BriefingSectionKey` |
| `source` | `Source`, `SourceKind` (9 kinds), `SourceStatus` (6 statuses), `CitedSource` |
| `jobs` | `ResearchJobPayload`, `ProgressEvent`, `ProgressStep`, `ProgressSnapshot` |
| `redis` | `REDIS_KEYS` (key builders), `REDIS_TTL` (seconds), `REDIS_STREAM` (field names + MAXLEN) |
| `insforge` | Row types for the 5 InsForge tables: `users`, `meetings`, `briefings`, `sources`, `call_transcripts` |

## Conventions

- Every Zod schema has a companion `type X = z.infer<typeof XSchema>`.
- Branded ids are strings at runtime; the brand is compile-time only.
- Row types use `snake_case` to mirror the Postgres DDL in `infra/seed/migrations/001_init.sql`. DTOs use `camelCase` and the mapping happens in the resolver.
- Timestamps are ISO-8601 strings in DTOs and DB rows; unix-ms numbers inside Redis stream events.

## Scripts

```bash
pnpm -F @ship2prod/schema typecheck
pnpm -F @ship2prod/schema test
```
