import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Hono } from 'hono'
import { createYoga, createSchema } from 'graphql-yoga'
import { GraphQLScalarType, Kind, type ValueNode } from 'graphql'
import { buildContext, type GraphContext } from './context.js'
import { briefingResolvers } from './resolvers/briefing.js'
import { meetingResolvers } from './resolvers/meeting.js'
import { voiceResolvers } from './resolvers/voice.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const typeDefs = readFileSync(path.join(HERE, 'schema.graphql'), 'utf8')

function parseLiteralValue(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value)
    case Kind.NULL:
      return null
    case Kind.LIST:
      return ast.values.map(parseLiteralValue)
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {}
      for (const f of ast.fields) obj[f.name.value] = parseLiteralValue(f.value)
      return obj
    }
    default:
      return null
  }
}

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: parseLiteralValue,
})

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO 8601 datetime string',
  serialize: (v) => String(v),
  parseValue: (v) => String(v),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? ast.value : null),
})

const resolvers = {
  JSON: JSONScalar,
  DateTime: DateTimeScalar,
  Query: {
    ...meetingResolvers.Query,
    ...briefingResolvers.Query,
  },
  Mutation: {
    ...briefingResolvers.Mutation,
    ...voiceResolvers.Mutation,
  },
}

const schema = createSchema<GraphContext>({ typeDefs, resolvers })

const yoga = createYoga<GraphContext>({
  schema,
  landingPage: false,
  graphiql: true,
  context: ({ request }) => buildContext(request),
})

export const app = new Hono()

app.get('/health', (c) => c.json({ ok: true }))

app.all('/graphql', async (c) => yoga.fetch(c.req.raw))

app.all('/auth/google/callback', (c) =>
  c.json({ error: 'not implemented in Phase 0' }, 501),
)
app.all('/auth/notion/callback', (c) =>
  c.json({ error: 'not implemented in Phase 0' }, 501),
)

export async function start(port = Number(process.env['PORT'] ?? 4001)): Promise<void> {
  const { serve } = await import('@hono/node-server')
  serve({ fetch: app.fetch, port })
  console.warn(`graph subgraph listening on :${port}`)
}

if (
  process.env['NODE_ENV'] !== 'test' &&
  process.env['VITEST'] !== 'true' &&
  process.env['GRAPH_NO_LISTEN'] !== '1'
) {
  void start()
}
