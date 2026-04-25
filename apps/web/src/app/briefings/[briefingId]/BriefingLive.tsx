"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BriefingDetail, BriefingStatus } from "@/lib/briefings";

const ACTIVE_STATUSES: readonly BriefingStatus[] = ["pending", "researching", "drafting"];

const STATUS_LABELS: Record<BriefingStatus, string> = {
  pending: "Preparing",
  researching: "Researching",
  drafting: "Writing",
  ready: "Ready",
  failed: "Failed",
};

export function BriefingLive({ initial }: { initial: BriefingDetail }): JSX.Element {
  const router = useRouter();
  const [briefing, setBriefing] = useState<BriefingDetail>(initial);
  const [elapsed, setElapsed] = useState(0);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(briefing.status)) return;
    const started = Date.now();
    let cancelled = false;

    async function tick(): Promise<void> {
      try {
        const res = await fetch("/api/graph", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: `query($b: ID!) {
              getBriefing(id: $b) {
                id userId meetingId status
                contactName contactEmail contactRole
                companyName companyDomain companySummary
                summary60s sections sourcesCount errorMessage
                researchStartedAt researchFinishedAt createdAt updatedAt
              }
            }`,
            variables: { b: briefing.id },
          }),
        });
        const payload = (await res.json()) as { data?: { getBriefing: BriefingDetail | null } };
        if (cancelled) return;
        if (payload.data?.getBriefing) setBriefing(payload.data.getBriefing);
        setElapsed(Math.floor((Date.now() - started) / 1000));
      } catch {
        // transient: keep the last known state
      }
    }

    const interval = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [briefing.id, briefing.status]);

  async function onRerun(): Promise<void> {
    if (rerunning) return;
    setRerunning(true);
    setRerunError(null);
    try {
      const res = await fetch(`/api/briefings/${briefing.id}/rerun`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRerunError(body?.error ?? `Request failed (${res.status}).`);
        return;
      }
      const data = (await res.json()) as { id: string };
      router.push(`/briefings/${data.id}`);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRerunning(false);
    }
  }

  const title = briefing.contactName ?? briefing.companyName ?? "Briefing";
  const subtitle = [briefing.contactRole, briefing.companyName].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-5">
        <div className="min-w-0">
          <Link
            href="/calendar"
            className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-700 transition-colors hover:text-accent-600"
          >
            ← Calendar
          </Link>
          <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-ink-950">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-600">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={briefing.status} elapsed={elapsed} />
          {briefing.status === "ready" || briefing.status === "failed" ? (
            <button
              type="button"
              onClick={() => void onRerun()}
              disabled={rerunning}
              title="Throw out this briefing and research again."
              className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 disabled:bg-ink-100 disabled:text-ink-400"
            >
              {rerunning ? "Re-running…" : "Re-run"}
            </button>
          ) : null}
        </div>
      </header>

      {rerunError ? (
        <p className="mt-4 text-sm text-danger-700">Re-run failed: {rerunError}</p>
      ) : null}

      {ACTIVE_STATUSES.includes(briefing.status) ? (
        <div className="mt-8 rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm text-warning-900">
          <p className="font-medium">Researching this meeting.</p>
          <p className="mt-1 text-warning-900/80">
            Usually completes in 10 to 20 seconds. {elapsed > 0 ? `${elapsed}s elapsed.` : ""}
          </p>
        </div>
      ) : null}

      {briefing.status === "failed" ? (
        <div className="mt-8 rounded-2xl border border-danger-200 bg-danger-50 px-5 py-4 text-sm text-danger-900">
          <p className="font-medium">Research failed.</p>
          {briefing.errorMessage ? (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-danger-900/80">
              {briefing.errorMessage}
            </pre>
          ) : null}
          <p className="mt-2">Click Re-run to try again.</p>
        </div>
      ) : null}

      {briefing.status === "ready" && briefing.sections ? (
        <BriefingSections sections={briefing.sections} />
      ) : null}
    </main>
  );
}

function StatusPill({
  status,
  elapsed,
}: {
  status: BriefingStatus;
  elapsed: number;
}): JSX.Element {
  const styles: Record<BriefingStatus, string> = {
    pending: "bg-warning-50 text-warning-900 border-warning-200",
    researching: "bg-warning-50 text-warning-900 border-warning-200",
    drafting: "bg-warning-50 text-warning-900 border-warning-200",
    ready: "bg-success-50 text-success-900 border-success-200",
    failed: "bg-danger-50 text-danger-900 border-danger-200",
  };
  const label = ACTIVE_STATUSES.includes(status) && elapsed > 0
    ? `${STATUS_LABELS[status]} · ${elapsed}s`
    : STATUS_LABELS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      {label}
    </span>
  );
}

