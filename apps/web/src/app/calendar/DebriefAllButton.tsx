"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UpcomingEvent } from "@/lib/calendar";

interface Props {
  events: UpcomingEvent[];
  windowHours: number;
}

export function DebriefAllButton({ events, windowHours }: Props): JSX.Element | null {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const now = Date.now();
  const cutoff = now + windowHours * 60 * 60 * 1000;
  const inWindow = events.filter((e) => {
    if (!e.startsAt) return false;
    const t = new Date(e.startsAt).getTime();
    return t >= now && t <= cutoff;
  });

  if (inWindow.length === 0) return null;

  async function onClick(): Promise<void> {
    if (running) return;
    setRunning(true);
    setMessage(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(
      inWindow.map(async (event) => {
        try {
          const res = await fetch("/api/briefings/ensure", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              calendarEventId: event.id,
              title: event.title,
              startsAt: event.startsAt,
              attendees: event.attendees,
              description: event.description,
            }),
          });
          if (res.ok) ok++;
          else failed++;
        } catch {
          failed++;
        }
      }),
    );
    setMessage(failed > 0 ? `Queued ${ok} of ${inWindow.length}. ${failed} failed.` : `Queued ${ok}.`);
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-ink-600">{message}</span> : null}
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={running}
        className="rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:bg-ink-100 disabled:text-ink-400"
      >
        {running ? "Queuing…" : `Prepare next ${windowHours}h (${inWindow.length})`}
      </button>
    </div>
  );
}
