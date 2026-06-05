import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEV_COOKIE } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

/**
 * Dev-auth login (AUTH_MODE=dev only). Sets a cookie naming the seeded user to
 * impersonate, so a reviewer can hop between the 9 logins instantly. Disabled
 * outright in workos mode so it can never become a backdoor in production.
 */
export async function POST(req: NextRequest) {
  if (process.env.AUTH_MODE === "workos") {
    return NextResponse.json(
      { error: "Dev login is disabled in workos mode" },
      { status: 403 },
    );
  }

  const form = await req.formData();
  const email = String(form.get("email") ?? "").toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  }

  const store = await cookies();
  store.set(DEV_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });

  // Default to "/" so the root page routes to the role-aware landing page.
  const from = String(form.get("from") ?? "/") || "/";
  return NextResponse.redirect(new URL(from, req.url), { status: 303 });
}
