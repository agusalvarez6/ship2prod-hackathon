import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server.js'
import { POSTGRES_TEST_URL, REDIS_TEST_URL } from './env.js'

process.env['POSTGRES_TEST_URL'] ??= POSTGRES_TEST_URL
process.env['REDIS_TEST_URL'] ??= REDIS_TEST_URL
process.env['DATABASE_URL'] ??= POSTGRES_TEST_URL
process.env['REDIS_URL'] ??= REDIS_TEST_URL

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
