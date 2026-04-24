import { NextResponse, type NextRequest } from "next/server";
import { buildClearSessionCookie } from "@/lib/session";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const res = NextResponse.redirect(`${env.APP_URL}/`, 303);
  res.headers.set("set-cookie", buildClearSessionCookie());
  return res;
}
