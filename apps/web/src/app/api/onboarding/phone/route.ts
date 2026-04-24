import { normalizePhoneNumberE164 } from '@ship2prod/schema/phone'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { updateUserPhoneNumber } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PhoneForm = z.object({
  phone: z.string().min(1).max(40),
})

async function requireUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const session = await verifySession(token)
    return session.sub
  } catch {
    return null
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req)
  if (!userId) return NextResponse.redirect(new URL('/', req.url), 303)

  let raw: FormData
  try {
    raw = await req.formData()
  } catch {
    return onboardingRedirect(req, 'invalid')
  }

  const parsed = PhoneForm.safeParse({
    phone: raw.get('phone'),
  })
  if (!parsed.success) return onboardingRedirect(req, 'invalid')

  const phoneNumber = normalizePhoneNumberE164(parsed.data.phone)
  if (!phoneNumber) return onboardingRedirect(req, 'invalid')

  try {
    await updateUserPhoneNumber(userId, phoneNumber)
  } catch (err) {
    if (isUniqueViolation(err)) return onboardingRedirect(req, 'taken')
    console.error('onboarding phone update failed', err instanceof Error ? err.message : err)
    return onboardingRedirect(req, 'db')
  }

  return NextResponse.redirect(new URL('/dashboard?onboarded=1', req.url), 303)
}

function onboardingRedirect(req: NextRequest, error: string): NextResponse {
  const url = new URL('/onboarding', req.url)
  url.searchParams.set('phoneError', error)
  return NextResponse.redirect(url, 303)
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505'
}
