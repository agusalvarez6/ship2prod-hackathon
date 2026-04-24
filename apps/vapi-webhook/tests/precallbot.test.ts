import { describe, expect, it } from 'vitest'

import { handleRequest, extractVapiToolCalls } from '../src/server.js'
import {
  DEMO_USER_ID,
  createMockNextMeetingRepository,
  type NextMeeting,
  type NextMeetingRepository,
} from '../src/precallbot/nextMeeting.js'
import {
  buildGetNextMeetingToolConfig,
  buildPreCallBotAssistantConfig,
} from '../src/precallbot/vapiConfig.js'

const NOW = new Date('2026-04-24T21:00:00.000Z')

const SAMPLE_MEETING: NextMeeting = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  title: 'Intro with Sarah from Ramp',
  startsAt: '2026-04-24T21:30:00.000Z',
  startsInMinutes: 30,
  description: 'Intro call to discuss Ramp card program and spend controls.',
  attendees: [
    { email: 'sarah@ramp.com', displayName: 'Sarah Chen', organizer: false },
    { email: 'demo@precall.app', displayName: 'You', organizer: true },
  ],
  contact: {
    name: 'Sarah Chen',
    email: 'sarah@ramp.com',
    role: 'Account Executive',
  },
  company: {
    name: 'Ramp',
    domain: 'ramp.com',
    summary: 'Corporate card and spend management platform.',
  },
  briefing: {
    id: '11111111-2222-3333-4444-555555555555',
    status: 'ready',
    summary60s: 'Sarah is focused on spend controls and QuickBooks sync.',
    suggestedOpeningLine: 'Sarah, can we pressure-test the QuickBooks sync first?',
    questionsToAsk: ['How does QuickBooks sync handle class tags?'],
    likelyPainPoints: ['Policy migration'],
    risks: ['Pricing may stay vague until late-stage.'],
    followUpEmail: 'Thanks for the intro call.',
  },
}

describe('PreCallBot meeting endpoint', () => {
  it('requires the internal bearer token when configured', async () => {
    const response = await handleRequest(new Request('http://local/api/meetings/next'), {
      repository: fakeRepository(SAMPLE_MEETING),
      internalApiKey: 'secret',
      now: () => NOW,
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' })
  })

  it('returns the next meeting and voice summary', async () => {
    let seenUserId: string | null = null
    const response = await handleRequest(
      new Request(`http://local/api/meetings/next?userId=${DEMO_USER_ID}`, {
        headers: { authorization: 'Bearer secret' },
      }),
      {
        repository: {
          async findNextMeeting(lookup) {
            seenUserId = lookup.userId
            return SAMPLE_MEETING
          },
        },
        internalApiKey: 'secret',
        now: () => NOW,
      },
    )

    expect(response.status).toBe(200)
    expect(seenUserId).toBe(DEMO_USER_ID)
    await expect(response.json()).resolves.toMatchObject({
      meeting: {
        title: 'Intro with Sarah from Ramp',
        contact: { name: 'Sarah Chen' },
        company: { name: 'Ramp' },
        briefing: { status: 'ready' },
      },
      voiceSummary: expect.stringContaining('Next meeting: Intro with Sarah from Ramp'),
    })
  })

  it('loads the demo meeting from mock JSON', async () => {
    const repository = createMockNextMeetingRepository()
    const meeting = await repository.findNextMeeting({
      userId: DEMO_USER_ID,
      email: null,
      now: NOW,
    })

    expect(meeting).toMatchObject({
      title: 'Intro with Sarah from Ramp',
      startsInMinutes: 30,
      briefing: {
        status: 'ready',
        questionsToAsk: expect.arrayContaining([
          "How does Ramp's QuickBooks sync handle class and location tags on card transactions?",
        ]),
      },
    })
  })

  it('responds to Vapi tool-call envelopes', async () => {
    const response = await handleRequest(
      new Request('http://local/vapi/tools/get-next-meeting', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            type: 'tool-calls',
            toolCallList: [
              {
                id: 'tool-call-1',
                name: 'getNextMeeting',
                arguments: { userId: DEMO_USER_ID },
              },
            ],
          },
        }),
      }),
      {
        repository: fakeRepository(SAMPLE_MEETING),
        internalApiKey: 'secret',
        now: () => NOW,
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      results: [
        {
          toolCallId: 'tool-call-1',
          result: {
            meeting: { title: 'Intro with Sarah from Ramp' },
            voiceSummary: expect.stringContaining('Suggested opener'),
          },
        },
      ],
    })
  })

  it('extracts current and legacy Vapi tool-call shapes', () => {
    expect(
      extractVapiToolCalls({
        message: {
          toolWithToolCallList: [
            {
              name: 'getNextMeeting',
              toolCall: {
                id: 'abc',
                function: { parameters: { email: 'demo@precall.app' } },
              },
            },
          ],
        },
      }),
    ).toEqual([{ id: 'abc', name: 'getNextMeeting', parameters: { email: 'demo@precall.app' } }])
  })
})

describe('PreCallBot Vapi config', () => {
  it('points the function tool at the local Vapi tool endpoint', () => {
    const config = buildGetNextMeetingToolConfig({
      publicBaseUrl: 'https://api.precall.dev/vapi/webhook',
      internalApiKey: 'secret',
    })

    expect(config).toMatchObject({
      type: 'function',
      function: { name: 'getNextMeeting' },
      server: {
        url: 'https://api.precall.dev/vapi/tools/get-next-meeting',
        headers: { Authorization: 'Bearer secret' },
      },
    })
  })

  it('attaches the system prompt and tool id to the assistant config', () => {
    const config = buildPreCallBotAssistantConfig({ toolId: 'tool_123' })

    expect(config).toMatchObject({
      name: 'PreCallBot',
      model: {
        provider: 'openai',
        toolIds: ['tool_123'],
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('You are PreCallBot'),
          },
        ],
      },
    })
  })
})

function fakeRepository(meeting: NextMeeting | null): NextMeetingRepository {
  return {
    async findNextMeeting() {
      return meeting
    },
  }
}
