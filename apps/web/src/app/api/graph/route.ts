import { NextResponse } from 'next/server'

const GRAPH_URL = process.env.GRAPH_INTERNAL_URL ?? 'http://localhost:4001/graphql'

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.text()
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
