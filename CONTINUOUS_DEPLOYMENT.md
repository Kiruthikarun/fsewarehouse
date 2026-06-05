# Continuous Deployment — and how prod migrates safely

Phase-2 turns the manual `gcloud run deploy` into an automated pipeline:

```
git push origin main
        │
        ▼
Cloud Build trigger (deploy-warehouse-main)
        │
        ├─ 1. build    docker build → warehouse:<commit-sha> + :latest
        ├─ 2. push     → Artifact Registry
        ├─ 3. migrate  prisma migrate deploy   ← GATED. fails-stop here.
        └─ 4. deploy   gcloud run deploy (new immutable revision)
```

Defined in [`cloudbuild.yaml`](./cloudbuild.yaml). One-time wiring: [`scripts/setup-cd.sh`](./scripts/setup-cd.sh).

---

## "Is everything migrated to prod safely?" — yes, and here's exactly why

### 1. Migrations are gated and fail-fast — no half-deploys
Cloud Build steps run **in order and stop on the first failure**. `migrate` runs
**before** `deploy`. So:

- Migration fails → the build aborts → the **new image is never deployed**. Prod
  keeps serving the **last good revision** against the **unchanged schema**. Nothing
  is left half-applied at the app layer.
- Migration succeeds → and only then does the new revision roll out.

There is no window where new code is live against an un-migrated DB, or a new
schema is live with no code that can fail mid-deploy without a fallback.

### 2. `prisma migrate deploy` is forward-only and idempotent
This is the **production** Prisma command (never `migrate dev`, which can reset).
It:

- applies **only** the migrations not yet recorded in the `_prisma_migrations`
  table, in order;
- **never** resets the database, **never** re-runs an already-applied migration,
  **never** autogenerates a new one;
- is a **DB no-op** when nothing is pending — so re-running the pipeline (e.g. a
  retried build, a docs-only push) does not touch the schema.

Every applied migration is recorded with its checksum, so a tampered migration
file is rejected rather than silently re-run.

### 3. Migrations are additive (expand → contract) — zero-downtime swaps
During the traffic switch, the old revision and the new revision overlap briefly.
For that overlap to be safe, each migration must be **backward-compatible with the
currently-running code**. The rule we follow:

| Phase | What ships together | Example |
|-------|--------------------|---------|
| **Expand** | additive migration **+** code that tolerates old *and* new shape | add a nullable column / new table |
| **Migrate data** | backfill (idempotent), still tolerant | populate the new column |
| **Contract** | drop the old shape **only after** no running code references it | drop the old column, in a *later* release |

So a destructive change (drop column/table, rename, NOT NULL on existing data) is
never shipped in the same release as the code that depends on it. This is what
makes "migrate-then-deploy" safe instead of risky.

### 4. Least-privilege, password-free DB access
The migrate step connects through the **Cloud SQL Auth Proxy**, authenticated by
the pipeline's IAM service account (`cicd-deployer`) — no DB password lives in the
pipeline. It reuses the **same `DATABASE_URL` secret the app uses** (Secret
Manager, unix-socket form), so the pipeline and the app reach the DB identically.
The CD service account holds only: `run.admin`, `cloudsql.client`,
`secretmanager.secretAccessor`, `artifactregistry.writer`, `logging.logWriter`,
and `serviceAccountUser` on the runtime SA.

### 5. Immutable, traceable releases + instant rollback
Every deploy is tagged with the **commit SHA**, so prod always maps to an exact
commit. Cloud Run revisions are immutable. If a release misbehaves, roll back the
**code** instantly without touching the DB (migrations were additive, so the prior
revision still runs against the new schema):

```bash
# list revisions, newest first
gcloud run revisions list --service=warehouse --region=us-central1

# shift 100% traffic back to the previous good revision
gcloud run services update-traffic warehouse --region=us-central1 \
  --to-revisions=warehouse-00042-abc=100
```

### 6. Health-gated traffic
Cloud Run only routes traffic to a revision that **starts successfully**. A
revision that crashes on boot does not receive traffic, so a bad image can't take
prod down on its own.

---

## First-time setup

```bash
./scripts/setup-cd.sh
```

This enables the APIs, creates the least-privilege `cicd-deployer` service
account, and creates the `deploy-warehouse-main` trigger. Connecting the GitHub
repo to Cloud Build is a one-time OAuth grant in the console (the script prints
the link if needed):

> https://console.cloud.google.com/cloud-build/triggers/connect?project=fsewarehouse-498507

## Day-to-day

```bash
git push origin main                 # → builds, migrates, deploys automatically
gcloud builds list --ongoing         # watch the current run
gcloud builds log <BUILD_ID>         # tail logs
```

## Writing a migration (the safe loop)

```bash
# locally, against the docker-compose Postgres:
npx prisma migrate dev --name add_xyz   # creates prisma/migrations/<ts>_add_xyz
git add prisma/migrations && git commit && git push origin main
# CD runs `prisma migrate deploy` against Cloud SQL before the new revision ships
```

Keep each migration additive (see the expand/contract table above); split any
destructive drop into a later release once no running code references the old
shape.

## Optional hardening (not enabled by default)

For extra caution on risky releases, deploy with `--no-traffic --tag=canary`,
smoke-test the canary URL, then promote with `update-traffic --to-latest`. This
adds a manual gate between "deployed" and "serving users."
