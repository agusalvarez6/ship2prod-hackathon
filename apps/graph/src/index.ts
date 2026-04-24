import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { DateTimeResolver, JSONResolver } from 'graphql-scalars'
import { createSchema, createYoga } from 'graphql-yoga'
import { Hono } from 'hono'
import { createBuildContext, type GraphContext } from './context.js'
import { briefingResolvers } from './resolvers/briefing.js'
import { meetingResolvers } from './resolvers/meeting.js'
import { voiceResolvers } from './resolvers/voice.js'

const here = dirname(fileURLToPath(import.meta.url))
const typeDefs = readFileSync(resolve(here, 'schema.graphql'), 'utf8')

const schema = createSchema<GraphContext>({
  typeDefs,
  resolvers: {
    DateTime: DateTimeResolver,
    JSON: JSONResolver,
    Query: {
      listUpcomingMeetings: meetingResolvers.listUpcomingMeetings,
      searchNotionContext: meetingResolvers.searchNotionContext,
      getBriefingProgress: briefingResolvers.getBriefingProgress,
      getBriefing: briefingResolvers.getBriefing,
      listBriefings: briefingResolvers.listBriefings,
    },
    Mutation: {
      createBriefingFromMeeting: briefingResolvers.createBriefingFromMeeting,
      answerFromBriefing: voiceResolvers.answerFromBriefing,
      draftFollowUpEmail: briefingResolvers.draftFollowUpEmail,
      saveCallTranscript: voiceResolvers.saveCallTranscript,
    },
  },
})

const buildContext = createBuildContext()

const yoga = createYoga<GraphContext>({
  schema,
  graphqlEndpoint: '/graphql',
  context: ({ request }) => buildContext(request),
  landingPage: false,
})

export const app = new Hono()

app.get('/health', (c) => c.json({ ok: true }))

app.get('/auth/google/callback', (c) => c.json({ error: 'not implemented in Phase 0' }, 501))

app.get('/auth/notion/callback', (c) => c.json({ error: 'not implemented in Phase 0' }, 501))

app.all('/graphql', (c) => yoga.fetch(c.req.raw))

const PORT = Number(process.env['PORT'] ?? 4001)

if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port: PORT })
  console.warn(`graph: listening on :${PORT}`)
}
