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
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl items-center px-4 py-16">
      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-stretch">
        <section className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-700">
            Pre-meeting briefings
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-ink-950">
            Walk into every meeting prepared.
          </h1>
          <p className="mt-6 max-w-prose text-base leading-relaxed text-ink-700">
            Voice-first meeting prep. PreCallBot pulls the public record on your contact, drafts a
            briefing, and answers your questions on the call.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-ink-700">
            <li className="flex items-start gap-3">
              <span aria-hidden className="mt-2 h-1 w-4 rounded-full bg-accent-500" />
              Reads your calendar and the relevant Notion pages.
            </li>
            <li className="flex items-start gap-3">
              <span aria-hidden className="mt-2 h-1 w-4 rounded-full bg-accent-500" />
              Researches the company and contact in under a minute.
            </li>
            <li className="flex items-start gap-3">
              <span aria-hidden className="mt-2 h-1 w-4 rounded-full bg-accent-500" />
              Answers follow-ups by voice while you walk in.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-paper p-8 shadow-[0_1px_2px_oklch(0.205_0.012_70_/_0.04),0_12px_32px_-16px_oklch(0.205_0.012_70_/_0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-500">
            Sign in
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">
            Connect your calendar to start.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            We read your primary Google Calendar so PreCallBot can show your next meetings. You can
            disconnect anytime.
          </p>

          {errorTag ? (
            <div className="mt-6 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
              Google sign-in did not complete. Code: <span className="font-mono">{errorTag}</span>
            </div>
          ) : null}

          <a
            href="/api/auth/google/start"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-5 py-3 text-base font-medium text-paper shadow-sm transition-colors hover:bg-accent-700"
          >
            Sign in with Google
          </a>

          <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-ink-500">
            Calendar access · disconnect anytime
          </p>
        </section>
      </div>
    </main>
  )
}
