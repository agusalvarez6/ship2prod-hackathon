import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ensureBriefingForEvent } from "@/lib/briefings";

interface EnsureRequest {
  calendarEventId: string;
  title: string;
  startsAt: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  description?: string | null;
  force?: boolean;
}

export async function POST(req: Request): Promise<NextResponse> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const session = await verifySession(token).catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as EnsureRequest | null;
  if (!body?.calendarEventId || !body?.title || !body?.startsAt) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const briefing = await ensureBriefingForEvent({
    userId: session.sub,
    userEmail: session.email ?? null,
    calendarEventId: body.calendarEventId,
    title: body.title,
    startsAt: body.startsAt,
    attendees: body.attendees ?? [],
    description: body.description ?? null,
    force: body.force === true,
  });

  return NextResponse.json(briefing, { status: 200 });
}
