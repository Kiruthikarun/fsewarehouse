// WorkOS AuthKit OAuth callback (used when AUTH_MODE=workos).
// The redirect URI configured in the WorkOS dashboard must point here:
//   {APP_URL}/api/auth/callback
import { NextRequest, NextResponse } from "next/server";
import { handleAuth } from "@workos-inc/authkit-nextjs";

// Return to "/" so the root page can route to the role-aware landing page
// (landingPathFor) — Operators don't have analytics, so they shouldn't land on
// /dashboard. See src/app/page.tsx.
const authHandler = handleAuth({
  returnPathname: "/",
  // A bad/used/expired code would otherwise dump WorkOS's raw
  // {"error":"Couldn't sign in…"} JSON at the user. Send them back to sign in.
  onError: ({ request }) =>
    NextResponse.redirect(new URL("/login", request.url)),
});

export async function GET(request: NextRequest) {
  // A successful OAuth sign-in lands here with `?code=...` to exchange. But
  // PASSWORD-RESET (and some magic-link) completions bounce back to this same
  // redirect URI with NO code — there is nothing to exchange, so handleAuth()
  // 500s ("Couldn't sign in"). Treat a code-less hit as "go sign in": after
  // resetting their password the user is sent to the sign-in page to log in
  // with the new one, instead of seeing an error.
  if (!request.nextUrl.searchParams.get("code")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return authHandler(request);
}
