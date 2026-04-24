import briefingFixture from '../../../../../../infra/seed/briefings.seed.json'

const FIXTURE_ID = '11111111-2222-3333-4444-555555555555'

export default function BriefingPage({
  params,
}: {
  params: { briefingId: string }
}) {
  if (params.briefingId !== FIXTURE_ID) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Briefing {params.briefingId}</h1>
        <p className="mt-4">Briefing viewer under construction</p>
      </main>
    )
  }

  const title = `${briefingFixture.contactName} - ${briefingFixture.companyName}`

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">60-second summary</h2>
        <p className="mt-2">{briefingFixture.summary60s}</p>
      </section>
    </main>
  )
}
