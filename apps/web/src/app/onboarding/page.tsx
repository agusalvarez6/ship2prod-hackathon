import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getUserById } from '@/lib/users'

export const dynamic = 'force-dynamic'

const PHONE_ERROR_COPY: Record<string, string> = {
  invalid: 'Enter a valid US phone number or E.164 number.',
  taken: 'That phone number is already connected to another PreCallBot account.',
  db: 'Could not save your phone number. Try again in a moment.',
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: { phoneError?: string }
}): Promise<JSX.Element> {
  const cookieStore = cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) redirect('/')

  let session
  try {
    session = await verifySession(token)
  } catch {
    redirect('/')
  }

  const user = await getUserById(session.sub)
  if (!user) redirect('/')
  if (user.phone_number_e164) redirect('/dashboard')

  const errorTag = searchParams?.phoneError ?? null

  return (
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl items-center px-4 py-10">
      <section className="grid w-full items-center gap-8 lg:grid-cols-[1fr_420px]">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-700">
            PreCallBot voice access
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.04] tracking-tight text-ink-950 sm:text-6xl">
            Connect the number you will call from.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-ink-700">
            PreCallBot uses caller ID to find your calendar, briefings, and next meeting when you dial
            the Vapi agent.
          </p>
          <p className="mt-4 max-w-xl text-sm leading-6 text-ink-500">
            Use the mobile number that will appear on inbound calls. Unknown caller IDs will not
            receive meeting details.
          </p>
        </div>

        <section className="rounded-2xl border border-ink-200 bg-paper p-6 shadow-[0_1px_2px_oklch(0.205_0.012_70_/_0.04),0_12px_32px_-16px_oklch(0.205_0.012_70_/_0.18)]">
          <div className="flex items-center gap-3 border-b border-ink-200 pb-5">
            {user.picture_url ? (
              <img
                src={user.picture_url}
                alt=""
                className="h-11 w-11 rounded-full border border-ink-200"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-200 text-sm font-semibold text-ink-700">
                {(user.display_name ?? user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-950">
                {user.display_name ?? user.email}
              </p>
              <p className="truncate text-xs text-ink-500">{user.email}</p>
            </div>
          </div>

          <form action="/api/onboarding/phone" method="post" className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-ink-900">Phone number</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                placeholder="(415) 555-2671"
                className="mt-2 block w-full rounded-md border border-ink-300 bg-paper px-3 py-3 text-base text-ink-950 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15"
              />
            </label>

            {errorTag ? (
              <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-900">
                {PHONE_ERROR_COPY[errorTag] ?? 'Could not save that phone number.'}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-md bg-accent-600 px-4 py-3 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700"
            >
              Continue
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}
