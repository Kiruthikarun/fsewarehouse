#!/usr/bin/env bash
#
# Seed scale data into PRODUCTION Postgres (Cloud SQL), then optionally mirror it
# into prod BigQuery -- driven entirely by the existing scripts/seed-scale.ts and
# scripts/sync-to-bigquery.ts. Nothing new is generated here; this just wires them
# to prod safely.
#
# Why a dedicated script: prod Postgres has no public IP, so we tunnel through the
# Cloud SQL Auth Proxy and pull the DB password from Secret Manager (never hard-code
# it). It is DELIBERATELY confirm-gated because it writes to the live database.
#
# Blast radius: by default REPLACE mode wipes only the TARGET org's items+movements
# and rebuilds a clean year (the org keeps its warehouses + users). Set
# SEED_SCALE_REPLACE=0 to instead ADD on top of existing data. seed-scale.ts also
# fails fast if the base orgs/warehouses/users are missing (run `npm run db:seed`).
#
# Usage:
#   ./scripts/seed-prod.sh                              # defaults: Coastal, 500k movements
#   SEED_SCALE_COUNT=2000000 ./scripts/seed-prod.sh     # bump the volume
#   RUN_SYNC=0 ./scripts/seed-prod.sh                   # seed Postgres only, skip BigQuery
#   SEED_SCALE_REPLACE=0 ./scripts/seed-prod.sh         # add instead of replace
#
# Prereqs:
#   - gcloud + cloud-sql-proxy installed and on PATH
#   - gcloud auth login                              (to read Secret Manager / Cloud SQL)
#   - gcloud auth application-default login          (ADC, for the BigQuery sync)
#   - your account: cloudsql.client + secretmanager.secretAccessor + BigQuery dataEditor
#
set -euo pipefail

# --- Config (override via env) ---
PROJECT="${GCP_PROJECT_ID:-fsewarehouse-498507}"
INSTANCE="${CLOUDSQL_INSTANCE:-fsewarehouse-498507:us-central1:warehouse-db}"
PROXY_PORT="${PROXY_PORT:-5434}"          # 5433 is local docker Postgres -- avoid the clash
DB_NAME="${DB_NAME:-warehouse}"
SECRET_NAME="${SECRET_NAME:-DATABASE_URL}"

# Scale knobs forwarded to seed-scale.ts (single-org targeting via SEED_SCALE_ORG).
# REPLACE=1 -> wipe the target org's existing items+movements and rebuild a clean,
# realistic year. Set SEED_SCALE_REPLACE=0 to ADD on top of existing data.
export SEED_SCALE_ORG="${SEED_SCALE_ORG:-org-coastal}"
export SEED_SCALE_ITEMS="${SEED_SCALE_ITEMS:-10000}"
export SEED_SCALE_COUNT="${SEED_SCALE_COUNT:-500000}"
export SEED_SCALE_DAYS="${SEED_SCALE_DAYS:-365}"
export SEED_SCALE_REPLACE="${SEED_SCALE_REPLACE:-1}"

# After seeding, mirror prod Postgres -> prod BigQuery (the dashboard reads from BQ).
RUN_SYNC="${RUN_SYNC:-1}"
BQ_DATASET="${PROD_BIGQUERY_DATASET:-warehouse_analytics}"   # prod dataset, NOT the local _dev one
BQ_LOCATION="${BIGQUERY_LOCATION:-US}"

# --- Preflight ---
command -v gcloud          >/dev/null || { echo "ERROR: gcloud not found on PATH"; exit 1; }
command -v cloud-sql-proxy >/dev/null || { echo "ERROR: cloud-sql-proxy not found -- https://cloud.google.com/sql/docs/postgres/sql-proxy"; exit 1; }

if [ "${SEED_SCALE_REPLACE}" = 1 ]; then
  MODE="REPLACE -- WIPES this org's existing items+movements first"
else
  MODE="ADD on top of existing data"
fi
if [ "${RUN_SYNC}" = 1 ]; then
  SYNC_DESC="yes -> ${PROJECT}.${BQ_DATASET} (WRITE_TRUNCATE)"
else
  SYNC_DESC="no"
fi

echo ""
echo "  --- SEEDING PRODUCTION -------------------------------------------"
echo "   project    : ${PROJECT}"
echo "   instance   : ${INSTANCE}  (proxy :${PROXY_PORT})"
echo "   org        : ${SEED_SCALE_ORG}"
echo "   items      : ${SEED_SCALE_ITEMS}   movements: ${SEED_SCALE_COUNT}   days: ${SEED_SCALE_DAYS}"
echo "   mode       : ${MODE}"
echo "   bq sync    : ${SYNC_DESC}"
echo "  ------------------------------------------------------------------"
echo ""
read -r -p "Type 'seed-prod' to proceed: " confirm
[ "${confirm}" = "seed-prod" ] || { echo "Aborted."; exit 1; }

# --- Fetch prod DB credentials from Secret Manager ---
echo "-> Reading ${SECRET_NAME} from Secret Manager..."
PROD_URL="$(gcloud secrets versions access latest --secret="${SECRET_NAME}" --project="${PROJECT}")"
# Pull the USER:PASS chunk (between '://' and the first '@'); host/params are replaced
# with the local proxy. Works for both unix-socket and TCP forms of the secret.
CREDS="$(printf '%s' "${PROD_URL}" | sed -E 's#^postgresql://([^@]+)@.*#\1#')"
[ "${CREDS}" != "${PROD_URL}" ] || { echo "ERROR: could not parse credentials from ${SECRET_NAME}"; exit 1; }

# --- Start the Cloud SQL Auth Proxy (auto-stopped on exit) ---
echo "-> Starting Cloud SQL Auth Proxy on 127.0.0.1:${PROXY_PORT} ..."
cloud-sql-proxy --port "${PROXY_PORT}" "${INSTANCE}" &
PROXY_PID=$!
trap 'kill "${PROXY_PID}" 2>/dev/null || true' EXIT

# Wait until the proxy accepts TCP connections (max ~30s).
for _ in $(seq 1 30); do
  (exec 3<>"/dev/tcp/127.0.0.1/${PROXY_PORT}") 2>/dev/null && { exec 3>&-; break; }
  sleep 1
done

export DATABASE_URL="postgresql://${CREDS}@127.0.0.1:${PROXY_PORT}/${DB_NAME}?schema=public"

# --- Seed prod Postgres ---
# Call tsx directly (NOT `npm run seed:scale`, which forces --env-file=.env and
# would clobber DATABASE_URL with the local one).
echo "-> Seeding prod Postgres..."
npx tsx scripts/seed-scale.ts

# --- Mirror into prod BigQuery ---
if [ "${RUN_SYNC}" = 1 ]; then
  echo "-> Syncing prod Postgres -> ${PROJECT}.${BQ_DATASET} ..."
  GCP_PROJECT_ID="${PROJECT}" BIGQUERY_DATASET="${BQ_DATASET}" BIGQUERY_LOCATION="${BQ_LOCATION}" \
    npx tsx scripts/sync-to-bigquery.ts
fi

echo "Done."
