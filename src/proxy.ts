import { NextRequest, NextResponse } from "next/server";

/**
 * Page gate: redirect to /login unless a valid session cookie is present.
 * API routes are NOT gated (they authenticate with their own secret headers,
 * so GHL webhooks and pg_cron/manual triggers keep working).
 */
export default function proxy(req: NextRequest) {
  const token = process.env.APP_SESSION_TOKEN;
  const cookie = req.cookies.get("tl_auth")?.value;
  if (token && cookie === token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes, Next internals, the login page and favicon.
  matcher: ["/((?!api|_next/static|_next/image|login|favicon.ico).*)"],
};
