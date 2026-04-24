import { NextResponse, type NextRequest } from "next/server";
import { clearUserTokens, getUserById } from "@/lib/users";
import { revokeToken } from "@/lib/oauth";
import {
  SESSION_COOKIE,
  buildClearSessionCookie,
  verifySession,
} from "@/lib/session";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const res = NextResponse.redirect(`${env.APP_URL}/`, 303);
    res.headers.set("set-cookie", buildClearSessionCookie());
    return res;
  }

  let session;
  try {
    session = await verifySession(token);
  } catch {
    const res = NextResponse.redirect(`${env.APP_URL}/`, 303);
    res.headers.set("set-cookie", buildClearSessionCookie());
    return res;
  }

  const user = await getUserById(session.sub);
  if (user?.google_refresh_token) {
    await revokeToken(user.google_refresh_token);
  }
  await clearUserTokens(session.sub);

  const res = NextResponse.redirect(`${env.APP_URL}/`, 303);
  res.headers.set("set-cookie", buildClearSessionCookie());
  return res;
}
