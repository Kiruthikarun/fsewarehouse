import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEV_COOKIE } from "@/lib/current-user";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const WORKOS_COOKIE = process.env.WORKOS_COOKIE_NAME ?? "wos-session";

// `redirect()` (used inside WorkOS signOut) signals success by THROWING a
// control-flow error tagged with a NEXT_REDIRECT digest. Let that propagate.
function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Logout endpoint for both auth modes.
 *
 * workos mode: call WorkOS `signOut()`, which redirects to WorkOS's hosted
 * logout URL and ENDS THE WORKOS SSO SESSION server-side. This is what lets a
 * reviewer sign out and then sign in as a *different* user — clearing only our
 * own cookie leaves the WorkOS session alive, so the next sign-in silently
 * re-authenticates the same user.
 *
 * Requires a "Logout redirect URI" configured in the WorkOS dashboard
 * (Redirects → set it to {APP_URL}/login). If that's missing, or there's no
 * active session, we fall back to clearing our cookie so logout never 500s.
 */
export async function GET() {
  if (process.env.AUTH_MODE === "workos") {
    const { signOut } = await import("@workos-inc/authkit-nextjs");
    try {
      await signOut({ returnTo: `${APP_URL}/login` });
    } catch (err) {
      if (isNextRedirect(err)) throw err; // success — let the redirect run
      // No session / logout-redirect not configured: clear our cookie so the
      // user is at least logged out of this app.
      const store = await cookies();
      store.delete(WORKOS_COOKIE);
      return NextResponse.redirect(new URL("/login", APP_URL));
    }
    return NextResponse.redirect(new URL("/login", APP_URL)); // unreachable
  }

  // ── dev-auth mode ──
  const store = await cookies();
  store.delete(DEV_COOKIE);
  return NextResponse.redirect(new URL("/login", APP_URL));
}
