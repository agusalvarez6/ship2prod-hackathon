"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { UpcomingEvent } from "@/lib/calendar";

export function EventRow({ event }: { event: UpcomingEvent }): JSX.Element {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState(event.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = description !== (event.description ?? "");

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!dirty) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? `request failed (${res.status})`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function onReset(): void {
    setDescription(event.description ?? "");
    setError(null);
    setSavedAt(null);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
          <p className="text-xs text-ink-500">
            {event.startsAt ? new Date(event.startsAt).toLocaleString() : "no start time"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {event.htmlLink ? (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent-700 transition-colors hover:text-accent-600"
            >
              Open in Google
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md border border-ink-300 bg-paper px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
            aria-expanded={expanded}
          >
            {expanded ? "Close" : "Edit description"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="text-sm text-ink-700">
              <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Event description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="No description yet. Add talking points, context, links…"
                className="mt-1 w-full rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm text-ink-900 focus:border-accent-500 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !dirty}
                className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-accent-700 disabled:bg-ink-300 disabled:text-ink-500 disabled:shadow-none"
              >
                {submitting ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={submitting || !dirty}
                className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 disabled:text-ink-400"
              >
                Reset
              </button>
              {savedAt && !dirty ? (
                <span className="text-xs font-medium text-success-700">Saved</span>
              ) : null}
              {error ? (
                <span className="text-xs text-danger-700">Error: {error}</span>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </li>
  );
}
