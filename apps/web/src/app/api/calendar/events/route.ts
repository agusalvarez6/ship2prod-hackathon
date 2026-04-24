import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ensureAccessToken } from "@/lib/oauth";
import { createEvent, listUpcomingEvents } from "@/lib/calendar";
import { TransientError, UserInputError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateEventBody = z.object({
  title: z.string().min(1).max(500),
  startsAt: z.string().min(1),
  durationMinutes: z.number().int().positive().max(24 * 60),
  timeZone: z.string().min(1).default("America/Los_Angeles"),
});

async function requireUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const session = await verifySession(token);
    return session.sub;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (!userId) return new NextResponse(null, { status: 401 });

  try {
    const accessToken = await ensureAccessToken(userId);
    const events = await listUpcomingEvents(accessToken, 20);
    return NextResponse.json({ events });
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (!userId) return new NextResponse(null, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ code: "VALIDATION", message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateEventBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION", message: "Invalid event payload", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const accessToken = await ensureAccessToken(userId);
    const event = await createEvent(accessToken, parsed.data);
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}

function mapError(err: unknown): NextResponse {
  if (err instanceof UserInputError) {
    return NextResponse.json({ code: "USER_INPUT", message: err.message }, { status: 422 });
  }
  if (err instanceof TransientError) {
    return NextResponse.json({ code: "UPSTREAM", message: "Google is unavailable" }, { status: 424 });
  }
  const msg = err instanceof Error ? err.message : "unknown";
  console.error("calendar route error", msg);
  return NextResponse.json({ code: "INTERNAL", message: "Internal error" }, { status: 500 });
}
