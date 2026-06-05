import { redirect } from "next/navigation";
import { getCurrentUser, getWorkosIdentityEmail } from "@/lib/current-user";
import { landingPathFor } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  OPERATOR: "Operator",
};

const ROLE_CHIP: Record<string, string> = {
  ADMIN: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  WAREHOUSE_MANAGER:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  OPERATOR: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const existing = await getCurrentUser();
  if (existing) redirect(landingPathFor(existing.role));

  const { from } = await searchParams;

  // ── WorkOS mode ──────────────────────────────────────────────────────────
  // The happy path needs no UI: an unauthenticated visitor is sent straight to
  // the WorkOS hosted sign-in. This page only renders when WorkOS authenticated
  // someone who ISN'T a provisioned app user (e.g. a personal Google account) —
  // auto-redirecting that case would loop forever, so we show a fallback instead.
  if (process.env.AUTH_MODE === "workos") {
    const unknownEmail = await getWorkosIdentityEmail();
    if (!unknownEmail) redirect("/api/auth/login");
    return (
      <Shell>
        <NotProvisioned email={unknownEmail} />
      </Shell>
    );
  }

  // ── Dev mode ─────────────────────────────────────────────────────────────
  return (
    <Shell width="max-w-3xl">
      <DevLogin from={from} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function Shell({
  children,
  width = "max-w-md",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-slate-100 px-5 py-12 font-sans">
      <div className={`login-rise w-full ${width}`}>
        {children}
        <p className="mt-6 text-center text-xs text-slate-400">
          FSE Warehouse &middot; Operations Platform
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* SSO fallback: authenticated with WorkOS, but not a provisioned user. */

function NotProvisioned({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 ring-1 ring-inset ring-amber-200">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-6 w-6 text-amber-600"
          aria-hidden
        >
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1 className="mt-5 text-lg font-semibold text-slate-900">
        We couldn&apos;t sign you in
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
        You&apos;re signed in to WorkOS as{" "}
        <span className="font-medium text-slate-900">{email}</span>, but that
        account isn&apos;t provisioned for this workspace. Access is granted only
        to the seeded users in this system&apos;s directory.
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        Sign out and sign back in with an Email + Password account from the
        README — for example{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
          kiruthikarun2004@gmail.com
        </code>
        .
      </p>

      <a
        href="/api/auth/logout"
        className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
      >
        Sign out and try another account
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dev mode: seeded-user picker.                                       */

async function DevLogin({ from }: { from?: string }) {
  const orgs = await prisma.organisation.findMany({
    orderBy: { name: "asc" },
    include: { users: { orderBy: { role: "asc" } } },
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
        <h1 className="text-base font-semibold text-slate-900">
          Development sign-in
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a seeded user to impersonate. Each org has an Admin, a Manager and
          an Operator, so you can probe RBAC and tenant isolation. Production
          runs WorkOS AuthKit — set{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
            AUTH_MODE=workos
          </code>
          .
        </p>
      </div>

      <div className="p-6 sm:p-8">
        {orgs.length === 0 && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            No users found — run{" "}
            <code className="font-mono">npm run db:seed</code> first.
          </p>
        )}

        <div className="space-y-6">
          {orgs.map((org) => (
            <section key={org.id}>
              <div className="mb-2.5 flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {org.name}
                </h2>
                <span className="h-px flex-1 bg-slate-100" />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                {org.users.map((u) => (
                  <form
                    key={u.id}
                    action="/api/dev-login"
                    method="POST"
                    className="contents"
                  >
                    <input type="hidden" name="email" value={u.email} />
                    <input type="hidden" name="from" value={from ?? "/"} />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                    >
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_CHIP[u.role]}`}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                      <div className="mt-2 text-sm font-medium text-slate-800">
                        {u.name}
                      </div>
                      <div className="truncate text-xs text-slate-400">
                        {u.email}
                      </div>
                    </button>
                  </form>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
