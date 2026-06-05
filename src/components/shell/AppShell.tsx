"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CornerDownLeftRoundedIcon from "@mui/icons-material/SubdirectoryArrowLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

export type NavItem = { href: string; label: string };

export type ShellUser = {
  name: string;
  email?: string;
  organisationName: string;
  role: string;
  roleLabel: string;
};

const INK = "#0b0f1a";
const SIGNAL = "#ff6a1a";

/** Icon assigned to each route — keyed by href so the server layout stays icon-free. */
const NAV_ICONS: Record<string, SvgIconComponent> = {
  "/": HomeRoundedIcon,
  "/dashboard": InsightsRoundedIcon,
  "/warehouses": WarehouseRoundedIcon,
  "/inventory": Inventory2RoundedIcon,
  "/movements": SwapHorizRoundedIcon,
  "/settings": SettingsRoundedIcon,
};

/**
 * Enterprise application shell — a persistent instrument-panel sidebar paired
 * with a light working canvas and a slim breadcrumb header.
 *
 * Holds the cross-cutting UI state (mobile drawer, ⌘K command palette) so the
 * sidebar and header can share it. The sidebar carries the brand, tenant context
 * and primary navigation; the header carries location (breadcrumbs) and identity.
 */
export function AppShell({
  nav,
  user,
  children,
}: {
  nav: NavItem[];
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Persisted desktop sidebar collapse — only affects the lg+ persistent rail;
  // the mobile drawer always renders expanded.
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate the collapse preference after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar:collapsed") === "1");
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // ⌘K / Ctrl-K toggles the command palette; Escape closes transient surfaces.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Collapse the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[#f4f5f7]">
      {/* ---- Persistent sidebar (lg+) ---- */}
      <Sidebar
        nav={nav}
        user={user}
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        className="hidden lg:flex"
      />

      {/* ---- Mobile drawer ---- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[#0b0f1a]/60 backdrop-blur-sm animate-[fadeIn_140ms_ease-out]"
            onClick={() => setMobileOpen(false)}
          />
          <Sidebar
            nav={nav}
            user={user}
            pathname={pathname}
            className="absolute inset-y-0 left-0 flex animate-[slideInLeft_180ms_cubic-bezier(0.22,1,0.36,1)]"
            onClose={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* ---- Working area ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          nav={nav}
          user={user}
          pathname={pathname}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 [container-type:inline-size]">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </div>
        </main>
      </div>

      {/* ---- Command palette ---- */}
      {paletteOpen && (
        <CommandPalette
          nav={nav}
          onClose={() => setPaletteOpen(false)}
          onSelect={(href) => {
            setPaletteOpen(false);
            router.push(href);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({
  nav,
  user,
  pathname,
  collapsed = false,
  className = "",
  onClose,
  onToggleCollapse,
}: {
  nav: NavItem[];
  user: ShellUser;
  pathname: string;
  collapsed?: boolean;
  className?: string;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}) {
  const [orgOpen, setOrgOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  const orgInitials = user.organisationName.slice(0, 2).toUpperCase();

  return (
    <aside
      className={`relative h-screen shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#0b0f1a] text-slate-300 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:sticky lg:top-0 ${
        collapsed ? "w-[76px]" : "w-[264px]"
      } ${className}`}
    >
      {/* hi-vis right edge — the panel reads as lit from its working face */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-[#ff6a1a]/40 to-transparent" />

      <div className="relative flex h-full flex-col">
        {/* ---- Brand lockup ---- */}
        {/* px-6 (24px) so the brand mark's left edge lines up with the tenant,
            nav and account icons below it (all inset 12px container + 12px = 24px). */}
        <div
          className={`flex pb-5 pt-6 ${
            collapsed ? "flex-col items-center gap-3 px-3" : "items-center gap-3 px-6"
          }`}
        >
          <BrandMark />
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-[15px] font-bold tracking-tight text-white">
                FSE Warehouse
              </span>
              <span className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-[#ff6a1a]/80">
                Operations
              </span>
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
              aria-label="Close navigation"
            >
              <CloseRoundedIcon sx={{ fontSize: 20 }} />
            </button>
          )}
          {/* Collapse / expand control — anchored to the brand row so it reads as
              part of the rail. Single chevron icon rotates to signal direction. */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white ${
                collapsed ? "" : "ml-auto"
              }`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <KeyboardDoubleArrowLeftRoundedIcon
                sx={{ fontSize: 20 }}
                className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {/* ---- Tenant switcher ---- */}
        <div className="relative px-3">
          {collapsed ? (
            <div className="flex justify-center">
              <span
                title={`${user.organisationName} · Tenant`}
                className="grid h-10 w-10 place-items-center rounded-lg bg-[#ff6a1a]/15 font-mono text-[12px] font-semibold text-[#ff6a1a] ring-1 ring-inset ring-[#ff6a1a]/20"
              >
                {orgInitials}
              </span>
            </div>
          ) : (
            <>
          <button
            type="button"
            onClick={() => setOrgOpen((v) => !v)}
            className={`flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] px-3 py-2.5 text-left transition ${
              orgOpen ? "bg-white/[0.07]" : "bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ff6a1a]/15 font-mono text-[12px] font-semibold text-[#ff6a1a]">
              {orgInitials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {user.organisationName}
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                Tenant
              </span>
            </span>
            <KeyboardArrowDownRoundedIcon
              sx={{ fontSize: 18 }}
              className={`text-slate-500 transition-transform ${orgOpen ? "rotate-180" : ""}`}
            />
          </button>
          {orgOpen && (
            <Popover onClose={() => setOrgOpen(false)} className="left-3 right-3">
              <div className="px-2 pb-2 pt-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Active tenant
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-[#ff6a1a]/[0.08] px-3 py-2.5 ring-1 ring-inset ring-[#ff6a1a]/20">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#ff6a1a]/15 font-mono text-sm font-semibold text-[#ff6a1a]">
                  {orgInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {user.organisationName}
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {user.roleLabel}
                  </p>
                </div>
                <CheckRoundedIcon sx={{ fontSize: 18 }} className="text-[#ff6a1a]" />
              </div>
              <p className="px-2 pb-1 pt-3 text-[12px] leading-relaxed text-slate-500">
                You have access to a single organisation. Contact an administrator
                to be added to another tenant.
              </p>
            </Popover>
          )}
            </>
          )}
        </div>

        {/* ---- Primary navigation ---- */}
        <nav className="mt-6 flex-1 overflow-y-auto px-3">
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-8 bg-white/[0.08]" />
          ) : (
            <p className="px-3 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              Workspace
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {nav.map((n) => {
              const active = isActive(n.href);
              const Icon = NAV_ICONS[n.href] ?? HomeRoundedIcon;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    title={collapsed ? n.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition ${
                      collapsed ? "justify-center px-0" : "px-3"
                    } ${
                      active
                        ? "bg-gradient-to-r from-[#ff6a1a]/[0.14] to-transparent text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                    }`}
                  >
                    {/* active rail with signal glow */}
                    <span
                      className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[#ff6a1a] transition-all ${
                        active
                          ? "opacity-100 shadow-[0_0_10px_1px_rgba(255,106,26,0.6)]"
                          : "opacity-0"
                      }`}
                    />
                    <Icon
                      sx={{ fontSize: 20 }}
                      className={
                        active
                          ? "text-[#ff6a1a]"
                          : "text-slate-500 transition group-hover:text-slate-300"
                      }
                    />
                    {!collapsed && <span className="truncate">{n.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ---- Account block ---- */}
        <div className="mt-auto border-t border-white/[0.07] p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <span
                title={`${user.name} · ${user.roleLabel}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#ff6a1a] to-[#c2410c] font-mono text-[12px] font-bold text-[#0b0f1a] ring-1 ring-white/10"
              >
                {initialsOf(user.name)}
              </span>
              <a
                href="/api/auth/logout"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogoutRoundedIcon sx={{ fontSize: 18 }} />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#ff6a1a] to-[#c2410c] font-mono text-[12px] font-bold text-[#0b0f1a] ring-1 ring-white/10">
                {initialsOf(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[#ff6a1a]/80">
                  {user.roleLabel}
                </p>
              </div>
              <a
                href="/api/auth/logout"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogoutRoundedIcon sx={{ fontSize: 18 }} />
              </a>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

function AppHeader({
  nav,
  user,
  pathname,
  onOpenMenu,
}: {
  nav: NavItem[];
  user: ShellUser;
  pathname: string;
  onOpenMenu: () => void;
}) {
  const crumbs = buildCrumbs(pathname, nav);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0b0f1a]">
      <div className="flex h-[60px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        {/* mobile menu toggle */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
          aria-label="Open navigation"
        >
          <MenuRoundedIcon />
        </button>

        {/* ---- Breadcrumbs ---- */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
          <ol className="flex min-w-0 items-center gap-1 text-sm">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={c.href} className="flex min-w-0 items-center">
                  {i > 0 && (
                    <ChevronRightRoundedIcon
                      sx={{ fontSize: 16 }}
                      className="mx-0.5 shrink-0 text-slate-600"
                    />
                  )}
                  {last ? (
                    <span className="truncate font-semibold text-white">
                      {c.label}
                    </span>
                  ) : (
                    <Link
                      href={c.href}
                      className="truncate text-slate-400 transition hover:text-white"
                    >
                      {c.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex-1" />

        {/* ---- Identity pill: Name | Role ---- */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] py-1 pl-1.5 pr-3">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[#ff6a1a] to-[#c2410c] font-mono text-[11px] font-bold text-[#0b0f1a]">
            {initialsOf(user.name)}
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            <span className="max-w-[140px] truncate text-sm font-semibold text-white">
              {user.name}
            </span>
            <span className="h-3.5 w-px bg-white/15" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#ff6a1a]/90">
              {user.roleLabel}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                      */
/* ------------------------------------------------------------------ */

/** Geometric stacked-bays mark — warehouse racking lit by a signal beam. */
function BrandMark() {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#1b2540] to-[#0b0f1a] ring-1 ring-white/10">
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="2" y="11" width="7" height="7" rx="1" fill="#475569" />
        <rect x="11" y="11" width="7" height="7" rx="1" fill="#475569" />
        <rect x="2" y="2" width="7" height="7" rx="1" fill={SIGNAL} />
        <rect x="11" y="2" width="7" height="7" rx="1" fill="#94a3b8" />
      </svg>
    </span>
  );
}

/** Dark dropdown shell with click-outside dismissal (used in the sidebar). */
function Popover({
  children,
  className = "",
  onClose,
}: {
  children: React.ReactNode;
  className?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={`absolute top-[calc(100%+8px)] z-50 origin-top animate-[popIn_120ms_ease-out] rounded-xl border border-white/10 bg-[#11182b] p-2 shadow-2xl shadow-black/40 ${className}`}
    >
      {children}
    </div>
  );
}

/** Lightweight, fully functional command palette over the nav routes. */
function CommandPalette({
  nav,
  onClose,
  onSelect,
}: {
  nav: NavItem[];
  onClose: () => void;
  onSelect: (href: string) => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = nav.filter((n) =>
    n.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setIdx(0);
  }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[idx]) {
      e.preventDefault();
      onSelect(results[idx].href);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[#0b0f1a]/70 px-4 pt-[12vh] backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#11182b] shadow-2xl shadow-black/60 animate-[popIn_140ms_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <SearchRoundedIcon sx={{ fontSize: 20 }} className="text-slate-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to a section…"
            className="w-full bg-transparent py-4 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            ESC
          </kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-500">
              No matching sections.
            </li>
          )}
          {results.map((n, i) => (
            <li key={n.href}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => onSelect(n.href)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  i === idx
                    ? "bg-[#ff6a1a]/15 text-white"
                    : "text-slate-300 hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-[#ff6a1a]" : "bg-slate-600"}`}
                  />
                  {n.label}
                </span>
                {i === idx && (
                  <CornerDownLeftRoundedIcon
                    sx={{ fontSize: 16 }}
                    className="text-[#ff6a1a]"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Crumb = { href: string; label: string };

/**
 * Build breadcrumbs from the pathname, resolving labels from the nav set first
 * (so they match the sidebar) and falling back to a title-cased segment.
 */
function buildCrumbs(pathname: string, nav: NavItem[]): Crumb[] {
  const labelFor = (href: string) =>
    nav.find((n) => n.href === href)?.label;

  const home: Crumb = { href: "/", label: labelFor("/") ?? "Home" };
  if (pathname === "/") return [home];

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [home];
  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    crumbs.push({ href: acc, label: labelFor(acc) ?? titleCase(seg) });
  }
  return crumbs;
}

function titleCase(seg: string) {
  // Detail routes are often ids/uuids — show a short, readable token.
  const cleaned = seg.replace(/[-_]/g, " ");
  if (/^[0-9a-f]{8,}$/i.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg)) {
    return `#${seg.slice(0, 6)}`;
  }
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
