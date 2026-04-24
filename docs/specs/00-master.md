**Created At**: 2026-04-24
**Author**: spec-principal-writer-01
**Approved By**: [leave blank]

> **Preamble**. Master spec; subspecs own per-stream detail.
>
> **Cross-references**: [../../IDEA.md](../../IDEA.md) (concept) · [../../CLAUDE.md](../../CLAUDE.md) (project rules) · [../../CRITERIA.md](../../CRITERIA.md) (judging criteria) · [../../SPONSORS.md](../../SPONSORS.md) (sponsor roles).
>
> **Subspecs**: [01-briefing-generation.md](./01-briefing-generation.md) (Dev B) · [02-voice-qa.md](./02-voice-qa.md) (Dev C) · [03-meeting-prep.md](./03-meeting-prep.md) (Dev D).
>
> **Supersedes `api/SKILL.md` §6**: that section references the archived WunderGraph OSS BFF factory (`createOperation.query/mutation/subscription`); the repository `github.com/wundergraph/wundergraph` returns HTTP 404. This spec replaces it with WunderGraph Cosmo Router + single `graphql-yoga` subgraph. See §3.

### Naming conventions used in this spec

- **Branded IDs**: TypeScript layer uses PascalCase types (`BriefingId`, `UserId`, …) declared in `packages/schema/src/ids.ts`.
- **Row identifiers**: inside row types the PK is `id` (`briefings.id`). Across row boundaries / in DTOs the field becomes `{tableSingular}Id` (`briefingId`, `sourceId`).
- **Case conventions**: TypeScript DTO fields are camelCase. Postgres columns are snake_case. Mapping happens in the resolver. Wire-format string unions (Vapi event types, GraphQL enums) use the shape the external system declares.
- **Timestamps**: unix-ms numbers inside Redis stream events; ISO-8601 strings in Postgres / GraphQL DTOs (`startsAt`, `createdAt`).
- **Abbreviations**: `gcal` = Google Calendar (package-scope shorthand only; prose uses "Google Calendar"). Diagram aliases are listed below §3.

### Acronym glossary

**BFF** backend-for-frontend · **BLMOVE** Redis blocking list move · **CDP** Chrome DevTools Protocol · **DDL** Data Definition Language (SQL) · **DLQ** dead-letter queue · **FK** foreign key · **GFM** GitHub-Flavored Markdown · **HMAC** Hash-based Message Authentication Code · **JWKS** JSON Web Key Set · **JWT** JSON Web Token · **MCP** Model Context Protocol · **RESP** Redis Serialization Protocol · **SBOM** Software Bill of Materials · **SDK** Software Development Kit · **SSE** Server-Sent Events · **STT** Speech-to-Text · **TTS** Text-to-Speech.

---

## 1. Problem

**Casual**: Before every external meeting, a founder, AE, or operator burns 15–30 minutes stitching together calendar context, Notion notes, and public web research. They still walk in under-prepared. PreCall is a voice-first assistant that produces a tactical briefing in under a minute and answers follow-up questions by voice.

**Formal**:

1. No unified surface lifts upcoming meeting context from Google Calendar, private Notion notes, and public web research into one tactical briefing.
2. No voice agent reads a personalised briefing aloud and answers follow-up questions grounded in that briefing's sources.
3. No hardened worker isolates untrusted public web content from user session credentials during research.
4. No schema captures a briefing, its sources, its research job, and its voice-call transcripts with enough fidelity for a demo and a post-demo audit trail.
5. No deployable topology ships the above inside the hackathon window (11:00–16:30 PT, 2026-04-24; submission freeze 16:30).

**Out of Scope** (per `[../../IDEA.md](../../IDEA.md)` and `[../../CLAUDE.md](../../CLAUDE.md)` scope ban list):

- **Notion/Calendar writes**: read-only integrations only.
- **Team / multi-user collaboration**: one user per session. No org features.
- **CRM, email sync, admin dashboards, analytics, payments**: explicitly banned.
- **Background meeting sync**: briefings generated on demand per meeting.
- **Deep Notion workspace indexing**: user picks up to 3 pages manually.
- **Auth beyond Google OAuth**: InsForge ships auth; we wire only Google.
- **LinkedIn as load-bearing source**: TinyFish cannot solve LinkedIn CAPTCHA reliably. Demo targets use company sites.
- **Redis Vector semantic memory**: post-MVP toggle, documented in §9.
- **User-editable briefings**: a briefing is a one-shot artifact; edits require a new briefing.

## 2. Solution

The main parts:

1. **Frontend** — Next.js dashboard showing upcoming meetings, briefing viewer, and "Call briefing agent" launcher. Consumes Cosmo Router exclusively.
2. **Cosmo Router** — WunderGraph Cosmo federation router in Docker on port `:3002`, with built-in MCP Gateway on `:5025` that exposes named GraphQL operations as AI tool-calls for Vapi.
3. **Subgraph (`apps/graph`)** — one `graphql-yoga` subgraph on `:4001` whose resolvers orchestrate InsForge, Redis, Notion, Google Calendar.
4. **Vapi Webhook Handler (`apps/vapi-webhook`)** — Chainguard distroless Node service verifying Vapi HMAC webhooks, deduping via Redis, proxying tool-call payloads into the subgraph.
5. **Research Worker (`apps/worker`)** — Chainguard distroless Node service that BLMOVEs jobs off `research_jobs:pending`, runs Notion read + TinyFish extractions + LLM synthesis, emits Redis Streams progress, writes final briefing + sources to InsForge.
6. **Redis** — job queue, idempotency cache, Redis Streams progress bus, voice-session memory, extraction caches.
7. **InsForge** — self-hosted Postgres 15 + PostgREST + JWT auth; stores users, companies, contacts, meetings, research_jobs, briefings, sources, call_transcripts.
8. **Chainguard distroless images** — reused by worker and webhook handler (the two services that touch untrusted input or untrusted external content).

## 3. Architecture

Container diagram (aliases in legend under diagram):

```mermaid
flowchart LR
    U[User] -->|HTTPS| FE[Frontend Next.js]
    FE -->|GraphQL HTTPS| CR[Cosmo Router :3002 MCP :5025]
    FE -.->|WebRTC| VC[Vapi Cloud]

    CR -->|federation protocol| SG[Subgraph graphql-yoga :4001]
    VC -->|HMAC-SHA256 POST| VH[Vapi Webhook Handler Chainguard]
    VH -->|RESP TLS| R[(Redis 7)]
    VH -->|GraphQL| CR

    SG -->|insforge sdk| IF[(InsForge Postgres+PostgREST)]
    SG -->|RESP TLS| R
    SG -->|HTTPS| GC[Google Calendar API]
    SG -->|HTTPS| NO[Notion API]

    W[Research Worker Chainguard] -->|BLMOVE| R
    W -->|insforge sdk| IF
    W -->|HTTPS| NO
    W -->|HTTPS| TF[TinyFish Cloud]
    W -->|HTTPS| LLM[LLM Provider]
```



