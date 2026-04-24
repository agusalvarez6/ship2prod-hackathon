import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getBriefing } from "@/lib/briefings";
import { BriefingLive } from "./BriefingLive";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { briefingId: string };
}

export default async function BriefingPage({ params }: PageProps): Promise<JSX.Element> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) redirect("/");

  let session;
  try {
    session = await verifySession(token);
  } catch {
    redirect("/");
  }

  const briefing = await getBriefing(params.briefingId);
  if (!briefing) notFound();
  if (briefing.userId !== session.sub) notFound();

  return <BriefingLive initial={briefing} />;
}
