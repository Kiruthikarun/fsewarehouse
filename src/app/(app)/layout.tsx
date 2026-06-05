import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { AppShell } from "@/components/shell/AppShell";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  OPERATOR: "Operator",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Compact "today" for the slim breadcrumb header — server-computed so the
  // client header renders it without a hydration mismatch. Short weekday/month
  // keep it inside the 60px bar (e.g. "Fri, 6 Jun 2026").
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Nav is filtered by permission for UX only — the pages themselves re-check.
  const nav = [
    { href: "/", label: "Home", show: true },
    { href: "/dashboard", label: "Analytics", show: can(user, "analytics:read") },
    { href: "/warehouses", label: "Warehouses", show: can(user, "warehouse:read") },
    { href: "/inventory", label: "Inventory", show: can(user, "inventory:read") },
    { href: "/movements", label: "Movements", show: can(user, "movement:read") },
    { href: "/settings", label: "Settings", show: can(user, "org:manage") },
  ]
    .filter((n) => n.show)
    .map(({ href, label }) => ({ href, label }));

  return (
    <AppShell
      nav={nav}
      today={today}
      user={{
        name: user.name,
        email: user.email,
        organisationName: user.organisationName,
        role: user.role,
        roleLabel: ROLE_LABEL[user.role] ?? user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
