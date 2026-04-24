"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UpcomingEvent } from "@/lib/calendar";

interface Props {
  events: UpcomingEvent[];
  windowHours: number;
}

export function DebriefAllButton({ events, windowHours }: Props): JSX.Element {
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

  async function onClick(): Promise<void> {
    if (running || inWindow.length === 0) return;
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
    setMessage(
      failed > 0
        ? `Triggered ${ok} of ${inWindow.length}. ${failed} failed.`
        : `Triggered ${ok} briefings.`,
    );
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={running || inWindow.length === 0}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
      >
        {running
          ? "Triggering…"
          : inWindow.length === 0
            ? `No events in next ${windowHours}h`
            : `Debrief next ${windowHours}h (${inWindow.length})`}
      </button>
      {message ? <span className="text-xs text-slate-600">{message}</span> : null}
    </div>
  );
}
