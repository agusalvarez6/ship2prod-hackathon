import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ensureAccessToken } from "@/lib/oauth";
import { setEventDescription } from "@/lib/calendar";
import { TransientError, UserInputError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SetDescriptionBody = z.object({
  description: z.string().max(8_192),
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (!userId) return new NextResponse(null, { status: 401 });

  const eventId = params.id;
  if (!eventId) {
    return NextResponse.json({ code: "VALIDATION", message: "Missing event id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ code: "VALIDATION", message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SetDescriptionBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION", message: "Invalid payload", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const accessToken = await ensureAccessToken(userId);
    const event = await setEventDescription(accessToken, eventId, parsed.data.description);
    return NextResponse.json({ event });
  } catch (err) {
    if (err instanceof UserInputError) {
      return NextResponse.json({ code: "USER_INPUT", message: err.message }, { status: 422 });
    }
    if (err instanceof TransientError) {
      return NextResponse.json(
        { code: "UPSTREAM", message: "Google is unavailable" },
        { status: 424 },
      );
    }
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("calendar [id] route error", msg);
    return NextResponse.json({ code: "INTERNAL", message: "Internal error" }, { status: 500 });
  }
}
