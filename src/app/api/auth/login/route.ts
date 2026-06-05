// Kicks off the WorkOS AuthKit hosted sign-in (AUTH_MODE=workos).
import { NextResponse } from "next/server";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

export async function GET() {
  // prompt=login forces WorkOS to show the login screen even if it already has
  // an active SSO session. Without it, signing out of OUR app (which only clears
  // our cookie) and clicking "Sign in" would silently re-authenticate the same
  // WorkOS user — making it impossible to switch users. This is the code-only
  // way to get a clean re-login; the alternative is ending the WorkOS session
  // via its hosted logout URL, which needs a dashboard logout-redirect config.
  // The SDK types `prompt` as only "consent", but WorkOS/OIDC also accepts
  // "login" (force re-auth). The value passes straight through to the authorize
  // URL, so we cast to satisfy the over-narrow type.
  const url = await getSignInUrl({
    prompt: "login" as "consent",
  });
  return NextResponse.redirect(url);
}
