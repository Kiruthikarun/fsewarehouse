#!/usr/bin/env bash
# ─── One-time Continuous Deployment setup ─────────────────────────────────────
# Wires push-to-main → Cloud Build → prod Cloud Run. Run this ONCE. It is
# idempotent: every step is safe to re-run.
#
#   ./scripts/setup-cd.sh
#
# Prereqs: gcloud authenticated as an owner/editor of the project; the GitHub
# repo already exists (Kiruthikarun/fsewarehouse). The actual pipeline lives in
# cloudbuild.yaml — this script only creates the trigger + the least-privilege
# service account it runs as.
set -euo pipefail

PROJECT="${PROJECT:-fsewarehouse-498507}"
REGION="${REGION:-us-central1}"
REPO_OWNER="${REPO_OWNER:-Kiruthikarun}"
REPO_NAME="${REPO_NAME:-fsewarehouse}"
BRANCH="${BRANCH:-^main$}"

RUNTIME_SA="505424789443-compute@developer.gserviceaccount.com"
CICD_SA="cicd-deployer@${PROJECT}.iam.gserviceaccount.com"

echo "▶ Project: $PROJECT  Region: $REGION  Repo: $REPO_OWNER/$REPO_NAME"

# ── 1. Enable the APIs the pipeline touches ──────────────────────────────────
gcloud services enable \
  cloudbuild.googleapis.com run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  --project="$PROJECT"

# ── 2. Dedicated least-privilege service account the trigger runs as ─────────
if ! gcloud iam service-accounts describe "$CICD_SA" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create cicd-deployer \
    --display-name="Cloud Build CD deployer" --project="$PROJECT"
fi

# ── 3. Grant exactly what the pipeline needs, nothing more ───────────────────
#   run.admin            → deploy a new Cloud Run revision
#   cloudsql.client      → connect via the Cloud SQL Auth Proxy to run migrations
#   secretmanager.secretAccessor → read DATABASE_URL for `prisma migrate deploy`
#   artifactregistry.writer → push the built image
#   logging.logWriter    → required for CLOUD_LOGGING_ONLY with a custom SA
for ROLE in \
  roles/run.admin \
  roles/cloudsql.client \
  roles/secretmanager.secretAccessor \
  roles/artifactregistry.writer \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${CICD_SA}" --role="$ROLE" --condition=None --quiet >/dev/null
done

# The CD SA must be able to "act as" the runtime SA to deploy the service with it.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${CICD_SA}" \
  --role="roles/iam.serviceAccountUser" --project="$PROJECT" --quiet >/dev/null

echo "✓ Service account $CICD_SA ready with least-privilege roles."

# ── 4. Connect GitHub (one interactive step), then create the trigger ────────
# Connecting the repo installs the Cloud Build GitHub App. If you have never
# connected this repo, do it once in the console (it requires an OAuth grant):
#
#   https://console.cloud.google.com/cloud-build/triggers/connect?project=${PROJECT}
#
# Then this command creates the push-to-main trigger:
if gcloud builds triggers describe deploy-warehouse-main --project="$PROJECT" >/dev/null 2>&1; then
  echo "✓ Trigger deploy-warehouse-main already exists — skipping create."
else
  gcloud builds triggers create github \
    --name=deploy-warehouse-main \
    --repo-owner="$REPO_OWNER" \
    --repo-name="$REPO_NAME" \
    --branch-pattern="$BRANCH" \
    --build-config=cloudbuild.yaml \
    --service-account="projects/${PROJECT}/serviceAccounts/${CICD_SA}" \
    --include-logs-with-status \
    --project="$PROJECT"
fi

echo
echo "✅ Done. Every push to main now builds → migrates → deploys."
echo "   Watch a run:  gcloud builds list --ongoing --project=$PROJECT"
echo "   Trigger now:  git commit --allow-empty -m 'ci: kick CD' && git push origin main"
