import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getUserById } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return new NextResponse(null, { status: 401 })

  let session
  try {
    session = await verifySession(token)
  } catch {
    return new NextResponse(null, { status: 401 })
  }

  const user = await getUserById(session.sub)
  if (!user) return new NextResponse(null, { status: 401 })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      pictureUrl: user.picture_url,
      phoneNumber: user.phone_number_e164,
    },
  })
}
