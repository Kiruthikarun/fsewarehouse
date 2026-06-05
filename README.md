# T3C Warehouse — Multi-Tenant Warehouse Management Platform

A small but production-shaped warehouse management system built for the T3C Full
Stack Engineer build exercise.

- **Transactional path** → Next.js (App Router) on Cloud Run → Cloud SQL Postgres (Prisma)
- **Analytics path** → Postgres → **BigQuery** (idempotent batch sync) → dashboard reads BigQuery, never Postgres
- **Auth** → WorkOS AuthKit (with a dev-login fallback so reviewers can switch between the 9 seeded users instantly)
- **AuthZ** → permission-based RBAC enforced at the **API + data layer**, plus hard multi-tenant isolation

---

## TL;DR — run it locally in 4 commands

> Requires Docker + Node 20/22. No cloud accounts needed for local dev — it runs
> in **dev-auth mode** with a one-click login for each seeded user.

```bash
npm install
docker compose up -d                       # local Postgres on host port 5433
cp .env.example .env                        # defaults already point at the local DB + AUTH_MODE=dev
npx prisma migrate dev --name init --skip-seed && npm run db:seed
npm run dev                                 # http://localhost:3000
```

Open http://localhost:3000 and pick any of the 9 seeded users to log in.

The analytics dashboard needs BigQuery (see [Analytics](#analytics-bigquery)); without it,
the dashboard shows a clear "BigQuery not configured" state and everything else works.

---

## The nine seeded logins

All nine users authenticate via **WorkOS AuthKit** with email + password.
**Shared password for every account:** `T3cReview!2026`

Logins are derived from each person's name (so the email still makes sense after a
role change). The Coastal admin uses a real inbox so the magic-link / password-reset
flows can be exercised.

| Organisation       | Admin                       | Warehouse Manager       | Operator             |
| ------------------ | --------------------------- | ----------------------- | -------------------- |
| Coastal Logistics  | kiruthikarun2004@gmail.com  | ravi.kapoor@gmail.com   | devi.pillai@gmail.com   |
| Meridian Stores    | sam.carter@gmail.com        | jordan.lee@gmail.com    | riley.brooks@gmail.com  |
| Tilman & Co.       | olivia.hart@gmail.com       | tom.fielding@gmail.com  | priya.shah@gmail.com    |

> The app maps **org + role from our own Postgres `User` table** (matched by email);
> WorkOS only establishes identity. Users are provisioned into WorkOS with
> `npm run workos:provision` (idempotent). A `dev` auth mode also exists for
> credential-free local exploration — set `AUTH_MODE=dev` and the login page lists
> all nine users as one-click buttons.

### Magic link & password reset

Both are handled by **hosted AuthKit** — enable them once in
**WorkOS → AuthKit → Authentication** (turn on *Magic Auth* and *Email + Password*).
The hosted sign-in page then shows an email-code option and a **"Forgot password?"**
link, and WorkOS sends both emails itself.

To exercise the flows from the terminal (delivered to the Coastal admin's real
inbox, `kiruthikarun2004@gmail.com`, unless you pass another seeded email):

```bash
AUTH_MODE=workos npm run auth:magic            # WorkOS emails a one-time code + prints it
AUTH_MODE=workos npm run auth:reset            # mints a reset link/token and prints the URL
AUTH_MODE=workos npm run auth:magic -- ravi.kapoor@gmail.com   # target a specific user
```

`auth:magic` (`createMagicAuth`) makes WorkOS send the code email and returns the
code for verification. `auth:reset` (`createPasswordReset`) mints the reset URL but
does not email it — open the printed URL to set a new password, or use the hosted
"Forgot password?" link if you want the branded email in the inbox. Both require the
user to exist in WorkOS first (`npm run workos:provision`).

Seeded volume: **3 orgs · 12 warehouses · ~80 inventory items · ~370 movements over the last 90 days**,
shaped so analytics has signal (busy vs quiet warehouses, fast movers, dead stock, low stock).

---

## Architecture

```
 Next.js (App Router, Cloud Run)
   │  server components + route handlers
   ├──────────────► Cloud SQL Postgres   (transactional CRUD via Prisma)
   │                      │
   │                      │  scheduled batch sync (Cloud Run Job + Cloud Scheduler)
   │                      ▼
   └──────────────► BigQuery             (denormalised analytics tables)
        dashboard            ▲
        reads BQ ────────────┘
```

Both paths enforce the **same tenant boundary**: transactional queries filter by
`organisationId` in the data layer; analytics queries are parameterised by
`organisationId` in the only code that issues them.

### Tech

| Concern        | Choice |
| -------------- | ------ |
| Framework      | Next.js 15 (App Router), React 19, TypeScript `strict` |
| Transactional  | Cloud SQL for PostgreSQL via Prisma (local: Postgres in Docker) |
| Analytics      | BigQuery (dataset + `warehouses`/`inventory`/`movements` tables, IAM-scoped SA) |
| Sync           | Cloud Run Job on Cloud Scheduler — full-snapshot LOAD with `WRITE_TRUNCATE` (idempotent) |
| Auth           | WorkOS AuthKit (+ dev-login fallback) |
| Deploy         | Cloud Run (Dockerfile, `output: standalone`) |
| Secrets        | Google Secret Manager (no secrets in repo) |
| Styling        | Tailwind CSS v4 |
| Grid / Charts  | AG Grid Community + Recharts |

---

## RBAC — enforced at the data layer, not the UI

Three roles, modelled as a **permission matrix** (`src/lib/rbac.ts`). Code asks
`can(role, "warehouse:create")` — never `if (role === "ADMIN")`.

The brief deliberately leaves *what* each role can do up to us. I grounded the split
in how real WMS products (NetSuite WMS as the clearest reference) scope these roles,
applying two standard principles — **least privilege** and **segregation of duties**:

- **Operator** = the floor / "Mobile Operator": executes processing tasks only.
  Reads the stock picture and records inbound/outbound movements. No master-data
  edits, no setup, no analytics.
- **Warehouse Manager** = the operational power user: owns the master data the floor
  runs on (create/edit warehouses & items), records movements, sees analytics — but
  does **not** perform destructive deletes or administer the tenant.
- **Admin** = administrator: everything a Manager can do, **plus** destructive
  master-data deletes and user/role administration (`org:manage`).

| Permission          | Admin | Manager | Operator |
| ------------------- | :---: | :-----: | :------: |
| warehouse:read      |  ✅   |   ✅    |    ✅    |
| warehouse:create / update | ✅ | ✅ | ❌ |
| warehouse:delete    |  ✅   |   ❌    |    ❌    |
| inventory:read      |  ✅   |   ✅    |    ✅    |
| inventory:create / update | ✅ | ✅ | ❌ |
| inventory:delete    |  ✅   |   ❌    |    ❌    |
| movement:read       |  ✅   |   ✅    |    ✅    |
| movement:create     |  ✅   |   ✅    |    ✅    |
| movement:delete     |  ✅   |   ✅    |    ❌    |
| analytics:read      |  ✅   |   ✅    |    ❌    |
| org:manage          |  ✅   |   ❌    |    ❌    |

**Two different kinds of "delete," split deliberately:**

- **Master-data delete** (`warehouse:delete`, `inventory:delete`) is **Admin-only**.
  In a real WMS the day-to-day roles run the floor, but destroying a whole
  warehouse or SKU is a structural change reserved for an administrator
  (segregation of duties).
- **Movement delete** (`movement:delete`) is **Manager + Admin**, not Operator.
  Deleting a movement isn't a raw row delete — it **reverses the movement's effect
  on stock** in the same transaction (deleting an inbound subtracts those units
  back; deleting an outbound returns them), and is rejected if the reversal would
  drive stock negative. This mirrors the WMS convention where managers own movement
  reversals: Operators *record* movements, Managers/Admins can *unwind* them. The
  floor can't quietly erase its own activity.

This yields three cleanly graded tiers: Operator *executes*, Manager *operates +
corrects + manages master data*, Admin *additionally destroys master data +
administers users*. Operators never edit a quantity field directly — every stock
change is an audited movement with a who/when/why trail.

`org:manage` is the other thing that makes **Admin distinct from Manager**: only an
Admin can open **Team & roles** (`/users`) and change another member's role. It is a
real, reachable, org-scoped surface (`/api/users`, `src/lib/repositories.ts → users`).
Guards: you cannot change your own role, and an org can never be left without an Admin.

**The enforcement path (the code, not the buttons):**

1. `src/middleware.ts` — UX-only redirect for unauthenticated users. *Not* the security boundary.
2. Every route handler calls `requirePermission("…")` (`src/lib/auth.ts`) → 403 if missing.
3. Every repository function (`src/lib/repositories.ts`) filters by `user.organisationId`.
   Mutations use `updateMany`/`deleteMany` with the org predicate, so a cross-tenant id
   touches **0 rows → 404**, never a leak.
4. Server components re-check `can(...)` before rendering (e.g. the dashboard denies
   Operators server-side even if they navigate directly).

UI hiding is purely cosmetic — the server re-checks every mutation.

You can verify this with curl (no UI):

```bash
# Operator is blocked creating a warehouse:
curl -c op.jar -d "email=devi.pillai@gmail.com" localhost:3000/api/dev-login
curl -b op.jar -X POST localhost:3000/api/warehouses \
  -H 'Content-Type: application/json' -d '{"name":"x","location":"y","capacity":1}'
# → 403 {"error":"Forbidden","permission":"warehouse:create"}

# Cross-tenant delete is a 404, not a leak:
curl -c m.jar -d "email=sam.carter@gmail.com" localhost:3000/api/dev-login
curl -b m.jar -X DELETE localhost:3000/api/warehouses/<a-coastal-warehouse-id>
# → 404 {"error":"Warehouse not found"}

# Admin ≠ Manager: a Manager is blocked from managing roles:
curl -c mgr.jar -d "email=ravi.kapoor@gmail.com" localhost:3000/api/dev-login
curl -b mgr.jar localhost:3000/api/users
# → 403 {"error":"Forbidden","permission":"org:manage"}
# The Coastal Admin gets the member list and can PATCH a role.
```

---

## Analytics (BigQuery)

The dashboard (`/dashboard`) reads **only** from BigQuery — one chart (90-day
inbound vs outbound velocity) and one AG Grid data grid (stock levels + per-SKU
velocity + status), plus KPI cards and an anomaly summary (low / dead / fast).

### The sync architecture and the trade-off I chose

**Chosen: scheduled batch — Cloud Run Job on Cloud Scheduler, full-snapshot LOAD with `WRITE_TRUNCATE`.**
(`scripts/sync-to-bigquery.ts`.)

How it stays idempotent — *"running it twice does not double anything"*:

1. Read the current state from Postgres, denormalised for analytics. All three
   core entities are mirrored as their own BigQuery tables: **`warehouses`,
   `inventory`, `movements`** (`scripts/bq-schema.ts`).
2. Bulk **LOAD** each table with `writeDisposition: WRITE_TRUNCATE`, which
   atomically **replaces** the table's contents with the new snapshot.

Because every run overwrites each table with the current snapshot, running it
twice is byte-for-byte identical — nothing can ever be double-counted. This is
actually a *stronger* idempotency guarantee than an INSERT-only MERGE.

**Updates and deletes both propagate, by construction.** Since each run re-reads
all of Postgres and replaces the table, an updated row carries its new value, a
deleted row simply isn't in the next snapshot, and a rename flows through the
denormalised `*_name` columns (they're re-joined every run). Cascade deletes are
covered too — deleting a warehouse cascades to its items and movements in
Postgres, so all of them drop out of the next snapshot together. The warehouse
count KPI reads the `warehouses` table directly (not `DISTINCT warehouse_id` over
inventory), so an **empty** warehouse still counts and a deleted one stops
counting — the dashboard tracks Postgres truth, not just where stock sits.

**One consequence of batch sync — it's eventually consistent.** A change in
Postgres is visible on the dashboard only **after the next `bq:sync` run** (the
trade-off below). It is never *missed* — just not instant. If a reviewer edits
data and wants to see it immediately, re-run `npm run bq:sync` (it's a single
idempotent job).

**Why I landed on snapshot-replace specifically.** I deliberately used **only
load jobs, no DML (no MERGE/UPDATE/DELETE)**. Two reasons:

- **Cost / free tier:** the BigQuery **sandbox is free with no billing**, but it
  *blocks DML*. A MERGE-based sync can't run there at all. Snapshot-replace uses
  only load jobs (also free, higher quotas), so the analytics pipeline runs at
  genuinely $0. *(I confirmed this against the BigQuery sandbox limitations
  before choosing — the original design was staging + MERGE; I changed it once
  the free-tier constraint made DML the wrong call here.)*
- **Simplicity:** one atomic operation per table, no staging tables, no merge
  keys to reason about.

**The spectrum I chose from** (latency vs durability vs complexity vs cost):

| Option | Latency | Complexity | Notes |
| ------ | ------- | ---------- | ----- |
| **Scheduled batch, snapshot LOAD (chosen)** | minutes | low | Idempotent by construction, free (load jobs only — no DML, sandbox-compatible), trivially re-runnable. Rewrites the whole table each run — fine at this scale. |
| Staging + `MERGE` (incremental) | minutes | medium | Avoids rewriting unchanged history; the right move at high volume. Needs DML → a **billing-enabled** project. |
| Dual-write (app writes PG + BQ) | seconds | medium | Couples the request path to BQ availability; partial-failure consistency is hard; BQ streaming isn't truly idempotent. |
| Pub/Sub + push subscriber | seconds | medium-high | Good for event-driven, but more moving parts for a dashboard that's fine at minute freshness. |
| Datastream (CDC) | near-real-time | high (managed) | Best for large/continuous CDC; overkill and more cost/ops than a 12-warehouse dataset warrants. |

For a warehouse analytics dashboard, **minute-level freshness is plenty**, so I
optimised for simplicity, idempotency and cost. The sync is a single job you can
run on any cadence (e.g. `*/15 * * * *`).

> **Production swap:** at real volume I'd switch to incremental **`MERGE` on a
> watermark** (`occurred_at`/`updated_at`) so unchanged history isn't rewritten,
> and move the denormalisation into scheduled BigQuery SQL / a dbt model reading
> from a Datastream-replicated raw mirror — so the app never runs the ETL itself.
> That path needs a billing-enabled project (DML), which the deploy uses anyway.

### Running the sync (needs GCP)

```bash
# Auth: gcloud ADC locally, or GOOGLE_APPLICATION_CREDENTIALS=./secrets/bq-sa.json
export GCP_PROJECT_ID=your-project BIGQUERY_DATASET=warehouse_analytics
npm run bq:setup     # creates dataset + tables (idempotent)
npm run bq:sync      # PG → BQ; safe to run repeatedly
```

---

## Deploying to Google Cloud (Cloud Run)

> Costs well under $5, or $0 on the $300 free credit. Tear down after review.

```bash
PROJECT=your-project; REGION=us-central1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  bigquery.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com

# 1) Cloud SQL Postgres (db-f1-micro)
gcloud sql instances create warehouse-db --database-version=POSTGRES_16 \
  --tier=db-f1-micro --region=$REGION
gcloud sql databases create warehouse --instance=warehouse-db
gcloud sql users create warehouse --instance=warehouse-db --password=<DB_PASS>

# 2) Secrets (no secrets in the repo)
printf '%s' "<DATABASE_URL>"          | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' "<WORKOS_API_KEY>"        | gcloud secrets create WORKOS_API_KEY --data-file=-
printf '%s' "<WORKOS_CLIENT_ID>"      | gcloud secrets create WORKOS_CLIENT_ID --data-file=-
printf '%s' "<WORKOS_COOKIE_PASSWORD>"| gcloud secrets create WORKOS_COOKIE_PASSWORD --data-file=-

# 3) BigQuery + service account (Data Editor + Job User)
bq --location=US mk -d $PROJECT:warehouse_analytics

# 4) Build + deploy (Cloud Run runtime SA gets the secrets + Cloud SQL connector)
gcloud run deploy warehouse \
  --source . --region=$REGION --allow-unauthenticated \
  --add-cloudsql-instances=$PROJECT:$REGION:warehouse-db \
  --set-env-vars=AUTH_MODE=workos,GCP_PROJECT_ID=$PROJECT,BIGQUERY_DATASET=warehouse_analytics \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,WORKOS_API_KEY=WORKOS_API_KEY:latest,WORKOS_CLIENT_ID=WORKOS_CLIENT_ID:latest,WORKOS_COOKIE_PASSWORD=WORKOS_COOKIE_PASSWORD:latest

# 5) Run migrations + seed against Cloud SQL (via the proxy), then bq:setup + bq:sync
# 6) Schedule the sync as a Cloud Run Job on Cloud Scheduler (*/15 * * * *)
```

Set the WorkOS redirect URI to `https://<your-cloud-run-url>/api/auth/callback`.

---

## Auth modes

`AUTH_MODE=dev` (default locally) — a signed cookie names the seeded user; the
login page lists all 9. `AUTH_MODE=workos` (deployed) — real WorkOS AuthKit; the
dev-login endpoint is hard-disabled so it can never be a backdoor. In both modes,
**our DB is authoritative for org + role** — WorkOS only establishes identity.
See `src/lib/current-user.ts`.

---

## Product call — one feature I'd add

**Stock reservations / soft holds.** Today an outbound movement immediately
decrements quantity. Real fulfilment needs a *reserved* state: stock committed to
an order but not yet shipped, so two operators can't oversell the same units and
analytics can distinguish on-hand vs available. It's a small schema addition
(`reservations` + an `available = quantity − reserved` projection) with outsized
operational value, and it makes the dead/fast-mover analytics far more accurate.
(Described here; not built within the time box — see "What I cut".)

---

## What I cut (and why)

- **Inline edit on every grid** — create + delete + (movements) quantity-apply
  prove the CRUD + RBAC + tenancy story; full edit forms are mechanical repetition.
- **WorkOS invite / SSO provisioning flow** — Admins can change existing members'
  roles in-app (**Team & roles**, gated by `org:manage`), which is what proves the
  three roles are genuinely distinct. Inviting brand-new users and syncing roles
  back into WorkOS Directory is the remaining piece I left out; in production the
  role write would also push to the WorkOS org-membership API.
- **Automated tests** — I verified RBAC + tenant isolation with scripted HTTP
  calls (see RBAC section); a real suite is the first thing I'd add next.
- **Pixel polish** — functional Tailwind UI; the brief explicitly de-prioritises this.

## What I'd do with another week

1. Vitest + Playwright covering the RBAC/tenancy matrix as regression tests.
2. Move analytics ETL to scheduled BQ SQL / dbt over a Datastream raw mirror.
3. Build the reservations feature above.
4. Audit log for every mutation (who/what/when) — table-stakes for warehouse ops.
5. Connection pooling (PgBouncer / Prisma Accelerate) for Cloud Run cold-start fan-out.

## Grid & charts — production swap

AG Grid Community + Recharts are great for this. At scale I'd move heavy grids to
**AG Grid Enterprise** (server-side row model, pivoting) so the data grid paginates
/ aggregates in BigQuery instead of shipping every row to the browser.

---

## Project layout

```
prisma/schema.prisma        # Org, User, Warehouse, InventoryItem, StockMovement
prisma/seed.ts              # idempotent seed (deterministic PRNG)
src/lib/rbac.ts             # permission matrix + can()
src/lib/auth.ts             # requireUser / requirePermission
src/lib/current-user.ts     # identity resolution (workos | dev) → DB user
src/lib/repositories.ts     # tenant-scoped data access (the isolation boundary)
src/lib/bigquery.ts         # analytics read layer (org-parameterised)
src/app/(app)/dashboard     # BQ-backed analytics (chart + grid)
src/app/(app)/{warehouses,inventory,movements}
src/app/api/...             # route handlers (requirePermission on every mutation)
scripts/setup-bigquery.ts   # create dataset + tables
scripts/sync-to-bigquery.ts # idempotent PG → BQ snapshot sync (WRITE_TRUNCATE)
Dockerfile                  # Cloud Run standalone image
```