interface Sections {
  summary60s?: unknown;
  whoYouAreMeeting?: { name?: string; role?: string; company?: string };
  companyContext?: { whatTheyDo?: string; recentUpdates?: string[] };
  internalContext?: { notionExcerpts?: Array<{ pageTitle?: string; excerpt?: string }> };
  bestConversationAngle?: string;
  suggestedOpeningLine?: string;
  questionsToAsk?: string[];
  likelyPainPoints?: string[];
  risks?: string[];
  followUpEmail?: string;
  citedSources?: Array<{ id?: string; title?: string; url?: string; kind?: string }>;
}

function BriefingSections({ sections }: { sections: Record<string, unknown> }): JSX.Element {
  const s = sections as Sections;
  const summary = typeof s.summary60s === "string" ? s.summary60s : null;
  return (
    <div className="mt-8 flex flex-col gap-5">
      {summary ? (
        <Card title="Summary" variant="accent">
          <p className="text-base leading-relaxed text-ink-900">{summary}</p>
        </Card>
      ) : null}

      {s.whoYouAreMeeting ? (
        <Card title="Who you're meeting">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm text-ink-800">
            {s.whoYouAreMeeting.name ? (
              <>
                <dt className="text-ink-500">Name</dt>
                <dd>{s.whoYouAreMeeting.name}</dd>
              </>
            ) : null}
            {s.whoYouAreMeeting.role ? (
              <>
                <dt className="text-ink-500">Role</dt>
                <dd>{s.whoYouAreMeeting.role}</dd>
              </>
            ) : null}
            {s.whoYouAreMeeting.company ? (
              <>
                <dt className="text-ink-500">Company</dt>
                <dd>{s.whoYouAreMeeting.company}</dd>
              </>
            ) : null}
          </dl>
        </Card>
      ) : null}

      {s.companyContext ? (
        <Card title="Company context">
          {s.companyContext.whatTheyDo ? (
            <p className="text-sm leading-relaxed text-ink-800">{s.companyContext.whatTheyDo}</p>
          ) : null}
          {s.companyContext.recentUpdates && s.companyContext.recentUpdates.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Recent updates
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-800">
                {s.companyContext.recentUpdates.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {s.bestConversationAngle ? (
        <Card title="Best conversation angle">
          <p className="text-sm leading-relaxed text-ink-800">{s.bestConversationAngle}</p>
        </Card>
      ) : null}

      {s.suggestedOpeningLine ? (
        <Card title="Suggested opening line">
          <blockquote className="border-l-2 border-accent-500 pl-4 text-sm italic leading-relaxed text-ink-800">
            “{s.suggestedOpeningLine}”
          </blockquote>
        </Card>
      ) : null}

      {s.questionsToAsk && s.questionsToAsk.length > 0 ? (
        <Card title="Questions to ask">
          <ol className="flex flex-col gap-2 text-sm text-ink-800">
            {s.questionsToAsk.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-medium text-accent-700">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {s.likelyPainPoints && s.likelyPainPoints.length > 0 ? (
        <Card title="Likely pain points">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-800">
            {s.likelyPainPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.risks && s.risks.length > 0 ? (
        <Card title="Risks">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-800">
            {s.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.internalContext?.notionExcerpts && s.internalContext.notionExcerpts.length > 0 ? (
        <Card title="From your workspace context">
          <ul className="flex flex-col gap-2">
            {s.internalContext.notionExcerpts.map((n, i) => (
              <li key={i} className="rounded-lg border border-ink-200 bg-ink-50 p-3">
                {n.pageTitle ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {n.pageTitle}
                  </p>
                ) : null}
                {n.excerpt ? <p className="mt-1 text-sm text-ink-800">{n.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.followUpEmail ? (
        <Card title="Draft follow-up email">
          <details className="text-sm text-ink-800">
            <summary className="cursor-pointer text-ink-700 transition-colors hover:text-accent-700">
              Show draft
            </summary>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed">{s.followUpEmail}</p>
          </details>
        </Card>
      ) : null}

      {s.citedSources && s.citedSources.length > 0 ? (
        <Card title="Sources">
          <ul className="flex flex-col gap-1 text-sm">
            {s.citedSources.map((src, i) => (
              <li key={src.id ?? i} className="flex items-baseline gap-2">
                {src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-ink-800 underline decoration-ink-300 transition-colors hover:text-accent-700"
                  >
                    {src.title ?? src.url}
                  </a>
                ) : (
                  <span className="text-ink-800">{src.title ?? "untitled"}</span>
                )}
                {src.kind ? <span className="text-[11px] text-ink-500">{src.kind}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Card({
  title,
  children,
  variant,
}: {
  title: string;
  children: React.ReactNode;
  variant?: "accent";
}): JSX.Element {
  return (
    <section
      className={
        variant === "accent"
          ? "rounded-2xl border border-accent-200 bg-accent-50/40 p-5 shadow-sm"
          : "rounded-2xl border border-ink-200 bg-paper p-5 shadow-sm"
      }
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
