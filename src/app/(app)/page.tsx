import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import type { SvgIconComponent } from "@mui/icons-material";

export const dynamic = "force-dynamic";

const MONO = "var(--font-plex-mono), ui-monospace, monospace";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  OPERATOR: "Operator",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Quick org-scoped counts from Postgres (transactional path). These are small
  // COUNT queries, all filtered by organisationId — same tenant boundary as
  // everywhere else.
  const [warehouses, items, movements30d] = await Promise.all([
    prisma.warehouse.count({ where: { organisationId: user.organisationId } }),
    prisma.inventoryItem.count({ where: { organisationId: user.organisationId } }),
    prisma.stockMovement.count({
      where: {
        organisationId: user.organisationId,
        occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stats: {
    label: string;
    value: number;
    caption: string;
    icon: SvgIconComponent;
  }[] = [
    { label: "Warehouses", value: warehouses, caption: "Active locations", icon: WarehouseRoundedIcon },
    { label: "SKUs", value: items, caption: "Tracked items", icon: Inventory2RoundedIcon },
    { label: "Movements", value: movements30d, caption: "Last 30 days", icon: SwapHorizRoundedIcon },
  ];

  // Section cards, filtered to what this role can access.
  const sections: {
    href: string;
    title: string;
    desc: string;
    icon: SvgIconComponent;
    show: boolean;
  }[] = [
    {
      href: "/dashboard",
      title: "Analytics",
      desc: "Stock levels, movement velocity and anomalies — served from BigQuery.",
      icon: InsightsRoundedIcon,
      show: can(user, "analytics:read"),
    },
    {
      href: "/warehouses",
      title: "Warehouses",
      desc: "Locations and capacities across your organisation.",
      icon: WarehouseRoundedIcon,
      show: can(user, "warehouse:read"),
    },
    {
      href: "/inventory",
      title: "Inventory",
      desc: "SKUs, quantities and where they're stored.",
      icon: Inventory2RoundedIcon,
      show: can(user, "inventory:read"),
    },
    {
      href: "/movements",
      title: "Stock movements",
      desc: can(user, "movement:create")
        ? "Record inbound / outbound and review recent activity."
        : "Review recent inbound / outbound activity.",
      icon: SwapHorizRoundedIcon,
      show: can(user, "movement:read"),
    },
    {
      href: "/settings",
      title: "Team & settings",
      desc: "Manage members and edit role-based access to each page.",
      icon: SettingsRoundedIcon,
      show: can(user, "org:manage"),
    },
  ].filter((s) => s.show);

  return (
    <div className="space-y-10">
      {/* ---- Page header band ---- */}
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-1 rounded-full bg-[#ff6a1a]" />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400"
              style={{ fontFamily: MONO }}
            >
              Operations Overview
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
              {user.organisationName}
            </span>
            <span className="inline-flex items-center rounded-md border border-[#ff6a1a]/25 bg-[#ff6a1a]/10 px-2.5 py-1 text-xs font-semibold text-[#c2410c]">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-right">
            <div
              className="text-[10px] uppercase tracking-[0.16em] text-slate-400"
              style={{ fontFamily: MONO }}
            >
              Today
            </div>
            <div
              className="text-sm font-medium text-slate-700"
              style={{ fontFamily: MONO }}
            >
              {today}
            </div>
          </div>
          {can(user, "movement:create") && (
            <Link
              href="/movements"
              className="inline-flex items-center gap-2 rounded-lg bg-[#ff6a1a] px-4 py-2.5 text-sm font-semibold text-[#0b0f1a] shadow-sm transition hover:bg-[#ff7d36]"
            >
              <AddRoundedIcon sx={{ fontSize: 18 }} />
              Record movement
            </Link>
          )}
        </div>
      </header>

      {/* ---- KPI tiles ---- */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </section>

      {/* ---- Workspace navigation ---- */}
      <section>
        <h2
          className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400"
          style={{ fontFamily: MONO }}
        >
          Jump to a workspace
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#11182b] p-5 transition hover:-translate-y-0.5 hover:border-[#ff6a1a]/30 hover:shadow-[0_16px_34px_-18px_rgba(0,0,0,0.8)]"
              >
                {/* signal accent rail revealed on hover */}
                <span className="absolute inset-y-0 left-0 w-1 -translate-x-1 bg-[#ff6a1a] transition-transform group-hover:translate-x-0" />
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-400 transition group-hover:bg-[#ff6a1a]/15 group-hover:text-[#ff6a1a]">
                    <Icon sx={{ fontSize: 22 }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-white">{s.title}</h3>
                      <ArrowForwardRoundedIcon
                        sx={{ fontSize: 18 }}
                        className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-[#ff6a1a]"
                      />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {s.desc}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: number;
  caption: string;
  icon: SvgIconComponent;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#11182b] p-5 transition hover:border-[#ff6a1a]/40 hover:shadow-[0_16px_34px_-18px_rgba(0,0,0,0.8)]">
      {/* top hairline accent */}
      <span className="absolute inset-x-0 top-0 h-0.5 scale-x-0 bg-[#ff6a1a] transition-transform duration-300 group-hover:scale-x-100" />
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"
          style={{ fontFamily: MONO }}
        >
          {label}
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-slate-400 transition group-hover:bg-[#ff6a1a]/15 group-hover:text-[#ff6a1a]">
          <Icon sx={{ fontSize: 18 }} />
        </span>
      </div>
      <div
        className="mt-4 text-4xl font-bold tabular-nums text-[#e8edf6]"
        style={{ fontFamily: MONO }}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-slate-500">{caption}</div>
    </div>
  );
}