**Diagram alias legend** (used across this spec and all subspecs):

`FE` = Frontend · `CR` = Cosmo Router · `SG` = Subgraph · `IF` = InsForge · `R` = Redis · `W` = Research Worker · `VH` = Vapi Webhook Handler · `VC` = Vapi Cloud · `GC` = Google Calendar · `NO` = Notion · `TF` = TinyFish · `LLM` / `L` = LLM Provider

**Invariants**:

- Only **Subgraph** and **Research Worker** write to InsForge.
- Only **Subgraph** enqueues `research_jobs:pending`; only **Research Worker** dequeues it.
- **Frontend** never holds third-party secrets (TinyFish / Notion / Google / Vapi private key). All cross Subgraph, Worker, or Webhook Handler.
- **Vapi Webhook Handler** and **Research Worker** run in Chainguard distroless images (nonroot UID 65532). No shell, no package manager at runtime.
- Webhook handler returns **200 on replay** with the cached result (never 4xx) per `errors` skill. Non-2xx triggers Vapi retry; dedupe defeats retry when we respond 200.

### Stack choices


| Decision           | Chosen                                                                       | Why                                                                                           |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GraphQL layer      | Cosmo Router + single `graphql-yoga` subgraph[^1]                            | One team, one subgraph; Cosmo MCP Gateway gives Vapi tool-calls for free.                     |
| Data source wiring | Subgraph resolvers call InsForge / Redis / Notion / GCal / TinyFish directly | Cosmo expects GraphQL subgraphs; we don't federate REST or Redis.                             |
| Backend platform   | InsForge self-hosted (`docker-compose.prod.yml`)                             | Postgres + PostgREST + JWT auth in one stack.                                                 |
| Auth               | InsForge JWT (HS256), Google OAuth only                                      | Google OAuth reused for Calendar read scope.                                                  |
| Queue              | Redis Lists + BLMOVE + DLQ                                                   | Reliable at-least-once delivery; standard Node pattern.                                       |
| Idempotency        | `SET NX EX` keys (`idem:`*)                                                  | Matches CLAUDE.md convention. 5-min replay window.                                            |
| Progress bus       | Redis Streams (`XADD … MAXLEN ~ 100`, `XREAD BLOCK id=0`)                    | Late subscribers replay from `0`.                                                             |
| Voice memory       | Redis list `call:session:{callId}` + `LTRIM -20 -1` + 15-min TTL             | Aligns with `call_transcripts` table family.                                                  |
| Container base     | `cgr.dev/chainguard/node` (builder `:latest-dev`, runtime `:latest`)         | Distroless, nonroot UID 65532, zero CVE at push.                                              |
| Deploy target      | Railway (each service gets public HTTPS)                                     | Vapi needs a public URL; Railway free/hobby is fastest. Fallback: local + cloudflared tunnel. |
| Cosmo router image | Pin `ghcr.io/wundergraph/cosmo/router` to a digest                           | `:latest` is not reproducible.                                                                |


[^1]: Pattern documented at `[cosmo-docs.wundergraph.com/tutorial/from-zero-to-federation-in-5-steps-using-cosmo](https://cosmo-docs.wundergraph.com/tutorial/from-zero-to-federation-in-5-steps-using-cosmo)` with optional MCP gateway from `[cosmo-docs.wundergraph.com/router/mcp/quickstart](https://cosmo-docs.wundergraph.com/router/mcp/quickstart)`.

## 4. Components

File paths are absolute within the repo root. Every component below ships in a Phase 0 skeleton (§8) so Devs B/C/D can import from day one.

+++ #### Frontend (`apps/web`)

`apps/web/src/` — Next.js 14 App Router, pages:

- `/` — dashboard (upcoming meetings list, "Brief me" button, recent briefings).
- `/briefings/:id` — briefing viewer (11-section layout) + "Call briefing agent" button.

Consumes the generated GraphQL client only. No direct calls to InsForge, Redis, or any external API.

```typescript
interface UpcomingMeeting {
  id: MeetingId;
  title: string;
  startsAt: string; // ISO-8601
  attendees: Array<{ email: string; displayName?: string }>;
  inferred: { contactName?: string; companyName?: string; companyDomain?: string };
}
```

+++

+++ #### Cosmo Router (`apps/graph/router`)

`apps/graph/router/graph.yaml`, `apps/graph/router/config.yaml`, `apps/graph/router/config.json`.

Docker: `ghcr.io/wundergraph/cosmo/router` pinned to a digest. Ports:

- `:3002` — GraphQL HTTPS endpoint for Frontend and Vapi Webhook Handler.
- `:5025` — MCP Gateway exposing named operations as AI tool-calls.

Auth: JWKS-validated Bearer tokens; InsForge issues the JWT. Service-account JWT minted at startup for the Vapi Webhook Handler.

+++

+++ #### Subgraph (`apps/graph`)

`apps/graph/src/index.ts` — graphql-yoga entry, port `:4001`.

Files:

- `apps/graph/src/schema.graphql` — schema definition.
- `apps/graph/src/resolvers/meeting.ts` — `listUpcomingMeetings`, `searchNotionContext`, `getBriefing`, `listBriefings`, `getBriefingProgress`.
- `apps/graph/src/resolvers/briefing.ts` — `createBriefingFromMeeting`.
- `apps/graph/src/resolvers/voice.ts` — `answerFromBriefing`, `draftFollowUpEmail`, `saveCallTranscript`.
- `apps/graph/src/context.ts` — `{ insforge, redis, user, services }`.
- `apps/graph/operations/*.graphql` — named, persisted operations (one file per op).

```typescript
interface GraphContext {
  insforge: InsForgeClient;
  redis: RedisClientType;
  user: { id: UserId; email: string } | null;
  services: {
    notion: NotionClient;
    gcal: GCalClient; // gcal = Google Calendar package-scope abbreviation
    llm: LLMClient;
  };
}
```

Operation inventory (owners defined in §8):


| Operation                   | Kind | Input                                                                            | Output                           | Owner             |
| --------------------------- | ---- | -------------------------------------------------------------------------------- | -------------------------------- | ----------------- |
| `listUpcomingMeetings`      | Q    | `{ userId, limit? }`                                                             | `UpcomingMeeting[]`              | Dev D             |
| `searchNotionContext`       | Q    | `{ userId, query }`                                                              | `NotionPage[]`                   | Dev D             |
| `createBriefingFromMeeting` | M    | `{ userId, meetingId, notionPageIds[] }`                                         | `{ briefingId, jobId, deduped }` | Dev B             |
| `getBriefingProgress`       | Q    | `{ jobId }`                                                                      | `ProgressSnapshot`               | Dev D             |
| `getBriefing`               | Q    | `{ briefingId }`                                                                 | `Briefing` (incl. sources)       | Dev D, also Dev C |
| `listBriefings`             | Q    | `{ userId, limit? }`                                                             | `BriefingListItem[]`             | Dev D             |
| `answerFromBriefing`        | M    | `{ briefingId, mode: "question" \| "section", input: string, callId }`           | `{ text }`                       | Dev C             |
| `draftFollowUpEmail`        | M    | `{ briefingId, tone? }`                                                          | `{ emailText }`                  | Dev C             |
| `saveCallTranscript`        | M    | `{ briefingId, vapiCallId, transcript, recordingUrl?, startedAt, endedAt }`      | `{ transcriptId }`               | Dev C             |


