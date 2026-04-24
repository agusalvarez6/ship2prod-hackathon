import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "s2p_session";
const PROTECTED_PREFIXES = ["/dashboard", "/calendar"];

// Middleware runs on the edge runtime. It MUST not import the node-only
// modules (`pg`, `ioredis`, `./lib/db`, etc). Session verification uses
// `jose` directly against `SESSION_JWT_SECRET`.

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error("SESSION_JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToLogin(req);

  try {
    await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest): NextResponse {
  const loginUrl = new URL("/", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/calendar/:path*"],
};
