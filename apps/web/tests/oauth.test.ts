import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import type { Pool } from 'pg'
import type Redis from 'ioredis'
import { NextRequest } from 'next/server'

import { server } from '../../../test/msw/server.js'
import {
  applyMigrations,
  fakeIdToken,
  openDb,
  openRedis,
  primeTestEnv,
  truncateUsers,
} from './helpers.js'

primeTestEnv()

// Import after env is primed so the singletons pick up the test URLs.
const { GET: startGet } = await import('../src/app/api/auth/google/start/route.js')
const { GET: callbackGet } = await import('../src/app/api/auth/google/callback/route.js')
const { POST: logoutPost } = await import('../src/app/api/auth/logout/route.js')
const { GET: meGet } = await import('../src/app/api/auth/me/route.js')
const { POST: disconnectPost } = await import('../src/app/api/auth/google/disconnect/route.js')
const { signSession, SESSION_COOKIE } = await import('../src/lib/session.js')
const { stateKey } = await import('../src/lib/oauth.js')

const GOOGLE_SUB = '106839928463728910573'
const GOOGLE_EMAIL = 'demo@precall.app'

function tokenJson(
  overrides: { scope?: string; refresh_token?: string | null } = {},
): Record<string, unknown> {
  // `refresh_token: null` → omit from response. Otherwise use override, else the default.
  const base: Record<string, unknown> = {
    access_token: 'ya29.TEST-ACCESS',
    id_token: fakeIdToken({
      sub: GOOGLE_SUB,
      email: GOOGLE_EMAIL,
      email_verified: true,
      name: 'Demo User',
      picture: 'https://lh3.googleusercontent.com/demo',
    }),
    expires_in: 3600,
    scope: overrides.scope ?? 'openid email profile https://www.googleapis.com/auth/calendar',
    token_type: 'Bearer',
  }
  if (overrides.refresh_token !== null) {
    base.refresh_token = overrides.refresh_token ?? '1//TEST-REFRESH'
  }
  return base
}

