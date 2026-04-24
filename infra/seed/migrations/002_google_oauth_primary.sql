-- 002_google_oauth_primary.sql
-- Adds Google primary-login columns to users. See docs/specs/04-google-oauth-login.md §3.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub                     TEXT,
  ADD COLUMN IF NOT EXISTS google_access_token            TEXT,
  ADD COLUMN IF NOT EXISTS google_access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_name                   TEXT,
  ADD COLUMN IF NOT EXISTS picture_url                    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
