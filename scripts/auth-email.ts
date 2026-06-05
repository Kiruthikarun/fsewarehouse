/**
 * Trigger WorkOS AuthKit's passwordless + password-reset flows for a seeded
 * user, so you can verify the emails actually land in a real inbox.
 *
 * Two subcommands:
 *
 *   magic  — calls userManagement.createMagicAuth(). WorkOS SENDS the one-time
 *            code/link email itself and the API also returns the code, so you can
 *            confirm delivery against the inbox (or use the printed code directly).
 *
 *   reset  — calls userManagement.createPasswordReset(). This MINTS a reset
 *            token + URL and returns them, but does NOT send an email (that field
 *            is for self-hosted UIs). The branded "reset your password" email is
 *            sent by the hosted AuthKit "Forgot password?" link. So: open the
 *            printed URL to test the reset end-to-end, OR use the hosted link if
 *            you specifically want the email in the inbox.
 *
 * The target defaults to the Coastal admin (a real inbox: kiruthikarun2004@gmail.com)
 * resolved from the DB, so `npm run auth:magic` / `npm run auth:reset` just work.
 * Pass an explicit email to target any other seeded user.
 *
 *   AUTH_MODE=workos npm run auth:magic -- [email]
 *   AUTH_MODE=workos npm run auth:reset -- [email]
 *
 * Prereq: the user must already exist in WorkOS — run `npm run workos:provision`
 * first (and make sure Magic Auth / Email+Password are enabled in
 * WorkOS → AuthKit → Authentication).
 */
import { WorkOS } from "@workos-inc/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Mode = "magic" | "reset";

async function defaultEmail(): Promise<string> {
  // The Coastal admin is the one seeded login backed by a real inbox.
  const admin = await prisma.user.findFirst({
    where: { organisationId: "org-coastal", role: "ADMIN" },
    select: { email: true },
  });
  if (!admin) {
    throw new Error(
      "Coastal admin not found — run `npm run db:seed` first, or pass an email argument.",
    );
  }
  return admin.email;
}

async function main() {
  const mode = process.argv[2] as Mode | undefined;
  if (mode !== "magic" && mode !== "reset") {
    throw new Error(
      `Usage: tsx scripts/auth-email.ts <magic|reset> [email]\n` +
        `  (got: ${mode ?? "<nothing>"})`,
    );
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) throw new Error("WORKOS_API_KEY is required");

  const email = (process.argv[3] ?? (await defaultEmail())).toLowerCase();
  const workos = new WorkOS(apiKey);

  // Fail early with a clear message if the identity isn't in WorkOS yet —
  // createMagicAuth/createPasswordReset both require an existing WorkOS user.
  const existing = await workos.userManagement.listUsers({ email });
  if (!existing.data[0]) {
    throw new Error(
      `No WorkOS user for ${email}. Run \`npm run workos:provision\` first.`,
    );
  }

  if (mode === "magic") {
    const magic = await workos.userManagement.createMagicAuth({ email });
    console.log(`\n✉  Magic Auth email sent by WorkOS to ${email}`);
    console.log(`   One-time code (also in the email): ${magic.code}`);
    console.log(`   Expires at: ${magic.expiresAt}`);
    console.log(
      `\n   → Check the ${email} inbox, or sign in at the AuthKit page and ` +
        `choose the email-code option.\n`,
    );
    return;
  }

  // mode === "reset"
  const reset = await workos.userManagement.createPasswordReset({ email });
  console.log(`\n🔑 Password reset minted for ${email}`);
  console.log(`   Open this URL to set a new password:`);
  console.log(`   ${reset.passwordResetUrl}`);
  console.log(`   Token: ${reset.passwordResetToken}`);
  console.log(`   Expires at: ${reset.expiresAt}`);
  console.log(
    `\n   Note: this API mints the link but does not email it. To get the ` +
      `branded reset\n   email in the ${email} inbox, use the "Forgot password?" ` +
      `link on the hosted\n   AuthKit sign-in page (WorkOS sends it).\n`,
  );
}

main()
  .catch((e) => {
    console.error("\nFailed:", e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
