import { NextResponse, type NextRequest } from "next/server";
import { buildNotionAuthUrl, mintNotionState } from "@/lib/notion-oauth";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return new NextResponse("not_authenticated", { status: 401 });

  let session;
  try {
    session = await verifySession(token);
  } catch {
    return new NextResponse("session_invalid", { status: 401 });
  }

  try {
    const nonce = await mintNotionState(session.sub);
    const url = buildNotionAuthUrl(nonce);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error(
      "notion start: failed to mint state",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse("notion_oauth_start_failed", { status: 503 });
  }
}
