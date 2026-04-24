import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import type Redis from 'ioredis'
import { NextRequest } from 'next/server'

import {
  applyMigrations,
  openDb,
  openRedis,
  primeTestEnv,
  seedUser,
  truncateUsers,
} from './helpers.js'

primeTestEnv()

const { POST: phonePost } = await import('../src/app/api/onboarding/phone/route.js')
const { signSession, SESSION_COOKIE } = await import('../src/lib/session.js')

describe('POST /api/onboarding/phone', () => {
  let redis: Redis
  let pool: Pool
  let userId: string
  let sessionCookie: string

  beforeAll(async () => {
    redis = openRedis()
    pool = await openDb()
    await applyMigrations(pool)
  })

  afterAll(async () => {
    redis.disconnect()
    await pool.end()
  })

  beforeEach(async () => {
    await redis.flushdb()
    await truncateUsers(pool)
    userId = await seedUser(pool, {
      email: 'onboard@test.com',
      googleSub: 'sub-onboard-1',
      displayName: 'Onboard Test',
    })
    const token = await signSession({
      sub: userId,
      email: 'onboard@test.com',
      name: 'Onboard Test',
      picture: null,
    })
    sessionCookie = `${SESSION_COOKIE}=${token}`
  })

  it('redirects unauthenticated callers to the landing page', async () => {
    const res = await phonePost(formRequest('http://localhost:3000/api/onboarding/phone', ''))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
  })

  it("normalizes and stores the user's phone number", async () => {
    const res = await phonePost(
      formRequest('http://localhost:3000/api/onboarding/phone', '(415) 555-2671', sessionCookie),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard?onboarded=1')

    const { rows } = await pool.query<{ phone_number_e164: string | null }>(
      'SELECT phone_number_e164 FROM users WHERE id=$1',
      [userId],
    )
    expect(rows[0]!.phone_number_e164).toBe('+14155552671')
  })

  it('rejects invalid phone numbers without updating the user', async () => {
    const res = await phonePost(
      formRequest('http://localhost:3000/api/onboarding/phone', '555-2671', sessionCookie),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding?phoneError=invalid')

    const { rows } = await pool.query<{ phone_number_e164: string | null }>(
      'SELECT phone_number_e164 FROM users WHERE id=$1',
      [userId],
    )
    expect(rows[0]!.phone_number_e164).toBeNull()
  })
})

function formRequest(url: string, phone: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  }
  if (cookie) headers.cookie = cookie
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ phone }).toString(),
  })
}
