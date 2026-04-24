import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getUserById } from '@/lib/users'
import { getNotionToken } from '@/lib/notion-users'

export const dynamic = 'force-dynamic'

const NOTION_ERROR_COPY: Record<string, string> = {
  access_denied: 'You cancelled the Notion connect flow.',
  code_missing: 'Notion did not return an authorization code.',
  code_exchange_failed: 'Notion rejected the authorization code. Try again.',
  state_missing: 'This connect link expired. Start again.',
  session_mismatch: 'The Notion grant was for a different signed-in user.',
  db_unavailable: 'Could not save the Notion token. Try again in a moment.',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { notionConnected?: string; notionError?: string; onboarded?: string }
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
  if (!user.phone_number_e164) redirect('/onboarding')

  const notionToken = await getNotionToken(user.id)
  const notionConnected = Boolean(notionToken)
  const notionError = searchParams?.notionError ?? null
  const justConnected = searchParams?.notionConnected === '1'
  const justOnboarded = searchParams?.onboarded === '1'

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">PreCall</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Dashboard</h1>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          {user.picture_url ? (
            <img
              src={user.picture_url}
              alt=""
              className="h-14 w-14 rounded-full border border-slate-200"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-slate-700">
              {(user.display_name ?? user.email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-medium text-slate-900">{user.display_name ?? user.email}</p>
            <p className="text-sm text-slate-600">{user.email}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Google identity</dt>
            <dd className="mt-1 font-mono text-xs">{user.google_sub ?? '(not connected)'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Caller ID</dt>
            <dd className="mt-1 font-mono text-xs">{user.phone_number_e164}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Calendar access</dt>
            <dd className="mt-1">{user.google_access_token ? 'Connected' : 'Not connected'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Notion</dt>
            <dd className="mt-1">{notionConnected ? 'Connected' : 'Not connected'}</dd>
          </div>
        </div>

        {justOnboarded ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Phone access is connected. Calls from {user.phone_number_e164} will resolve to this
            account.
          </div>
        ) : null}
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Notion workspace</h2>
            <p className="mt-1 text-sm text-slate-600">
              PreCall reads pages and calendar databases you share with it. You pick exactly which
              pages on Notion&rsquo;s consent screen.
            </p>
          </div>
          {notionConnected ? (
            <form action="/api/auth/notion/disconnect" method="post">
              <button
                type="submit"
                className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Disconnect Notion
              </button>
            </form>
          ) : (
            <a
              href="/api/auth/notion/start"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Connect Notion
            </a>
          )}
        </div>

        {justConnected && !notionError ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Notion is connected. Reopen{' '}
            <span className="font-mono">Settings &rarr; Connections</span> in Notion to add or
            remove shared pages later.
          </div>
        ) : null}

        {notionError ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>
              {NOTION_ERROR_COPY[notionError] ?? `Notion connect failed (code: ${notionError}).`}
            </p>
            <p className="mt-1">
              <a href="/api/auth/notion/start" className="underline hover:text-amber-950">
                Try again
              </a>
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/calendar"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          View calendar
        </Link>
        <form action="/api/auth/google/disconnect" method="post">
          <button
            type="submit"
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            Disconnect Google
          </button>
        </form>
      </section>
    </main>
  )
}
