-- 03_sources_fixture.sql
--
-- Source rows the fixture briefing cites. IDs match citedSources[].id in
-- 02_briefing_fixture.sql. Five sources cover the canonical kinds named in
-- CLAUDE.md domain vocabulary: company_site, pricing_page, news,
-- notion_page, linkedin. The LinkedIn row has status='blocked' to exercise
-- the TinyFish blocked-source path (see docs/specs/01-*.md §4 TinyFish
-- normalizer) without losing the attribution in the briefing.

INSERT INTO sources (
  id,
  briefing_id,
  kind,
  url,
  final_url,
  external_id,
  title,
  excerpt,
  raw,
  status,
  fetched_at
)
VALUES
  (
    'cccccccc-0001-0000-0000-000000000001',
    '11111111-2222-3333-4444-555555555555',
    'company_site',
    'https://ramp.com',
    'https://ramp.com/',
    NULL,
    'Ramp - Corporate Cards and Spend Management',
    'Ramp is the finance platform designed to save businesses time and money. Corporate cards, bill pay, accounting automation, and travel, all in one place.',
    '{"tinyfishTool": "fetch", "tinyfishRunId": "fixture-run-001"}'::jsonb,
    'ok',
    '2026-04-24T17:15:05Z'
  ),
  (
    'cccccccc-0002-0000-0000-000000000002',
    '11111111-2222-3333-4444-555555555555',
    'pricing_page',
    'https://ramp.com/pricing',
    'https://ramp.com/pricing',
    NULL,
    'Ramp Plus pricing',
    'Ramp is free. Ramp Plus adds advanced approvals, custom policies, and priority support for a per-user monthly fee. Ramp Bill Pay is priced by AP volume.',
    '{"tinyfishTool": "fetch", "tinyfishRunId": "fixture-run-002"}'::jsonb,
    'ok',
    '2026-04-24T17:15:10Z'
  ),
  (
    'cccccccc-0003-0000-0000-000000000003',
    '11111111-2222-3333-4444-555555555555',
    'news',
    'https://ramp.com/blog/series-d-ramp-intelligence',
    'https://ramp.com/blog/series-d-ramp-intelligence',
    NULL,
    'Ramp announces Series D and Ramp Intelligence',
    'Ramp closed a Series D at a reported $13B valuation and launched Ramp Intelligence, an AI layer that surfaces duplicate vendors and out-of-policy receipts.',
    '{"tinyfishTool": "fetch", "tinyfishRunId": "fixture-run-003"}'::jsonb,
    'ok',
    '2026-04-24T17:15:18Z'
  ),
  (
    'cccccccc-0004-0000-0000-000000000004',
    '11111111-2222-3333-4444-555555555555',
    'notion_page',
    NULL,
    NULL,
    'notion-page-vendor-shortlist',
    'Vendor shortlist - corporate cards',
    'Ramp and Brex are the two finalists. Ramp wins on policy automation, Brex wins on travel. Controller prefers Ramp if QuickBooks sync matches our setup.',
    '{"tinyfishTool": null, "tinyfishRunId": null}'::jsonb,
    'ok',
    '2026-04-24T17:15:22Z'
  ),
  (
    'cccccccc-0005-0000-0000-000000000005',
    '11111111-2222-3333-4444-555555555555',
    'linkedin',
    'https://www.linkedin.com/in/sarahchen-ramp',
    NULL,
    NULL,
    'Sarah Chen - Ramp',
    'Public LinkedIn profile blocked by CAPTCHA at fetch time. Citation preserved on the briefing; narrative text falls back to attendee inference.',
    '{"tinyfishTool": "fetch", "tinyfishRunId": "fixture-run-004", "blockReason": "captcha"}'::jsonb,
    'blocked',
    '2026-04-24T17:15:30Z'
  )
ON CONFLICT (id) DO NOTHING;
