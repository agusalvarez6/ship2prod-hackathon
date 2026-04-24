export default function MeetingBriefPage({
  params,
}: {
  params: { meetingId: string }
}) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Meeting {params.meetingId}</h1>
      <p className="mt-4">Composer under construction</p>
    </main>
  )
}
