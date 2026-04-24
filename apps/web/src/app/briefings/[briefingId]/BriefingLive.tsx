"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BriefingDetail, BriefingStatus } from "@/lib/briefings";

const ACTIVE_STATUSES: readonly BriefingStatus[] = ["pending", "researching", "drafting"];

export function BriefingLive({ initial }: { initial: BriefingDetail }): JSX.Element {
  const [briefing, setBriefing] = useState<BriefingDetail>(initial);
  const [elapsed, setElapsed] = useState(0);

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
        /* keep last known briefing on transient failures */
      }
    }

    const interval = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [briefing.id, briefing.status]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/calendar" className="text-sm text-slate-600 hover:underline">
          ← Calendar
        </Link>
        <StatusStrip status={briefing.status} elapsed={elapsed} error={briefing.errorMessage} />
      </header>

      <h1 className="text-3xl font-semibold text-slate-900">
        {briefing.contactName ?? briefing.companyName ?? "Briefing"}
      </h1>
      {briefing.contactRole && briefing.companyName ? (
        <p className="mt-1 text-sm text-slate-600">
          {briefing.contactRole} · {briefing.companyName}
        </p>
      ) : null}

      {ACTIVE_STATUSES.includes(briefing.status) ? (
        <div className="mt-8 rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-sm text-yellow-900">
          Researching this meeting. Usually completes in 10 to 20 seconds.
        </div>
      ) : null}

      {briefing.status === "failed" ? (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <p className="font-medium">Research failed.</p>
          {briefing.errorMessage ? (
            <p className="mt-2 font-mono text-xs">{briefing.errorMessage}</p>
          ) : null}
        </div>
      ) : null}

      {briefing.status === "ready" && briefing.sections ? (
        <BriefingSections sections={briefing.sections} />
      ) : null}
    </main>
  );
}

function StatusStrip({
  status,
  elapsed,
  error,
}: {
  status: BriefingStatus;
  elapsed: number;
  error: string | null;
}): JSX.Element {
  const styles: Record<BriefingStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    researching: "bg-yellow-100 text-yellow-800",
    drafting: "bg-yellow-100 text-yellow-800",
    ready: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
  };
  const label =
    status === "failed" && error
      ? `failed: ${error.slice(0, 60)}`
      : ACTIVE_STATUSES.includes(status)
        ? `${status} (${elapsed}s)`
        : status;
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${styles[status]}`}>{label}</span>
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
    <div className="mt-8 flex flex-col gap-6">
      {summary ? (
        <Card title="Summary">
          <p className="text-sm leading-relaxed text-slate-800">{summary}</p>
        </Card>
      ) : null}

      {s.whoYouAreMeeting ? (
        <Card title="Who you are meeting">
          <ul className="text-sm text-slate-800">
            {s.whoYouAreMeeting.name ? <li>Name: {s.whoYouAreMeeting.name}</li> : null}
            {s.whoYouAreMeeting.role ? <li>Role: {s.whoYouAreMeeting.role}</li> : null}
            {s.whoYouAreMeeting.company ? <li>Company: {s.whoYouAreMeeting.company}</li> : null}
          </ul>
        </Card>
      ) : null}

      {s.companyContext ? (
        <Card title="Company context">
          {s.companyContext.whatTheyDo ? (
            <p className="text-sm leading-relaxed text-slate-800">{s.companyContext.whatTheyDo}</p>
          ) : null}
          {s.companyContext.recentUpdates && s.companyContext.recentUpdates.length > 0 ? (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recent updates
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-800">
                {s.companyContext.recentUpdates.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {s.bestConversationAngle ? (
        <Card title="Best conversation angle">
          <p className="text-sm leading-relaxed text-slate-800">{s.bestConversationAngle}</p>
        </Card>
      ) : null}

      {s.suggestedOpeningLine ? (
        <Card title="Suggested opening line">
          <p className="text-sm italic leading-relaxed text-slate-800">
            “{s.suggestedOpeningLine}”
          </p>
        </Card>
      ) : null}

      {s.questionsToAsk && s.questionsToAsk.length > 0 ? (
        <Card title="Questions to ask">
          <ol className="list-decimal pl-5 text-sm text-slate-800">
            {s.questionsToAsk.map((q, i) => (
              <li key={i} className="mb-1">
                {q}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {s.likelyPainPoints && s.likelyPainPoints.length > 0 ? (
        <Card title="Likely pain points">
          <ul className="list-disc pl-5 text-sm text-slate-800">
            {s.likelyPainPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.risks && s.risks.length > 0 ? (
        <Card title="Risks">
          <ul className="list-disc pl-5 text-sm text-slate-800">
            {s.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.internalContext?.notionExcerpts && s.internalContext.notionExcerpts.length > 0 ? (
        <Card title="From your Notion">
          <ul className="flex flex-col gap-3">
            {s.internalContext.notionExcerpts.map((n, i) => (
              <li key={i} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                {n.pageTitle ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {n.pageTitle}
                  </p>
                ) : null}
                {n.excerpt ? <p className="mt-1 text-slate-800">{n.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {s.followUpEmail ? (
        <Card title="Draft follow-up email">
          <details>
            <summary className="cursor-pointer text-sm text-slate-700">Show draft</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {s.followUpEmail}
            </p>
          </details>
        </Card>
      ) : null}

      {s.citedSources && s.citedSources.length > 0 ? (
        <Card title="Sources">
          <ul className="flex flex-col gap-1 text-sm">
            {s.citedSources.map((src, i) => (
              <li key={src.id ?? i}>
                {src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-700 underline hover:text-slate-900"
                  >
                    {src.title ?? src.url}
                  </a>
                ) : (
                  <span className="text-slate-700">{src.title ?? "untitled"}</span>
                )}
                {src.kind ? (
                  <span className="ml-2 text-xs text-slate-500">({src.kind})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
