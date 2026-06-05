/**
 * Provision the 9 seeded users into WorkOS AuthKit (idempotent).
 *
 * Our DB is authoritative for org + role; WorkOS only needs to know the
 * identities and a password so reviewers can log in. This script creates each
 * seeded email in WorkOS with a known password (SEED_USER_PASSWORD) and marks
 * it email-verified, so login works immediately with no inbox access.
 *
 * Re-running is safe: existing users are detected by email and their password
 * is reset to the known value rather than creating duplicates.
 *
 *   AUTH_MODE=workos npx tsx scripts/provision-workos.ts
 */
import { WorkOS } from "@workos-inc/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) throw new Error("WORKOS_API_KEY is required");
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) throw new Error("SEED_USER_PASSWORD is required");

  const workos = new WorkOS(apiKey);

  const users = await prisma.user.findMany({
    include: { organisation: true },
    orderBy: [{ organisationId: "asc" }, { role: "asc" }],
  });

  console.log(`Provisioning ${users.length} users into WorkOS…\n`);

  for (const u of users) {
    const [first, ...rest] = u.name.split(" ");
    const lastName = rest.join(" ") || "User";

    // Is the user already in WorkOS? (filter by email)
    const existing = await workos.userManagement.listUsers({ email: u.email });
    const found = existing.data[0];

    if (found) {
      await workos.userManagement.updateUser({
        userId: found.id,
        password,
      });
      console.log(`↻ updated  ${u.email}  (${u.organisation.name} · ${u.role})`);
    } else {
      await workos.userManagement.createUser({
        email: u.email,
        password,
        firstName: first,
        lastName,
        emailVerified: true,
      });
      console.log(`+ created  ${u.email}  (${u.organisation.name} · ${u.role})`);
    }
  }

  console.log(
    `\nDone. All ${users.length} users share password: ${password}\n` +
      `Make sure "Email + Password" is enabled in WorkOS → AuthKit → Authentication.`,
  );
}

main()
  .catch((e) => {
    console.error("\nProvisioning failed:", e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
