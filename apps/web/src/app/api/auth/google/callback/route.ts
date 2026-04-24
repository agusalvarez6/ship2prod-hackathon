import { NextResponse, type NextRequest } from 'next/server'
import { consumeState, decodeIdToken, exchangeCode, hasCalendarScope } from '@/lib/oauth'
import { upsertUserByGoogleSub } from '@/lib/users'
import { buildSessionCookie, signSession } from '@/lib/session'
import { getEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCESS_TOKEN_SAFETY_MARGIN_MS = 60_000

function oauthErrorRedirect(appUrl: string, tag: string): NextResponse {
  return NextResponse.redirect(`${appUrl}/?oauthError=${encodeURIComponent(tag)}`, 302)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const env = getEnv()
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!state) {
    return new NextResponse('state_missing', { status: 400 })
  }

  const storedState = await consumeState(state)
  if (!storedState) {
    return new NextResponse('state_missing', { status: 400 })
  }

  if (!code) {
    return oauthErrorRedirect(env.APP_URL, 'code_missing')
  }

  let tokens
  try {
    tokens = await exchangeCode(code, env)
  } catch (err) {
    console.error('callback: code exchange failed', err instanceof Error ? err.message : err)
    return oauthErrorRedirect(env.APP_URL, 'code_exchange_failed')
  }

  if (!hasCalendarScope(tokens.scope)) {
    return oauthErrorRedirect(env.APP_URL, 'calendar_scope_missing')
  }

  let claims
  try {
    if (!tokens.id_token) throw new Error('id_token missing from token response')
    claims = decodeIdToken(tokens.id_token)
  } catch (err) {
    console.error('callback: id_token decode failed', err instanceof Error ? err.message : err)
    return oauthErrorRedirect(env.APP_URL, 'id_token_invalid')
  }

  if (claims.email_verified === false) {
    return oauthErrorRedirect(env.APP_URL, 'email_not_verified')
  }

  const expiresInSec = tokens.expires_in ?? 3600
  const expiresAt = new Date(Date.now() + expiresInSec * 1000 - ACCESS_TOKEN_SAFETY_MARGIN_MS)

  let user
  try {
    user = await upsertUserByGoogleSub({
      googleSub: claims.sub,
      email: claims.email,
      displayName: claims.name ?? null,
      pictureUrl: claims.picture ?? null,
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: expiresAt,
    })
  } catch (err) {
    console.error('callback: users upsert failed', err instanceof Error ? err.message : err)
    return oauthErrorRedirect(env.APP_URL, 'db_unavailable')
  }

  const jwt = await signSession({
    sub: user.id,
    email: user.email,
    name: user.display_name,
    picture: user.picture_url,
  })

  const nextPath = user.phone_number_e164 ? '/dashboard' : '/onboarding'
  const res = NextResponse.redirect(`${env.APP_URL}${nextPath}`, 302)
  res.headers.set('set-cookie', buildSessionCookie(jwt))
  return res
}
