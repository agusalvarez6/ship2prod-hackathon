import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getUserById } from '@/lib/users'

export const dynamic = 'force-dynamic'

const PHONE_ERROR_COPY: Record<string, string> = {
  invalid: 'Enter a valid US phone number or E.164 number.',
  taken: 'That phone number is already connected to another PreCall account.',
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
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-10 text-stone-950">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            PreCall voice access
          </p>
          <h1 className="mt-4 max-w-2xl text-5xl font-semibold leading-[1.02] text-stone-950 sm:text-6xl">
            Connect the number you will call from.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-stone-600">
            PreCall uses caller ID to find your calendar, briefings, and next meeting when you dial
            the Vapi agent.
          </p>
        </div>

        <section className="rounded-lg border border-stone-300 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-stone-200 pb-5">
            {user.picture_url ? (
              <img
                src={user.picture_url}
                alt=""
                className="h-11 w-11 rounded-full border border-stone-200"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700">
                {(user.display_name ?? user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-950">
                {user.display_name ?? user.email}
              </p>
              <p className="truncate text-xs text-stone-500">{user.email}</p>
            </div>
          </div>

          <form action="/api/onboarding/phone" method="post" className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-stone-900">Phone number</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                placeholder="(415) 555-2671"
                className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-3 text-base text-stone-950 outline-none transition focus:border-stone-950 focus:ring-2 focus:ring-stone-950/10"
              />
            </label>

            {errorTag ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {PHONE_ERROR_COPY[errorTag] ?? 'Could not save that phone number.'}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-md bg-stone-950 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800"
            >
              Continue
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}