describe('Google OAuth routes', () => {
  let redis: Redis
  let pool: Pool

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
  })

  describe('GET /api/auth/google/start', () => {
    it('stores nonce in Redis and 302s to Google with the required params', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/google/start')
      const res = await startGet(req)

      expect(res.status).toBe(302)
      const location = res.headers.get('location')!
      expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/)

      const url = new URL(location)
      expect(url.searchParams.get('client_id')).toBe('test-client-id')
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/api/auth/google/callback',
      )
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('access_type')).toBe('offline')
      expect(url.searchParams.get('prompt')).toBe('consent')

      const scope = url.searchParams.get('scope')!
      expect(scope).toContain('openid')
      expect(scope).toContain('email')
      expect(scope).toContain('profile')
      expect(scope).toContain('https://www.googleapis.com/auth/calendar')

      const nonce = url.searchParams.get('state')!
      expect(nonce.length).toBeGreaterThan(30)
      expect(await redis.exists(stateKey(nonce))).toBe(1)
      const ttl = await redis.ttl(stateKey(nonce))
      expect(ttl).toBeGreaterThan(500)
      expect(ttl).toBeLessThanOrEqual(600)
    })
  })

  describe('GET /api/auth/google/callback', () => {
    it('exchanges the code, upserts the user, sets session cookie, and 302s /onboarding', async () => {
      const tokenCalls: string[] = []
      server.use(
        http.post('https://oauth2.googleapis.com/token', async ({ request }) => {
          tokenCalls.push(await request.clone().text())
          return HttpResponse.json(tokenJson())
        }),
      )

      // Mint a real nonce via the start endpoint so the state shape matches.
      const startRes = await startGet(
        new NextRequest('http://localhost:3000/api/auth/google/start'),
      )
      const nonce = new URL(startRes.headers.get('location')!).searchParams.get('state')!

      const req = new NextRequest(
        `http://localhost:3000/api/auth/google/callback?code=auth-code-123&state=${nonce}`,
      )
      const res = await callbackGet(req)

      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding')

      const setCookie = res.headers.get('set-cookie')!
      expect(setCookie).toContain(`${SESSION_COOKIE}=`)
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')

      expect(tokenCalls).toHaveLength(1)
      expect(tokenCalls[0]).toContain('code=auth-code-123')
      expect(tokenCalls[0]).toContain('grant_type=authorization_code')
      expect(tokenCalls[0]).toContain('client_id=test-client-id')

      const { rows } = await pool.query<{
        email: string
        google_sub: string | null
        google_access_token: string | null
        google_refresh_token: string | null
        display_name: string | null
        picture_url: string | null
      }>(
        'SELECT email, google_sub, google_access_token, google_refresh_token, display_name, picture_url FROM users',
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.google_sub).toBe(GOOGLE_SUB)
      expect(rows[0]!.email).toBe(GOOGLE_EMAIL)
      expect(rows[0]!.google_access_token).toBe('ya29.TEST-ACCESS')
      expect(rows[0]!.google_refresh_token).toBe('1//TEST-REFRESH')
      expect(rows[0]!.display_name).toBe('Demo User')
      expect(rows[0]!.picture_url).toBe('https://lh3.googleusercontent.com/demo')

      // The nonce must have been deleted (single-use).
      expect(await redis.exists(stateKey(nonce))).toBe(0)
    })

    it('returns 400 when state is missing from Redis', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/auth/google/callback?code=c&state=unknown-nonce',
      )
      const res = await callbackGet(req)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('state_missing')
    })

    it('redirects with calendar_scope_missing when the token response omits calendar scope', async () => {
      server.use(
        http.post('https://oauth2.googleapis.com/token', () =>
          HttpResponse.json(tokenJson({ scope: 'openid email profile' })),
        ),
      )

      const startRes = await startGet(
        new NextRequest('http://localhost:3000/api/auth/google/start'),
      )
      const nonce = new URL(startRes.headers.get('location')!).searchParams.get('state')!

      const res = await callbackGet(
        new NextRequest(`http://localhost:3000/api/auth/google/callback?code=c&state=${nonce}`),
      )
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/?oauthError=calendar_scope_missing',
      )

      const { rows } = await pool.query('SELECT * FROM users')
      expect(rows).toHaveLength(0)
    })

    it('redirects with code_exchange_failed when Google returns 400 on /token', async () => {
      server.use(
        http.post('https://oauth2.googleapis.com/token', () =>
          HttpResponse.json({ error: 'invalid_request' }, { status: 400 }),
        ),
      )

      const startRes = await startGet(
        new NextRequest('http://localhost:3000/api/auth/google/start'),
      )
      const nonce = new URL(startRes.headers.get('location')!).searchParams.get('state')!

      const res = await callbackGet(
        new NextRequest(`http://localhost:3000/api/auth/google/callback?code=c&state=${nonce}`),
      )
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/?oauthError=code_exchange_failed',
      )
    })

    it('replaying the same nonce returns state_missing on the second call', async () => {
      server.use(
        http.post('https://oauth2.googleapis.com/token', () => HttpResponse.json(tokenJson())),
      )

      const startRes = await startGet(
        new NextRequest('http://localhost:3000/api/auth/google/start'),
      )
      const nonce = new URL(startRes.headers.get('location')!).searchParams.get('state')!

      const first = await callbackGet(
        new NextRequest(`http://localhost:3000/api/auth/google/callback?code=c&state=${nonce}`),
      )
      expect(first.headers.get('location')).toBe('http://localhost:3000/onboarding')

      const second = await callbackGet(
        new NextRequest(`http://localhost:3000/api/auth/google/callback?code=c&state=${nonce}`),
      )
      expect(second.status).toBe(400)
    })

    it('preserves the prior refresh token when Google omits it on re-consent', async () => {
      // Seed a user with an existing refresh token.
      await pool.query(
        `INSERT INTO users (email, google_sub, google_refresh_token, google_access_token,
                            google_access_token_expires_at, display_name, picture_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          GOOGLE_EMAIL,
          GOOGLE_SUB,
          '1//PRIOR-REFRESH',
          'old-access',
          new Date().toISOString(),
          'Demo',
          null,
        ],
      )

      server.use(
        http.post('https://oauth2.googleapis.com/token', () =>
          HttpResponse.json(tokenJson({ refresh_token: null })),
        ),
      )

      const startRes = await startGet(
        new NextRequest('http://localhost:3000/api/auth/google/start'),
      )
      const nonce = new URL(startRes.headers.get('location')!).searchParams.get('state')!

      await callbackGet(
        new NextRequest(`http://localhost:3000/api/auth/google/callback?code=c&state=${nonce}`),
      )

      const { rows } = await pool.query<{
        google_refresh_token: string
        google_access_token: string
      }>('SELECT google_refresh_token, google_access_token FROM users WHERE google_sub=$1', [
        GOOGLE_SUB,
      ])
      expect(rows[0]!.google_refresh_token).toBe('1//PRIOR-REFRESH')
      expect(rows[0]!.google_access_token).toBe('ya29.TEST-ACCESS')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie and redirects to /', async () => {
      const res = await logoutPost(
        new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' }),
      )
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe('http://localhost:3000/')
      const cookie = res.headers.get('set-cookie')!
      expect(cookie).toContain(`${SESSION_COOKIE}=`)
      expect(cookie).toContain('Max-Age=0')
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns 401 when no cookie is present', async () => {
      const res = await meGet(new NextRequest('http://localhost:3000/api/auth/me'))
      expect(res.status).toBe(401)
    })

    it('returns the user shape when a valid session cookie is present', async () => {
      const userId = 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa'
      await pool.query(
        `INSERT INTO users (id, email, google_sub, display_name, picture_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'me@test.com', 'sub-me-1', 'Me Test', 'https://pic'],
      )

      const token = await signSession({
        sub: userId,
        email: 'me@test.com',
        name: 'Me Test',
        picture: 'https://pic',
      })

      const req = new NextRequest('http://localhost:3000/api/auth/me', {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      })
      const res = await meGet(req)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        user: {
          id: string
          email: string
          displayName: string | null
          pictureUrl: string | null
          phoneNumber: string | null
        }
      }
      expect(body.user.id).toBe(userId)
      expect(body.user.email).toBe('me@test.com')
      expect(body.user.displayName).toBe('Me Test')
      expect(body.user.pictureUrl).toBe('https://pic')
      expect(body.user.phoneNumber).toBeNull()
    })
  })

  describe('POST /api/auth/google/disconnect', () => {
    it('revokes at Google, nulls the Google columns, and clears the cookie', async () => {
      const userId = 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb'
      await pool.query(
        `INSERT INTO users (id, email, google_sub, google_refresh_token, google_access_token,
                            google_access_token_expires_at, display_name, picture_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          'dc@test.com',
          'sub-dc',
          '1//LIVE',
          'ya29.LIVE',
          new Date().toISOString(),
          'DC',
          null,
        ],
      )
      const token = await signSession({
        sub: userId,
        email: 'dc@test.com',
        name: 'DC',
        picture: null,
      })

      let revokeCalled = false
      server.use(
        http.post('https://oauth2.googleapis.com/revoke', async ({ request }) => {
          revokeCalled = true
          const body = await request.clone().text()
          expect(body).toContain('token=1%2F%2FLIVE')
          return new HttpResponse(null, { status: 200 })
        }),
      )

      const req = new NextRequest('http://localhost:3000/api/auth/google/disconnect', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      })
      const res = await disconnectPost(req)
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe('http://localhost:3000/')
      expect(revokeCalled).toBe(true)

      const cookie = res.headers.get('set-cookie')!
      expect(cookie).toContain('Max-Age=0')

      const { rows } = await pool.query<{
        google_sub: string | null
        google_refresh_token: string | null
      }>('SELECT google_sub, google_refresh_token FROM users WHERE id=$1', [userId])
      expect(rows[0]!.google_sub).toBeNull()
      expect(rows[0]!.google_refresh_token).toBeNull()
    })

    it('redirects to / and clears the cookie when the caller has no session', async () => {
      const res = await disconnectPost(
        new NextRequest('http://localhost:3000/api/auth/google/disconnect', { method: 'POST' }),
      )
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe('http://localhost:3000/')
      expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    })
  })
})
