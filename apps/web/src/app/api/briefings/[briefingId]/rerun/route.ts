import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const DEFAULT_GRAPH_URL = "http://localhost:4001/graphql";

export async function POST(
  _req: Request,
  { params }: { params: { briefingId: string } },
): Promise<NextResponse> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const session = await verifySession(token).catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const endpoint = process.env["GRAPH_INTERNAL_URL"] ?? DEFAULT_GRAPH_URL;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `mutation($b: ID!) { rerunBriefing(briefingId: $b) { id userId status } }`,
      variables: { b: params.briefingId },
    }),
    cache: "no-store",
  });
  const payload = (await res.json()) as {
    data?: { rerunBriefing: { id: string; userId: string; status: string } };
    errors?: Array<{ message: string }>;
  };
  if (payload.errors && payload.errors.length > 0) {
    return NextResponse.json(
      { error: payload.errors.map((e) => e.message).join("; ") },
      { status: 500 },
    );
  }
  const b = payload.data?.rerunBriefing;
  if (!b) return NextResponse.json({ error: "empty_response" }, { status: 500 });
  if (b.userId !== session.sub) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ id: b.id, status: b.status }, { status: 200 });
}
