import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { DEV_COOKIE } from "@/lib/current-user";

/**
 * Auth middleware — behaviour depends on AUTH_MODE.
 *
 * In BOTH modes this is a convenience layer, NOT the security boundary: every
 * page, route handler, and repository re-checks identity, permission, and tenant
 * server-side (see auth.ts + repositories.ts).
 *
 *   workos mode: delegate to AuthKit's middleware so access tokens are refreshed
 *                automatically (a server component can't write the refreshed
 *                cookie itself). Pages self-protect via getCurrentUser() →
 *                redirect('/login').
 *   dev mode:    a simple cookie-presence redirect to /login.
 */
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/dev-login", "/_next", "/favicon"];

// Constructed once. Harmless in dev mode because we never call it there.
const workosMiddleware = authkitMiddleware({
  redirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (process.env.AUTH_MODE === "workos") {
    return workosMiddleware(req, event);
  }

  // ── dev-auth mode ──
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!req.cookies.has(DEV_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
