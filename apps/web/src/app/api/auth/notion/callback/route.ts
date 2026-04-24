import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { consumeNotionState, exchangeNotionCode } from "@/lib/notion-oauth";
import { saveNotionToken } from "@/lib/notion-users";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notionErrorRedirect(appUrl: string, tag: string): NextResponse {
  return NextResponse.redirect(
    `${appUrl}/dashboard?notionError=${encodeURIComponent(tag)}`,
    302,
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // User cancelled from Notion's consent screen.
  if (errorParam) {
    return notionErrorRedirect(env.APP_URL, errorParam);
  }

  if (!state) {
    return new NextResponse("state_missing", { status: 400 });
  }

  const storedState = await consumeNotionState(state);
  if (!storedState) {
    return new NextResponse("state_missing", { status: 400 });
  }

  // Belt-and-suspenders: cross-check the session against the userId in the
  // state payload. If the user logged out between start and callback, abort.
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return new NextResponse("not_authenticated", { status: 401 });
  }
  let session;
  try {
    session = await verifySession(sessionToken);
  } catch {
    return new NextResponse("session_invalid", { status: 401 });
  }
  if (session.sub !== storedState.userId) {
    return notionErrorRedirect(env.APP_URL, "session_mismatch");
  }

  if (!code) {
    return notionErrorRedirect(env.APP_URL, "code_missing");
  }

  let tokens;
  try {
    tokens = await exchangeNotionCode(code);
  } catch (err) {
    console.error(
      "notion callback: code exchange failed",
      err instanceof Error ? err.message : err,
    );
    return notionErrorRedirect(env.APP_URL, "code_exchange_failed");
  }

  try {
    await saveNotionToken(storedState.userId, tokens.access_token);
  } catch (err) {
    console.error(
      "notion callback: token persist failed",
      err instanceof Error ? err.message : err,
    );
    return notionErrorRedirect(env.APP_URL, "db_unavailable");
  }

  return NextResponse.redirect(`${env.APP_URL}/dashboard?notionConnected=1`, 302);
}