**`answerFromBriefing`** covers both "answer a user question" (`mode: "question"`) and "fetch a specific section verbatim" (`mode: "section"`). Vapi binds two tool definitions to this one operation. Cache population happens inside `getBriefing` on first read — the viewer fetches the briefing before the Vapi call starts, so by the time tool-calls arrive, Redis is warm.

+++

+++ #### Vapi Webhook Handler (`apps/vapi-webhook`)

`apps/vapi-webhook/src/index.ts` — Hono server, port `:8787`.

Files:

- `apps/vapi-webhook/src/index.ts` — entry.
- `apps/vapi-webhook/src/middleware/hmac.ts` — HMAC-SHA256 verification, 5-min replay window.
- `apps/vapi-webhook/src/middleware/idem.ts` — Redis `SET NX EX` dedupe.
- `apps/vapi-webhook/src/routes/webhook.ts` — `POST /vapi/webhook` type-switch on `message.type`.
- `apps/vapi-webhook/src/tools.ts` — Cosmo-backed tool dispatchers.
- `apps/vapi-webhook/src/client.ts` — generated Cosmo SDK client for the subgraph.
- `apps/vapi-webhook/healthcheck.js` — Chainguard healthcheck.
- `apps/vapi-webhook/Dockerfile` — extends `docker/chainguard.base.Dockerfile`.

```typescript
interface VapiWebhookEnvelope {
  message: {
    type: "tool-calls" | "end-of-call-report" | "status-update";
    timestamp: number; // unix ms
    call: {
      id: string;
      metadata: {
        briefingId: BriefingId;
        userId: UserId;
        source: "web" | "phone";
      };
    };
    toolCallList?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
    artifact?: {
      transcript: string;
      recording?: { recordingUrl: string };
      messages: unknown[];
    };
    status?: "scheduled" | "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
    startedAt?: string;
    endedAt?: string;
  };
}
```

+++

+++ #### Research Worker (`apps/worker`)

`apps/worker/src/index.ts` — Node worker, no HTTP server. BLMOVE loop.

Files:

- `apps/worker/src/index.ts` — entry (BLMOVE loop + graceful shutdown).
- `apps/worker/src/pipeline.ts` — orchestrates Notion read, TinyFish extractions, LLM synthesis.
- `apps/worker/src/planner.ts` — meeting facts → `ResearchTask[]`.
- `apps/worker/src/tinyfish/client.ts` — TinyFish SDK wrapper.
- `apps/worker/src/tinyfish/normalizer.ts` — web results → `Source` rows with block-string validation.
- `apps/worker/src/llm/synthesize.ts` — `synthesizeBriefing` function.
- `apps/worker/src/llm/prompts/synthesize.md` — LLM system prompt.
- `apps/worker/src/persist.ts` — `persistBriefing` function, single-transaction.
- `apps/worker/src/progress.ts` — `emitProgress` function over Redis Streams.
- `apps/worker/healthcheck.js` — Chainguard healthcheck.
- `apps/worker/Dockerfile` — extends `docker/chainguard.base.Dockerfile`.

```typescript
interface ResearchJobPayload {
  jobId: JobId;
  briefingId: BriefingId;
  userId: UserId;
  meetingId: MeetingId;
  notionPageIds: NotionPageId[];
  requestedAt: number; // unix ms
}
```

Full details in [01-briefing-generation.md](./01-briefing-generation.md) §4.

+++

+++ #### Shared packages (`packages/*`)

```typescript
// packages/schema/src/ids.ts
export type UserId = string & { readonly __brand: "UserId" };
export type MeetingId = string & { readonly __brand: "MeetingId" };
export type BriefingId = string & { readonly __brand: "BriefingId" };
export type JobId = string & { readonly __brand: "JobId" };
export type SourceId = string & { readonly __brand: "SourceId" };
export type TranscriptId = string & { readonly __brand: "TranscriptId" };
export type NotionPageId = string & { readonly __brand: "NotionPageId" };
```

```typescript
// packages/schema/src/briefing.ts
export interface BriefingSections {
  summary60s: string;
  whoYouAreMeeting: { name: string; role?: string; company: string };
  companyContext: { whatTheyDo: string; recentUpdates: string[] };
  internalContext: { notionExcerpts: Array<{ pageTitle: string; excerpt: string }> };
  bestConversationAngle: string;
  suggestedOpeningLine: string;
  questionsToAsk: [string, string, string, string, string]; // exactly 5
  likelyPainPoints: string[];
  risks: string[];
  followUpEmail: string;
  citedSources: Array<{ id: SourceId; title: string; url?: string; kind: SourceKind }>;
}

export interface Briefing {
  id: BriefingId;
  userId: UserId;
  meetingId: MeetingId | null;

  // Denormalized contact + company
  contactName: string | null;
  contactEmail: string | null;
  contactRole: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companySummary: string | null;

  // State
  status: "pending" | "researching" | "drafting" | "ready" | "failed";
  summary60s: string | null;
  sections: BriefingSections | null;
  sourcesCount: number;
  errorMessage: string | null;

  // Research state (folded in from removed research_jobs table)
  researchStartedAt: string | null;   // ISO-8601
  researchFinishedAt: string | null;  // ISO-8601
  researchError: { code: string; message: string; at: string } | null;

  createdAt: string; // ISO-8601
  updatedAt: string;
}

export interface BriefingListItem {
  id: BriefingId;
  title: string; // meeting title or "Manual briefing"
  companyName: string | null;
  status: Briefing["status"];
  createdAt: string;
}
```

```typescript
// packages/schema/src/source.ts
export type SourceKind =
  | "notion_page"
  | "company_site"
  | "product_page"
  | "pricing_page"
  | "blog_post"
  | "news"
  | "linkedin"
  | "filing"
  | "other";

export interface Source {
  id: SourceId;
  briefingId: BriefingId;
  kind: SourceKind;
  url: string | null;
  finalUrl: string | null;
  externalId: string | null;
  title: string | null;
  excerpt: string | null;
  raw: unknown; // includes tinyfishTool + tinyfishRunId when relevant
  status: "ok" | "blocked" | "captcha" | "timeout" | "dead" | "skipped";
  fetchedAt: string; // ISO-8601
}
```

