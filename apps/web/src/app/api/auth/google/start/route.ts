import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, mintState } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const nonce = await mintState();
    const url = buildAuthUrl(nonce);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("start: failed to mint state", err instanceof Error ? err.message : err);
    return new NextResponse("oauth_start_failed", { status: 503 });
  }
}
