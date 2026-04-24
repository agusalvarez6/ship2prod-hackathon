-- 00_users.sql
--
-- Fixture user that owns the canonical Sarah / Ramp briefing.
-- User UUID is stable so the meeting and briefing seeds can reference it.
-- Matches the INSFORGE_ADMIN_EMAIL default in docs/specs/00-master.md §8.7.

INSERT INTO users (id, email, google_refresh_token, notion_token, phone_number_e164, created_at)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'demo@precall.app',
  NULL,
  NULL,
  '+14155552671',
  '2026-04-24T17:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
