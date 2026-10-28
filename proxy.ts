import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// /api/integrations/* has its own HMAC signature auth (lib/webhooks.ts verifySignature), and
// /api/cron/* has its own CRON_SECRET bearer check — neither can present a browser session
// cookie, Vercel Cron and external callers like n8n don't have one. The session gate below is
// for the authenticated UI only.
// /about is public too — it's linked from the login screen specifically so a visitor can decide
// whether this is relevant to them before bothering to log in at all.
const PUBLIC_PATHS = ["/login", "/about", "/api/integrations", "/api/cron"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = token ? await verifySessionToken(token) : false;

  if (!isValid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
