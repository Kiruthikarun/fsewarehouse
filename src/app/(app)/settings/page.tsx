import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { can, PERMISSION_GROUPS, ROLES } from "@/lib/rbac";
import { users, rolePermissions } from "@/lib/repositories";
import { SettingsClient } from "./SettingsClient";

export const metadata = {
  title: "Team & Settings",
  description: "Manage members and edit role-based access to each page.",
};

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  OPERATOR: "Operator",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Page-level re-check. The nav link is hidden for non-admins, but that is UX
  // only — this is the real gate. A Manager who deep-links here lands on Home.
  if (!can(user, "org:manage")) redirect("/");

  const [members, matrix] = await Promise.all([
    users.list(user),
    rolePermissions.matrix(user),
  ]);

  return (
    <SettingsClient
      currentUserId={user.id}
      currentUserRole={user.role}
      organisationName={user.organisationName}
      members={members.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
      }))}
      // The permission catalog + matrix are passed as plain data so the client
      // bundle never imports rbac.ts (which pulls in the Prisma enum).
      groups={PERMISSION_GROUPS}
      roles={ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] ?? r }))}
      matrix={matrix}
    />
  );
}
