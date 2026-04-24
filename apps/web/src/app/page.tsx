import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getUserById } from '@/lib/users'

export const dynamic = 'force-dynamic'

export default async function LandingPage({
  searchParams,
}: {
  searchParams?: { oauthError?: string }
}): Promise<JSX.Element> {
  const cookieStore = cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    let session = null
    try {
      session = await verifySession(token)
    } catch {
      // Fall through to the landing page if the cookie is stale or tampered.
    }
    if (session) {
      const user = await getUserById(session.sub)
      if (user?.phone_number_e164) redirect('/dashboard')
      if (user) redirect('/onboarding')
    }
  }

  const errorTag = searchParams?.oauthError ?? null

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">PreCall</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight text-slate-900">
          Walk into every meeting prepared.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Voice-first meeting prep. PreCall pulls the public record on your contact, drafts a
          briefing, and answers your questions on the call.
        </p>

        {errorTag ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Google sign-in did not complete. Code: <span className="font-mono">{errorTag}</span>
          </div>
        ) : null}

        <a
          href="/api/auth/google/start"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-base font-medium text-white shadow-sm hover:bg-slate-800"
        >
          Sign in with Google
        </a>

        <p className="mt-4 text-xs text-slate-500">
          We request access to your primary calendar so we can show and schedule events. You can
          disconnect anytime.
        </p>
      </section>
    </main>
  )
}
