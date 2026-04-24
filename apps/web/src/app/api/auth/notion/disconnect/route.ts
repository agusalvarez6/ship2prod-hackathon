import { NextResponse, type NextRequest } from "next/server";
import { clearNotionToken } from "@/lib/notion-users";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return new NextResponse(null, { status: 401 });

  let session;
  try {
    session = await verifySession(token);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  // Notion offers no server-side revoke; local teardown is authoritative.
  await clearNotionToken(session.sub);
  return new NextResponse(null, { status: 204 });
}
