import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { getNotionToken } from "@/lib/notion-users";

export const dynamic = "force-dynamic";

function StatusPill({ connected }: { connected: boolean }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      <span
        aria-hidden
        className={
          connected
            ? "h-2 w-2 rounded-full bg-success-600 ring-4 ring-success-600/15"
            : "h-2 w-2 rounded-full bg-ink-300 ring-4 ring-ink-300/25"
        }
      />
      <span className={connected ? "text-success-700" : "text-ink-500"}>
        {connected ? "Connected" : "Not connected"}
      </span>
    </span>
  );
}

function ConnectionCard({
  title,
  description,
  connected,
  primary,
  disconnect,
  alert,
}: {
  title: string;
  description: string;
  connected: boolean;
  primary?: ReactNode;
  disconnect?: ReactNode;
  alert?: ReactNode;
}): JSX.Element {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-ink-200 bg-paper p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-medium text-ink-900">{title}</h3>
        <StatusPill connected={connected} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{description}</p>
      {alert ? <div className="mt-4">{alert}</div> : null}
      {primary || disconnect ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {primary}
          {disconnect}
        </div>
      ) : null}
    </section>
  );
}

const NOTION_ERROR_COPY: Record<string, string> = {
  access_denied: "You cancelled the Notion connect flow.",
  code_missing: "Notion did not return an authorization code.",
  code_exchange_failed: "Notion rejected the authorization code. Try again.",
  state_missing: "This connect link expired. Start again.",
  session_mismatch: "The Notion grant was for a different signed-in user.",
  db_unavailable: "Could not save the Notion token. Try again in a moment.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { notionConnected?: string; notionError?: string; onboarded?: string };
}): Promise<JSX.Element> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  let session;
  try {
    session = await verifySession(token);
  } catch {
    redirect("/");
  }

  const user = await getUserById(session.sub);
  if (!user) redirect("/");
  if (!user.phone_number_e164) redirect("/onboarding");

  const notionToken = await getNotionToken(user.id);
  const notionConnected = Boolean(notionToken);
  const notionError = searchParams?.notionError ?? null;
  const justConnected = searchParams?.notionConnected === "1";
  const justOnboarded = searchParams?.onboarded === "1";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="flex items-end justify-between border-b border-ink-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-700">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Dashboard</h1>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10 rounded-2xl border border-ink-200 bg-paper p-6 shadow-sm">
        <div className="flex items-center gap-4">
          {user.picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.picture_url}
              alt=""
              className="h-14 w-14 rounded-full border border-ink-200"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-200 text-ink-700">
              {(user.display_name ?? user.email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-medium text-ink-900">
              {user.display_name ?? user.email}
            </p>
            <p className="text-sm text-ink-600">{user.email}</p>
            <p className="mt-1 font-mono text-xs text-ink-500">{user.phone_number_e164}</p>
          </div>
        </div>

        {justOnboarded ? (
          <div className="mt-5 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-900">
            Phone access is connected. Calls from{" "}
            <span className="font-mono">{user.phone_number_e164}</span> will resolve to this
            account.
          </div>
        ) : null}
      </section>

      <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-500">
        Connections
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConnectionCard
          title="Google Calendar"
          description="PreCall reads your primary calendar so it can surface upcoming meetings and pre-brief each one."
          connected={Boolean(user.google_access_token)}
          primary={
            <Link
              href="/calendar"
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700"
            >
              View calendar
            </Link>
          }
          disconnect={
            user.google_access_token ? (
              <form action="/api/auth/google/disconnect" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-ink-300 bg-paper px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                >
                  Disconnect Google
                </button>
              </form>
            ) : null
          }
        />

        <ConnectionCard
          title="Notion workspace"
          description="PreCall reads pages and calendar databases you share with it. You pick exactly which pages on Notion's consent screen."
          connected={notionConnected}
          primary={
            notionConnected ? null : (
              <a
                href="/api/auth/notion/start"
                className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700"
              >
                Connect Notion
              </a>
            )
          }
          disconnect={
            notionConnected ? (
              <form action="/api/auth/notion/disconnect" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-ink-300 bg-paper px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                >
                  Disconnect Notion
                </button>
              </form>
            ) : null
          }
          alert={
            justConnected && !notionError ? (
              <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-900">
                Notion is connected. Reopen <span className="font-mono">Settings &rarr; Connections</span> in Notion
                to add or remove shared pages later.
              </div>
            ) : notionError ? (
              <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
                <p>
                  {NOTION_ERROR_COPY[notionError] ??
                    `Notion connect failed (code: ${notionError}).`}
                </p>
                <p className="mt-1">
                  <a href="/api/auth/notion/start" className="text-accent-700 underline hover:text-accent-600">
                    Try again
                  </a>
                </p>
              </div>
            ) : null
          }
        />
      </div>
    </main>
  );
}
