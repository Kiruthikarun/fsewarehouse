// WorkOS AuthKit OAuth callback (used when AUTH_MODE=workos).
// The redirect URI configured in the WorkOS dashboard must point here:
//   {APP_URL}/api/auth/callback
import { NextRequest, NextResponse } from "next/server";
import { handleAuth } from "@workos-inc/authkit-nextjs";

// Behind a proxy (Cloud Run) the incoming request URL is the container's internal
// address (0.0.0.0:8080), so post-login redirects built from it would send the
// user there. Derive the public origin from our configured redirect URI instead,
// which keeps this domain-aware: production origin in prod, localhost in local dev.
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? process.env.WORKOS_REDIRECT_URI;
const APP_ORIGIN = REDIRECT_URI ? new URL(REDIRECT_URI).origin : undefined;

// Return to "/" so the root page can route to the role-aware landing page
// (landingPathFor) — Operators don't have analytics, so they shouldn't land on
// /dashboard. See src/app/page.tsx.
const authHandler = handleAuth({
  returnPathname: "/",
  // Base for the post-login redirect — the public origin, not the internal host.
  baseURL: APP_ORIGIN,
  // A bad/used/expired code would otherwise dump WorkOS's raw
  // {"error":"Couldn't sign in…"} JSON at the user. Send them back to sign in.
  onError: ({ request }) =>
    NextResponse.redirect(new URL("/login", APP_ORIGIN ?? request.url)),
});

export async function GET(request: NextRequest) {
  // A successful OAuth sign-in lands here with `?code=...` to exchange. But
  // PASSWORD-RESET (and some magic-link) completions bounce back to this same
  // redirect URI with NO code — there is nothing to exchange, so handleAuth()
  // 500s ("Couldn't sign in"). Treat a code-less hit as "go sign in": after
  // resetting their password the user is sent to the sign-in page to log in
  // with the new one, instead of seeing an error.
  if (!request.nextUrl.searchParams.get("code")) {
    return NextResponse.redirect(new URL("/login", APP_ORIGIN ?? request.url));
  }
  return authHandler(request);
}
