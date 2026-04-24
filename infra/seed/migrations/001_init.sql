-- 001_init.sql
--
-- Canonical InsForge schema for PreCall. Mirrors the DDL in
-- docs/specs/00-master.md §4 and the foundations scope report
-- /tmp/foundations-2215ec51/scope.md §2.
--
-- Five tables only: users, meetings, briefings, sources, call_transcripts.
-- Contact and company fields are denormalized onto briefings (no separate
-- contacts / companies tables). Research job state is folded onto briefings
-- (no separate research_jobs table, no DLQ table). Concurrency for briefing
-- generation is controlled in Redis via job:{briefingId}:claim, not in SQL.
--
-- Applied automatically by Postgres docker-entrypoint-initdb.d at
-- /docker-entrypoint-initdb.d/01-migrations/ on first init. For local and
-- test reruns, psql can be pointed at this file directly; every statement
-- uses IF NOT EXISTS so it is safe to re-apply.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL UNIQUE,
  phone_number_e164    TEXT,
  google_refresh_token TEXT,
  notion_token         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_number_e164
  ON users (phone_number_e164)
  WHERE phone_number_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS meetings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_event_id TEXT NOT NULL,
  title             TEXT NOT NULL,
  starts_at         TIMESTAMPTZ NOT NULL,
  attendees         JSONB NOT NULL DEFAULT '[]'::jsonb,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_user_event
  ON meetings(user_id, calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_meetings_user_time
  ON meetings(user_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS briefings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id            UUID REFERENCES meetings(id) ON DELETE SET NULL,

  -- Denormalized contact and company fields.
  contact_name          TEXT,
  contact_email         TEXT,
  contact_role          TEXT,
  company_name          TEXT,
  company_domain        TEXT,
  company_summary       TEXT,

  -- Briefing state.
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','researching','drafting','ready','failed')),
  summary_60s           TEXT,
  sections              JSONB,
  sources_count         INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,

  -- Research job state folded onto the briefing row.
  research_started_at   TIMESTAMPTZ,
  research_finished_at  TIMESTAMPTZ,
  research_error        JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_briefings_user_created
  ON briefings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_status_active
  ON briefings(status)
  WHERE status IN ('pending','researching','drafting');
CREATE INDEX IF NOT EXISTS idx_briefings_sections_gin
  ON briefings USING GIN (sections);

CREATE TABLE IF NOT EXISTS sources (
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
CREATE INDEX IF NOT EXISTS idx_sources_briefing ON sources(briefing_id);

CREATE TABLE IF NOT EXISTS call_transcripts (
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_transcripts_vapi
  ON call_transcripts(vapi_call_id) WHERE vapi_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_user
  ON call_transcripts(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