```typescript
// packages/schema/src/jobs.ts
export interface ResearchJobPayload {
  jobId: JobId;
  briefingId: BriefingId;
  userId: UserId;
  meetingId: MeetingId;
  notionPageIds: NotionPageId[];
  requestedAt: number; // unix ms
}

export type ProgressStep =
  | "queued"
  | "searching_notion"
  | "researching_company"
  | "reading_pages"
  | "synthesizing"
  | "ready"
  | "failed";

export interface ProgressEvent {
  step: ProgressStep;
  pct: number;
  detail?: string;
  at: number; // unix ms (stream events only)
}

export interface ProgressSnapshot {
  jobId: JobId;
  current: ProgressEvent;
  history: ProgressEvent[];
}
```

```typescript
// packages/schema/src/redis.ts
export const REDIS_KEYS = {
  jobs: {
    pending: "research_jobs:pending",
    processing: "research_jobs:processing",
  },
  progress: (briefingId: BriefingId) => `job:${briefingId}:progress`,
  claim: (briefingId: BriefingId) => `job:${briefingId}:claim`,
  callSession: (callId: string) => `call:session:${callId}`,
  idem: {
    vapi: (eventKey: string) => `idem:vapi:${eventKey}`,
    vapiResult: (eventKey: string) => `idem:vapi:${eventKey}:result`,
    createBriefing: (userId: UserId, meetingId: MeetingId) =>
      `idem:briefings:create:${userId}:${meetingId}`,
  },
  cache: {
    briefing: (briefingId: BriefingId) => `cache:briefing:${briefingId}`,
    tinyfish: (sha256: string) => `cache:tinyfish:${sha256}`,
    notionPage: (pageId: NotionPageId) => `cache:notion:page:${pageId}`,
    notionSearch: (sha256: string) => `cache:notion:search:${sha256}`,
  },
} as const;

export const REDIS_TTL = {
  progress: 3600,
  claim: 600,
  callSession: 900,
  idemVapi: 600,
  idemCreate: 3600,
  cacheBriefing: 900,
  cacheTinyfish: 86400,
  cacheNotionPage: 3600,
  cacheNotionSearch: 600,
} as const;

export const REDIS_STREAM = {
  progressMaxLen: 100,
} as const;
```

```typescript
// packages/errors/src/index.ts
export class TransientError extends Error { constructor(message: string, readonly cause?: unknown) { super(message); } }
export class PermanentError extends Error { constructor(message: string, readonly cause?: unknown) { super(message); } }
export class UserInputError extends Error { constructor(message: string, readonly cause?: unknown) { super(message); } }
export function isTransient(err: unknown): err is TransientError { return err instanceof TransientError; }
```

External-service client interfaces live in a single package `packages/integrations/` so the `packages/` tree doesn't sprawl. Internal shapes stay in `packages/schema`.

```typescript
// packages/integrations/src/llm.ts
export interface LLMClient {
  synthesizeBriefing(input: SynthesizerInput): Promise<BriefingSections>;
  answerQuestion(input: { briefing: Briefing; question: string; recentTurns: VoiceTurn[] }): Promise<{ text: string }>;
  draftFollowUpEmail(input: { briefing: Briefing; tone?: "neutral" | "warm" | "direct" }): Promise<{ text: string }>;
}
```

```typescript
// packages/integrations/src/tinyfish.ts
export interface TinyFishClient {
  fetch(input: { urls: string[]; format: "markdown" | "html" }): Promise<TinyFishFetchResult[]>;
  search(input: { query: string; location?: string; language?: string }): Promise<TinyFishSearchResult[]>;
}
```

```typescript
// packages/integrations/src/notion.ts
export interface NotionClient {
  search(input: { userId: UserId; query: string }): Promise<NotionPage[]>;
  readPage(input: { userId: UserId; pageId: NotionPageId }): Promise<NotionPageRead>;
}
```

```typescript
// packages/integrations/src/gcal.ts
export interface GCalClient {
  listUpcoming(input: { userId: UserId; limit: number }): Promise<CalendarEvent[]>;
}
```

`VoiceTurn`, `SynthesizerInput`, `NotionPage`, `NotionPageRead`, `TinyFishFetchResult`, `TinyFishSearchResult`, `CalendarEvent` interfaces live in their owning subspec (§4 of [01](./01-briefing-generation.md), [02](./02-voice-qa.md), [03](./03-meeting-prep.md)).

+++

+++ #### Data model — InsForge DDL (`infra/seed/migrations/001_init.sql`)

Five tables. Contact + company fields are denormalized onto `briefings` (no separate `contacts` / `companies` tables). Research job state (started/finished/error) folds onto `briefings` (no separate `research_jobs` table). Concurrency for briefing generation is controlled by the Redis claim token `job:{briefingId}:claim`.

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL UNIQUE,
  google_refresh_token TEXT,
  notion_token         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_event_id TEXT NOT NULL,
  title             TEXT NOT NULL,
  starts_at         TIMESTAMPTZ NOT NULL,
  attendees         JSONB NOT NULL DEFAULT '[]'::jsonb,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_meetings_user_event ON meetings(user_id, calendar_event_id);
CREATE INDEX idx_meetings_user_time ON meetings(user_id, starts_at DESC);

CREATE TABLE briefings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id            UUID REFERENCES meetings(id) ON DELETE SET NULL,

  -- Denormalized contact + company (no separate contacts / companies tables)
  contact_name          TEXT,
  contact_email         TEXT,
  contact_role          TEXT,
  company_name          TEXT,
  company_domain        TEXT,
  company_summary       TEXT,

  -- Briefing state
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','researching','drafting','ready','failed')),
  summary_60s           TEXT,
  sections              JSONB,
  sources_count         INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,

  -- Research job state (folded in; no separate research_jobs table)
  research_started_at   TIMESTAMPTZ,
  research_finished_at  TIMESTAMPTZ,
  research_error        JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_briefings_user_created ON briefings(user_id, created_at DESC);
CREATE INDEX idx_briefings_status_active ON briefings(status)
  WHERE status IN ('pending','researching','drafting');
CREATE INDEX idx_briefings_sections_gin ON briefings USING GIN (sections);

CREATE TABLE sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN
                ('notion_page','company_site','product_page','pricing_page',
                 'blog_post','news','linkedin','filing','other')),
  url         TEXT,
  final_url   TEXT,
  external_id TEXT,
  title       TEXT,
  excerpt     TEXT,
  raw         JSONB,
  status      TEXT NOT NULL DEFAULT 'ok'
                CHECK (status IN ('ok','blocked','captcha','timeout','dead','skipped')),
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_briefing ON sources(briefing_id);

CREATE TABLE call_transcripts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  briefing_id   UUID REFERENCES briefings(id) ON DELETE SET NULL,
  vapi_call_id  TEXT,
  recording_url TEXT,
  transcript    JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_call_transcripts_vapi ON call_transcripts(vapi_call_id) WHERE vapi_call_id IS NOT NULL;
