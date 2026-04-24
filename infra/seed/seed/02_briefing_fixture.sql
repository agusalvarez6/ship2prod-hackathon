-- 02_briefing_fixture.sql
--
-- Canonical fixture briefing used across the project. UUID is literal and
-- must not be regenerated. It is referenced by:
--   - docs/specs/00-master.md §8.3 and §9 Q4 (Dev C unblock pattern)
--   - /tmp/foundations-2215ec51/scope.md §2 and §3.3
--   - infra/seed/briefings.seed.json (app-level JSON mirror)
-- Status is 'ready'. The sections JSONB carries all eleven keys defined by
-- BriefingSectionsSchema in packages/schema/src/briefing.ts. The five
-- citedSources reference rows inserted by 03_sources_fixture.sql.

INSERT INTO briefings (
  id,
  user_id,
  meeting_id,
  contact_name,
  contact_email,
  contact_role,
  company_name,
  company_domain,
  company_summary,
  status,
  summary_60s,
  sections,
  sources_count,
  error_message,
  research_started_at,
  research_finished_at,
  research_error,
  created_at,
  updated_at
)
VALUES (
  '11111111-2222-3333-4444-555555555555',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Sarah Chen',
  'sarah@ramp.com',
  'Account Executive',
  'Ramp',
  'ramp.com',
  'Corporate card and spend management platform. Automates expense policy, bill pay, and accounting workflows for finance teams.',
  'ready',
  'Sarah Chen is an AE at Ramp, a finance automation platform focused on corporate cards, spend controls, and bill pay. Ramp grew to a reported 30,000 customers after its Series D. Sarah''s typical buyer is a CFO or controller at a 50-to-500 person company migrating off Brex or Divvy. Lead with total spend visibility and close with the accounting automations your team already notes in Notion.',
  $json$
  {
    "summary60s": "Sarah Chen is an AE at Ramp, a finance automation platform focused on corporate cards, spend controls, and bill pay. Ramp grew to a reported 30,000 customers after its Series D. Sarah's typical buyer is a CFO or controller at a 50-to-500 person company migrating off Brex or Divvy. Lead with total spend visibility and close with the accounting automations your team already notes in Notion.",
    "whoYouAreMeeting": {
      "name": "Sarah Chen",
      "role": "Account Executive",
      "company": "Ramp"
    },
    "companyContext": {
      "whatTheyDo": "Ramp sells corporate cards bundled with expense automation, bill pay, and ERP integrations. Pricing is free for the card product, with paid tiers for Ramp Plus and Ramp Bill Pay.",
      "recentUpdates": [
        "Closed Series D at a reported $13B valuation, extended runway and signaled land-and-expand focus.",
        "Shipped Ramp Intelligence, an AI layer over spend data that flags duplicate vendors and out-of-policy receipts.",
        "Expanded bill pay to support international wires in more than 40 currencies."
      ]
    },
    "internalContext": {
      "notionExcerpts": [
        {
          "pageTitle": "Vendor shortlist - corporate cards",
          "excerpt": "Ramp and Brex are the two finalists. Ramp wins on policy automation, Brex wins on travel. Finance lead prefers Ramp if the ERP sync matches our QuickBooks setup."
        },
        {
          "pageTitle": "Q2 finance ops goals",
          "excerpt": "Top goal is to eliminate manual receipt chasing. Budget is approved for a card program migration by end of Q3. Owner is the controller, not the CFO."
        }
      ]
    },
    "bestConversationAngle": "Open on spend visibility, not price. The controller already has budget; the blocker is a clean QuickBooks sync and confidence that policy rules port over from the current card provider.",
    "suggestedOpeningLine": "Sarah, thanks for making time. I want to skip the overview and use the 30 minutes to pressure-test whether Ramp fits our QuickBooks setup and policy library. Cool if I start with how our controller is thinking about this?",
    "questionsToAsk": [
      "How does Ramp's QuickBooks sync handle class and location tags on card transactions?",
      "What does the policy migration look like when we come off an existing corporate card program?",
      "Which of your customers closest to our size cut receipt-chasing time with Ramp, and by how much?",
      "What is the realistic timeline from signed contract to cards issued and first statement closed?",
      "If we want Ramp Bill Pay next quarter, what does pricing look like at our AP volume?"
    ],
    "likelyPainPoints": [
      "Migration friction: re-keying vendor records and policy rules from the current provider.",
      "QuickBooks sync edge cases around class, location, and custom fields.",
      "Change management for employees used to the existing card UX."
    ],
    "risks": [
      "Procurement and legal review could push a close into Q4 if the MSA is not standard.",
      "Sarah may push the AE playbook of free cards first, leaving Ramp Plus and Bill Pay pricing vague until late-stage."
    ],
    "followUpEmail": "Hi Sarah, thanks for the intro call. Quick recap of what landed for us: spend visibility story is strong, QuickBooks sync sounds workable but we want a reference call with a similarly sized customer, and we need written pricing for Ramp Plus and Bill Pay at our AP volume before we take this to the controller. Happy to schedule a 30-minute technical deep-dive on the ERP sync next week. Best, the PreCall team.",
    "citedSources": [
      {
        "id": "cccccccc-0001-0000-0000-000000000001",
        "title": "Ramp - Corporate Cards and Spend Management",
        "url": "https://ramp.com",
        "kind": "company_site"
      },
      {
        "id": "cccccccc-0002-0000-0000-000000000002",
        "title": "Ramp Plus pricing",
        "url": "https://ramp.com/pricing",
        "kind": "pricing_page"
      },
      {
        "id": "cccccccc-0003-0000-0000-000000000003",
        "title": "Ramp announces Series D and Ramp Intelligence",
        "url": "https://ramp.com/blog/series-d-ramp-intelligence",
        "kind": "news"
      },
      {
        "id": "cccccccc-0004-0000-0000-000000000004",
        "title": "Vendor shortlist - corporate cards",
        "kind": "notion_page"
      },
      {
        "id": "cccccccc-0005-0000-0000-000000000005",
        "title": "Sarah Chen - Ramp",
        "url": "https://www.linkedin.com/in/sarahchen-ramp",
        "kind": "linkedin"
      }
    ]
  }
  $json$::jsonb,
  5,
  NULL,
  '2026-04-24T17:15:00Z',
  '2026-04-24T17:15:42Z',
  NULL,
  '2026-04-24T17:15:00Z',
  '2026-04-24T17:15:42Z'
)
ON CONFLICT (id) DO NOTHING;
