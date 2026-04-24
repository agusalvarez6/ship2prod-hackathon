-- 01_meetings_fixture.sql
--
-- The "Intro with Sarah from Ramp" meeting that the canonical fixture
-- briefing is linked to. Cited in docs/specs/00-master.md §8.8 as the
-- hero demo meeting. Meeting UUID is stable so the briefing seed can
-- reference it via meeting_id.

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
  '2026-04-24T21:30:00Z',
  '[
    {"email": "sarah@ramp.com", "displayName": "Sarah Chen", "organizer": false},
    {"email": "demo@precall.app", "displayName": "You", "organizer": true}
  ]'::jsonb,
  'Intro call to discuss Ramp card program and spend controls.',
  '2026-04-24T17:00:00Z'
)
ON CONFLICT (user_id, calendar_event_id) DO NOTHING;
