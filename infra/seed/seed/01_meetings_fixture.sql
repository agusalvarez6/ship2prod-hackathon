-- 01_meetings_fixture.sql
--
-- The "Intro with Sarah from Ramp" meeting that the canonical fixture
-- briefing is linked to. Cited in docs/specs/00-master.md §8.8 as the
-- hero demo meeting. Meeting UUID is stable so the briefing seed can
-- reference it via meeting_id. starts_at is relative so the demo remains
-- an upcoming meeting whenever the fixture is re-applied.

INSERT INTO meetings (
  id,
  user_id,
  calendar_event_id,
  title,
  starts_at,
  attendees,
  description,
  created_at
)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'demo-event-sarah-ramp-001',
  'Intro with Sarah from Ramp',
  date_trunc('minute', now() + interval '15 minutes'),
  '[
    {"email": "sarah@ramp.com", "displayName": "Sarah Chen", "organizer": false},
    {"email": "demo@precall.app", "displayName": "You", "organizer": true}
  ]'::jsonb,
  'Intro call to discuss Ramp card program and spend controls.',
  '2026-04-24T17:00:00Z'
)
ON CONFLICT (user_id, calendar_event_id) DO UPDATE SET
  title = EXCLUDED.title,
  starts_at = EXCLUDED.starts_at,
  attendees = EXCLUDED.attendees,
  description = EXCLUDED.description;