CREATE INDEX idx_call_transcripts_user ON call_transcripts(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
COMMIT;
```

**Single-writer rules**:

- `briefings.sections`, `summary_60s`, `sources_count`, `research_started_at`, `research_finished_at`, `research_error`, `error_message` — written only by Research Worker. Subgraph only INSERTs the initial row with `status='pending'` and nullable fields null.
- `briefings.contact_*`, `briefings.company_*` — written by Subgraph at briefing creation (inferred from meeting attendees + email domain) and refined by Research Worker during synthesis.
- `sources.*` — written only by Research Worker.
- `call_transcripts.*` — written only by Vapi Webhook Handler (via Subgraph).

**Status columns**: `briefings.status` and `sources.status` use the same `status` name for consistency.

**Concurrency**: two active research runs for the same briefing are prevented via the Redis claim token `job:{briefingId}:claim` (SETNX + 600s TTL). No DB-level partial unique index needed once `research_jobs` is gone.

+++

+++ #### Redis namespace inventory

`packages/schema/src/redis.ts` encodes the constants above.


| Key / Stream                                 | Type                | TTL (s) | Writer                                                 | Reader                                               | Purpose                                                              |
| -------------------------------------------- | ------------------- | ------- | ------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `research_jobs:pending`                      | LIST                | none    | Subgraph (`createBriefingFromMeeting`)                 | Research Worker (`BLMOVE`)                           | Work queue. Payload: `ResearchJobPayload` JSON.                      |
| `research_jobs:processing`                   | LIST                | none    | Research Worker                                        | Research Worker, watchdog                            | In-flight. One entry per active job.                                 |
| `idem:vapi:{eventKey}`                       | STRING              | 600     | Vapi Webhook Handler (`SETNX`)                         | Vapi Webhook Handler                                 | Dedupe; `eventKey = ${callId}:${type}:${timestamp}[:${toolCallId}]`. |
| `idem:vapi:{eventKey}:result`                | STRING (JSON)       | 600     | Vapi Webhook Handler                                   | Vapi Webhook Handler                                 | Cached tool-call result for replay.                                  |
| `idem:briefings:create:{userId}:{meetingId}` | STRING              | 3600    | Subgraph                                               | Subgraph                                             | Double-click dedupe; stores existing `briefingId`.                   |
| `job:{briefingId}:claim`                     | STRING              | 600     | Research Worker (`SETNX`)                              | Research Worker                                      | Claim token preventing double-processing.                            |
| `job:{briefingId}:progress`                  | STREAM              | 3600    | Research Worker (`XADD`)                               | Subgraph (`XREAD BLOCK id=0`) → Frontend via polling | Replayable progress log. `MAXLEN ~ 100`.                             |
| `call:session:{callId}`                      | LIST (JSON entries) | 900     | Subgraph (`answerFromBriefing`), Vapi Webhook Handler  | Subgraph                                             | Last 20 turns (`LTRIM -20 -1`).                                      |
| `cache:briefing:{briefingId}`                | STRING (JSON)       | 900     | Subgraph (`getBriefing`)                               | Subgraph                                             | Populated on first read; sub-250 ms tool-call p95.                   |
| `cache:tinyfish:{sha256(url+task)}`          | STRING (JSON)       | 86400   | Research Worker                                        | Research Worker                                      | TinyFish result cache.                                               |
| `cache:notion:page:{pageId}`                 | STRING (JSON)       | 3600    | Research Worker                                        | Research Worker                                      | Notion page cache.                                                   |
| `cache:notion:search:{sha256(query)}`        | STRING (JSON)       | 600     | Subgraph                                               | Subgraph                                             | Notion search cache.                                                 |


**Single-writer rule**: every key has exactly one writer role. No cross-service writes.

+++

+++ #### Submission artifacts

**Required submission artifact per Ship to Prod official rules** ([https://ship-to-prod.devpost.com/](https://ship-to-prod.devpost.com/)): publish the project as a skill to shipables.dev. Frontmatter spec at [https://agentskills.io/specification](https://agentskills.io/specification). Bundle via `npx @senso-ai/shipables`.

- `SKILL.md` at repo root with agentskills.io frontmatter. Published via `npx @senso-ai/shipables publish` at T-60 per §8.1.
- `README.md` root file linking to the four specs in `docs/specs/` and to the architecture diagram in §3.

+++

## 5. Data Flow

Two critical-path flows. Subspecs own end-to-end detail; this section fixes cross-spec invariants.

### 5.1 Briefing Generation (owner: [01-briefing-generation.md](./01-briefing-generation.md))

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant CR as Cosmo Router
    participant SG as Subgraph
    participant IF as InsForge
    participant R as Redis
    participant W as Research Worker

    FE->>CR: createBriefingFromMeeting
    CR->>SG: resolve
    SG->>R: SETNX idem:briefings:create:{userId}:{meetingId} EX 3600
    alt Duplicate click
        SG-->>FE: { briefingId (existing), jobId, deduped: true }
    else New
        SG->>IF: INSERT briefings (status='pending', contact_*, company_* inferred, sections=null)
        SG->>R: LPUSH research_jobs:pending (ResearchJobPayload JSON)
        SG-->>FE: { briefingId, jobId, deduped: false }
    end

    W->>R: BLMOVE research_jobs:pending research_jobs:processing RIGHT LEFT 5
    W->>R: SETNX job:{briefingId}:claim {workerId} EX 600
    W->>IF: UPDATE briefings SET status='researching', research_started_at=now()
    W->>R: XADD job:{briefingId}:progress * step "searching_notion" pct 10
    par Notion read
        W->>W: read selected pages
    and TinyFish batch
        W->>W: fetch extractions
    end
    W->>R: XADD progress * step "synthesizing" pct 70
    W->>W: synthesizeBriefing()
    W->>IF: UPDATE briefings SET sections, summary_60s, sources_count, status='ready', research_finished_at=now()
    W->>IF: INSERT sources (N rows)
    W->>R: XADD progress * step "ready" pct 100
    W->>R: LREM research_jobs:processing 1 <payload>
```



**Invariants**:

- Sections + summary + sources + status + research_finished_at update is one transaction; no intermediate state where `briefings.status='ready'` but `sections` is null.
- TinyFish source failures (blocked, captcha, timeout, dead) persist with `sources.status=<value>`, do not fail the whole briefing.
- LLM synthesis failure sets `briefings.status='failed'`, `briefings.research_error=<json>`, `briefings.error_message=<text>`. Worker never partially writes `sections`.
- Concurrency control: the Redis claim token `job:{briefingId}:claim` (SETNX + 600s TTL) prevents two workers from processing the same briefing. No DB-level guard.

### 5.2 Voice Q&A (owner: [02-voice-qa.md](./02-voice-qa.md))

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant VC as Vapi Cloud
    participant VH as Vapi Webhook Handler
    participant R as Redis
    participant CR as Cosmo Router
    participant SG as Subgraph
    participant IF as InsForge

    Note over FE,R: Briefing viewer renders before the Vapi call starts.
    FE->>CR: getBriefing(briefingId)
    CR->>SG: resolve
    SG->>R: GET cache:briefing:{briefingId}
    alt Cache hit
        SG-->>FE: Briefing
    else Cache miss
        SG->>IF: SELECT briefing, sources
        SG->>R: SET cache:briefing:{briefingId} EX 900
        SG-->>FE: Briefing
    end
    FE->>VC: vapi.start(assistantId, variableValues, metadata)

    VC->>VH: POST /vapi/webhook (tool-calls)
    VH->>VH: verify x-vapi-signature, 5-min replay window
    VH->>R: SETNX idem:vapi:{eventKey} EX 600
    alt Replay
        VH->>R: GET idem:vapi:{eventKey}:result
        VH-->>VC: 200 { results: [cached] }
    else New
        VH->>CR: answerFromBriefing(mode, input)
        CR->>SG: resolve
        SG->>R: GET cache:briefing:{briefingId}
        SG->>R: RPUSH call:session:{callId} user turn
        SG->>SG: LLM answer with briefing + last 20 turns
        SG->>R: RPUSH call:session:{callId} assistant turn
        SG-->>VH: { text }
        VH->>R: SET idem:vapi:{eventKey}:result EX 600
        VH-->>VC: 200 { results: [...] }
    end

    Note over VC,IF: On call-end
    VC->>VH: POST /vapi/webhook (end-of-call-report)
    VH->>CR: saveCallTranscript
    CR->>SG: resolve
    SG->>IF: INSERT call_transcripts
```



**Invariants**:

- Webhook returns 200 on idempotent replay with the cached result; never 4xx.
- HMAC verification uses `${timestamp}.${raw_body}`, `crypto.timingSafeEqual`, 5-min replay window.
- Cache is populated on the first `getBriefing` read (the viewer always fetches before Vapi starts), so tool-calls hit Redis not InsForge. Cache miss falls back to InsForge read (adds <100 ms).

### 5.3 Meeting Prep (owner: [03-meeting-prep.md](./03-meeting-prep.md))

Read-path flows (`listUpcomingMeetings`, `searchNotionContext`, `listBriefings`, `getBriefing`) are standard Subgraph resolvers hitting InsForge + Redis caches + Google Calendar / Notion APIs. See subspec.

## 6. API Contracts

+++ #### Cosmo Router GraphQL endpoint


| Method | Path                       | Auth                         | Purpose                                              |
| ------ | -------------------------- | ---------------------------- | ---------------------------------------------------- |
| POST   | `https://{router}/graphql` | Bearer JWT (InsForge-issued) | Frontend + Webhook Handler consume named operations. |
| GET    | `https://{router}/mcp`     | Bearer (service-account JWT) | Vapi MCP Gateway for tool-calls.                     |
| GET    | `https://{router}/health`  | none                         | Liveness.                                            |


Named operations live in `apps/graph/operations/*.graphql`, pushed via `wgc operations push`. Full signatures in §4 Subgraph block.

+++

+++ #### POST /vapi/webhook


| Auth        | Request               | Response                       | Status codes                                   |
| ----------- | --------------------- | ------------------------------ | ---------------------------------------------- |
| HMAC-SHA256 | `VapiWebhookEnvelope` | `{ results?: [...] }` or empty | 200 (always on valid HMAC), 401 (HMAC failure) |


Required headers:

- `x-vapi-signature`: lowercase hex HMAC-SHA256 of `${timestamp}.${raw_body}` using `VAPI_WEBHOOK_SECRET`.
- `x-vapi-timestamp`: unix milliseconds. Rejected if `|now - ts| > 300000`.

Verification reference: [02-voice-qa.md](./02-voice-qa.md) §6.

+++

+++ #### Service healthchecks

Every Node service exposes `GET /health` returning `{ "status": "ok" }`. Chainguard `healthcheck.js` invokes this via `node:http` (no curl in distroless).

+++

+++ #### External API envelopes

Full per-external-service contract lives in subspecs:

- TinyFish (Fetch / Search): [01-briefing-generation.md](./01-briefing-generation.md) §6.
- Notion + Google Calendar: [03-meeting-prep.md](./03-meeting-prep.md) §6.
- Vapi tool definition + assistant config: [02-voice-qa.md](./02-voice-qa.md) §6.

+++

## 7. Test Plan

Integration over unit per `tests` skill. Real Redis, real Postgres, stub third-party APIs.


| Component              | Test type   | Deps (real/stub)                                            | Observable assertion                                                                                                                                                             | Speed |
| ---------------------- | ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| End-to-end smoke       | Integration | Real Postgres + PostgREST + Redis + Cosmo Router + Subgraph | `createBriefingFromMeeting` returns `{ briefingId, jobId, deduped: false }`; `research_jobs:pending` has the payload; `getBriefing` on fixture id returns 11-section `sections`. | <15s  |
| Subgraph auth          | Integration | Real Router + Subgraph; stubbed InsForge JWT issuer         | Unauthenticated request → 401; valid Bearer → 200.                                                                                                                               | <5s   |
| Redis dedupe           | Integration | Real Redis                                                  | Second `createBriefingFromMeeting` with same `(userId, meetingId)` returns the original briefingId with `deduped: true`.                                                         | <2s   |
| HMAC verification      | Unit        | None                                                        | Invalid signature → 401; valid signature + timestamp drift > 5 min → 401; replay of same `eventKey` → 200 with cached result.                                                    | <1s   |
| Stream progress replay | Integration | Real Redis                                                  | Subscriber connecting after `XADD` still reads all events from `id=0`.                                                                                                           | <2s   |
| Chainguard smoke       | Integration | Docker                                                      | `docker build -f apps/worker/Dockerfile .` succeeds; container runs as UID 65532; `HEALTHCHECK` passes.                                                                          | <60s  |
| Fixture round-trip     | Integration | Real Postgres                                               | Seeded fixture `11111111-2222-3333-4444-555555555555` readable via `getBriefing`; all 11 sections present.                                                                       | <2s   |


Smoke test entry point: `pnpm test -- --run tests/smoke.test.ts`. A single `docker-compose.yml` uses `profiles: ["test"]` to expose Postgres + PostgREST + Redis on non-dev ports (5433/5431/6380) for CI (`docker compose --profile test up -d`). Subspecs own per-slice tests.

## 8. Rollout

### 8.0 Rollout summary

- **Branch**: `feat/phase-0-foundations` (Dev A), then per-stream feature branches (`feat/briefing-generation`, `feat/voice-qa`, `feat/meeting-prep`).
- **Deploy order**: Postgres → Redis → InsForge → Subgraph → Cosmo Router → Research Worker → Vapi Webhook Handler → Frontend.
- **Feature flag**: none (hackathon).
- **Migration**: SQL files auto-applied via Postgres `docker-entrypoint-initdb.d/`; see §8.6.
- **Rollback**: per-PR revert. Railway supports one-click per-service rollback.

Hackathon coding window: **11:00–16:30 PT, 2026-04-24** (5.5 hours). Awards 19:00. Submission freeze 16:30. The last 60–90 minutes lock for Chainguard smoke → SKILL.md publish → demo recording → Devpost submission.

### 8.1 Wall-clock milestones


| Time     | Milestone                                                         | Owner       | Blocker for   |
| -------- | ----------------------------------------------------------------- | ----------- | ------------- |
| 12:00 PT | Phase 0 complete (all contracts compile + `pnpm typecheck` green) | Dev A       | B, C, D       |
| 12:30 PT | Subgraph resolvers green on fixture data                          | Dev A → B/D | Voice Q&A (C) |
| 14:00 PT | First briefing generated end-to-end (Sarah / Ramp)                | Dev B       | Presentation  |
| 14:00 PT | Voice Q&A answers first question against fixture                  | Dev C       | Presentation  |
| 14:30 PT | Meeting-picker wired; "Brief me" triggers real pipeline           | Dev D       | Presentation  |
| 15:00 PT | Vertical slice demoable locally                                   | All         | Submission    |
| 15:45 PT | Cloud deploy green (Railway) + Chainguard smoke passing           | Dev A       | Demo          |
| 16:00 PT | SKILL.md published to shipables.dev                               | Dev D tail  | Submission    |
| 16:15 PT | 3-minute demo video recorded                                      | Dev B tail  | Submission    |
| 16:30 PT | Devpost form filled + submitted                                   | Dev A tail  | END           |


### 8.2 Phase 0 artifacts (Dev A, 11:00–12:00 PT)

Every file below MUST exist and compile before Devs B/C/D branch off.


| #   | Artifact                                                                            | Path                                                                                                    | Consumer                                      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Branded ID types                                                                    | `packages/schema/src/ids.ts`                                                                            | All                                           |
| 2   | InsForge row types                                                                  | `packages/schema/src/insforge.ts`                                                                       | Subgraph, Worker, Webhook                     |
| 3   | Redis key constants + payload types                                                 | `packages/schema/src/redis.ts`                                                                          | All                                           |
| 4   | `ResearchJobPayload` + `ProgressEvent` + `ProgressStep`                             | `packages/schema/src/jobs.ts`                                                                           | Subgraph (producer), Worker (consumer)        |
| 5   | `Briefing` + `BriefingSections` + `BriefingListItem`                                | `packages/schema/src/briefing.ts`                                                                       | All                                           |
| 6   | `Source` + `SourceKind`                                                             | `packages/schema/src/source.ts`                                                                         | Worker, Subgraph, Frontend                    |
| 7   | Error taxonomy                                                                      | `packages/errors/src/index.ts`                                                                          | All                                           |
| 8   | Integration clients (LLM, TinyFish, Notion, GCal)                                   | `packages/integrations/src/{llm,tinyfish,notion,gcal}.ts`                                               | Worker, Subgraph                              |
| 9   | SQL migration                                                                       | `infra/seed/migrations/001_init.sql`                                                                    | InsForge container                            |
| 10  | SQL seed files (user + Ramp fixture briefing)                                       | `infra/seed/seed/00_users.sql` … `03_sources_fixture.sql`                                               | All                                           |
| 11  | Fixture JSON mirror                                                                 | `infra/seed/briefings.seed.json`                                                                        | Frontend Storybook, Worker tests, Vapi prompt |
| 12  | Subgraph schema + resolver stubs                                                    | `apps/graph/src/schema.graphql` + `apps/graph/src/resolvers/{meeting,briefing,voice}.ts`                | Devs B, C, D                                  |
| 13  | Named GraphQL operations                                                            | `apps/graph/operations/*.graphql` (9 files)                                                             | Frontend, Webhook Handler                     |
| 14  | Cosmo Router config                                                                 | `apps/graph/router/graph.yaml`, `config.yaml`, `config.json`                                            | Router                                        |
| 15  | Vapi webhook skeleton                                                               | `apps/vapi-webhook/src/{index.ts, middleware/hmac.ts, middleware/idem.ts, routes/webhook.ts, tools.ts}` | Dev C                                         |
| 16  | Research worker skeleton                                                            | `apps/worker/src/{index.ts, pipeline.ts}` stub                                                          | Dev B                                         |
| 17  | Frontend scaffold                                                                   | `apps/web/` Next.js scaffold                                                                            | Dev D                                         |
| 18  | Chainguard base Dockerfile                                                          | `docker/chainguard.base.Dockerfile`                                                                     | Worker, Webhook                               |
| 19  | Shared healthcheck                                                                  | `docker/healthcheck.js`                                                                                 | All services                                  |
| 20  | Docker-compose (dev + test profiles)                                                | `docker-compose.yml` with `profiles: ["test"]` on test-only services                                    | Devs local + CI                               |
| 21  | Root `.env.example` + CI pipeline                                                   | `.env.example`, `.github/workflows/ci.yml`                                                              | All, CI                                       |
| 22  | Submission stubs                                                                    | `SKILL.md`, `README.md`                                                                                 | Submission                                    |


Every contract above must pass `pnpm typecheck` before branches diverge.

### 8.3 Parallel workstreams

Dev A pushes `feat/phase-0-foundations` that Devs B/C/D rebase on. Then:

**Dev A — Foundations + Deploy + Submission** (`feat/phase-0-foundations` → `feat/deploy-railway` → `feat/submission`)

1. Phase 0 artifacts above (11:00–12:00).
2. CI + docker-compose + Railway project (12:00–15:00, interleaved).
3. Cloud deploy green + Chainguard smoke (15:00–15:45).
4. Devpost form + submission (16:00–16:30).

**Dev B — Briefing Generation** (`feat/briefing-generation`, see [01-briefing-generation.md](./01-briefing-generation.md) §8). Depends on Phase 0 artifacts 3, 4, 7, 8 (LLM + TinyFish + Notion clients in `packages/integrations`), 16 (worker skeleton).

**Dev C — Voice Q&A** (`feat/voice-qa`, see [02-voice-qa.md](./02-voice-qa.md) §8). Depends on Phase 0 artifacts 10 (fixture seed), 13 (operations), 15 (webhook skeleton). **Does NOT depend on Dev B.** The fixture briefing row unblocks Dev C from hour zero — `getBriefing` returns the fixture via production code.

**Dev D — Meeting Prep Surfaces** (`feat/meeting-prep`, see [03-meeting-prep.md](./03-meeting-prep.md) §8). Depends on Phase 0 artifacts 8 (GCal client in `packages/integrations`), 12 (subgraph resolver stubs), 17 (frontend scaffold).

### 8.4 Cross-stream cut list

If a stream slips at the 15:00 PT vertical-slice checkpoint, cut in this order:

1. **Dev B**: drop TinyFish Search; keep only Fetch (multi-URL batch). Drops news-freshness, keeps demo whole.
2. **Dev C**: drop `draftFollowUpEmail` tool; keep `answerFromBriefing` (question + section modes).
3. **Dev D**: drop Notion search; hard-code the two fixture Notion pages for the Sarah/Ramp demo.
4. **Dev D**: drop the live "Call briefing agent" launcher; record a separate voice segment for the demo video.
5. **Dev A**: drop cosign-verify from CI. Keep SBOM publish.

**Never cut**: Phase 0 artifacts, the fixture seed, Chainguard base Dockerfile, SKILL.md (required submission artifact per Ship to Prod rules), Devpost submission.

### 8.5 Rollback detail

Feature branches only. No main-branch hotfixes during the window. If a PR breaks the smoke test, revert immediately; broken work moves to a follow-up branch. Railway service rollback is one click per service.

### 8.6 Migration

Migrations + seed SQL are applied via Postgres's built-in `/docker-entrypoint-initdb.d/` path. No separate `seeder` compose service.

```yaml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: insforge
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
  volumes:
    - ./infra/seed/migrations:/docker-entrypoint-initdb.d/01-migrations:ro
    - ./infra/seed/seed:/docker-entrypoint-initdb.d/02-seed:ro
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d insforge"]
    interval: 2s
    timeout: 5s
    retries: 30
```

Postgres runs files in `/docker-entrypoint-initdb.d/` in lexical order on first init. Directory prefixes `01-` / `02-` force migrations before seeds. Subsequent starts are no-ops — drop the volume to re-seed.

No schema versioning beyond `001_init.sql` for the hackathon.

### 8.7 Environment variables (`.env.example`)

```bash
# InsForge
INSFORGE_URL=http://localhost:7130
INSFORGE_JWT_SECRET=change-me-32-characters-minimum-xyz
INSFORGE_ADMIN_EMAIL=demo@precall.app
INSFORGE_ADMIN_PASSWORD=change-me
DATABASE_URL=postgres://postgres:postgres@postgres:5432/insforge

# Google OAuth (Calendar + auth)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Notion
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# Redis
REDIS_URL=redis://localhost:6379

# Vapi
VAPI_PUBLIC_KEY=
VAPI_PRIVATE_KEY=
VAPI_ASSISTANT_ID=
VAPI_WEBHOOK_SECRET=
VAPI_WEBHOOK_URL=https://api.precall.dev/vapi/webhook

# TinyFish
TINYFISH_API_KEY=

# LLM
OPENAI_API_KEY=

# Cosmo Router
COSMO_ROUTER_PORT=3002
COSMO_MCP_PORT=5025
COSMO_ROUTER_TOKEN=
SUBGRAPH_URL=http://graph:4001/graphql
```

### 8.8 Demo script (locked 3-minute beat sheet)

Hero meeting: **"Intro with Sarah from Ramp"** (per [IDEA.md](../../IDEA.md) §Demo script).


| Time      | Beat                         | What judges see                                                                                                               |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Dashboard load               | Upcoming meetings rendered from Google Calendar. "Intro with Sarah from Ramp" front and center.                               |
| 0:20–0:35 | Click "Brief me"             | Sarah / Ramp inferred; two Notion pages selected.                                                                             |
| 0:35–1:10 | Progress streams in          | "Searching Notion / Researching Ramp / Reading Ramp pricing page / Synthesizing". Each line pushed via Redis Streams.         |
| 1:10–1:35 | Briefing rendered            | 11 sections visible. 60-second summary + suggested opening + five questions highlighted. Sources listed.                      |
| 1:35–1:50 | Click "Call briefing agent"  | Vapi Web call starts. Agent speaks firstMessage referencing Sarah + Ramp.                                                     |
| 1:50–2:30 | Follow-up questions by voice | "What should I ask first?" → three questions, each citing Notion source. "Draft a follow-up email." → agent speaks the email. |
| 2:30–2:50 | Tech narrative               | Architecture diagram (§3). Highlight Chainguard distroless + Redis Streams + Cosmo MCP.                                       |
| 2:50–3:00 | Close                        | "Every meeting you walked into under-prepared, now takes 45 seconds."                                                         |


Pre-record backup on a clean laptop with tunneled webhook. If anything fails live, cut to the pre-record.

## 9. Open Questions

All questions are `RESOLVED`, `DEFERRED` (post-MVP, out of scope), or `NON_BLOCKING` (owner + deadline inside Phase 0).

1. **[RESOLVED] WunderGraph product**: Cosmo Router MCP Gateway on a single `graphql-yoga` subgraph. No federation. ConnectRPC SDK generation is a stretch upgrade only.
2. **[RESOLVED] `api/SKILL.md` §6 supersession**: superseded by this spec (the skill references an archived repo). A follow-up PR to patch the skill is outside hackathon scope.
3. **[RESOLVED] Progress bus**: Redis Streams with `MAXLEN ~ 100` and `XREAD BLOCK id=0`. Late subscribers replay. Plain-key polling is fallback.
4. **[RESOLVED] Dev C unblock pattern**: SQL seed `infra/seed/seed/03_briefing_fixture.sql` with fixed UUID `11111111-2222-3333-4444-555555555555`. Resolver stays production code; the fixture is a real row. No `if(dev)` branches.
5. **[RESOLVED] Webhook signature format**: header `x-vapi-signature` (lowercase hex), payload `${timestamp}.${raw_body}`, timestamp header `x-vapi-timestamp` (unix ms), 5-min replay window, `crypto.timingSafeEqual` on equal-length hex buffers.
6. **[RESOLVED] Briefing context injection for Vapi**: condensed summary in `variableValues` (fast path) + `fetchBriefingSection` tool for depth. Pre-warm via `warmBriefingCache` on `vapi.start()`.
7. **[RESOLVED] Call recording storage**: link `recordingUrl` in `call_transcripts.recording_url`; do not proxy-download.
8. **[DEFERRED — post-MVP]** Redis Vector Set semantic memory. Out of scope for the 5.5-hour window.
9. **[DEFERRED — post-MVP]** Cosmo ConnectRPC TypeScript SDK generation. Upgrade path only.
10. **[DEFERRED — post-MVP]** Split `research_jobs:pending` into separate research + synthesis queues.
11. **[NON_BLOCKING]** Redis Cloud TLS cutover (`rediss://` + CA file). Owner: Dev A. Deadline: 15:15 PT. `REDIS_URL` swap only; no code change.
12. **[NON_BLOCKING]** Personal-email attendees → null `companies.domain`. `briefings.company_id` stays nullable; UI surfaces "Company: ?" placeholder. Owner: Dev D. Deadline: 14:30 PT. Already covered by `CalendarEvent` inference in [03-meeting-prep.md](./03-meeting-prep.md) §4.7.
13. **[RESOLVED] Shipables/SKILL.md requirement status**: publishing the project as a skill to shipables.dev is a **required** submission artifact per [Ship to Prod official rules](https://ship-to-prod.devpost.com/). Bundle via `npx @senso-ai/shipables`. Frontmatter per [https://agentskills.io/specification](https://agentskills.io/specification). Language in §4 Submission artifacts matches.

