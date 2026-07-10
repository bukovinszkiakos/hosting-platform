#!/usr/bin/env bash
#
# Bootstrap the Kubernetes ConfigMaps and Secret the application needs, BEFORE the
# first deploy (see docs/16-deployment.md "Configuration and secrets bootstrap").
#
# It creates/updates three objects in the `hosting-platform` namespace:
#   * configmap/backend-config   — non-secret backend config (mostly Terraform outputs)
#   * configmap/frontend-config  — non-secret frontend config
#   * secret/backend-secrets     — the database connection string (sensitive)
#
# Design:
#   * Non-secret values are read straight from `terraform output` for the target
#     environment, so they never have to be copied by hand.
#   * The one sensitive value that is NOT a Terraform output — the database
#     password — is read from the DB_PASSWORD environment variable and only ever
#     placed into a Kubernetes Secret. It is never written to disk or Git.
#   * Objects are applied with `kubectl ... --dry-run=client -o yaml | kubectl
#     apply -f -`, so the script is idempotent: re-running it updates the values
#     in place.
#
# Prerequisites: terraform (with the environment already applied so outputs exist),
# aws, and kubectl on PATH, plus AWS credentials for the target account.
#
# Usage:
#   DB_PASSWORD='<rds-master-password>' scripts/deployment/bootstrap-config.sh [dev|prod]

set -euo pipefail

ENVIRONMENT="${1:-dev}"
NAMESPACE="hosting-platform"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform/environments/${ENVIRONMENT}"

if [ ! -d "$TF_DIR" ]; then
  echo "error: unknown environment '${ENVIRONMENT}' (expected dev or prod)" >&2
  exit 1
fi

# The DB password is intentionally NOT a Terraform output; supply it out-of-band.
: "${DB_PASSWORD:?Set DB_PASSWORD (the RDS master password) in the environment}"

# Fail fast on characters that RDS forbids (/ @ " space) or that would silently
# corrupt the Npgsql connection string built below (; ' =). A literal '=' inside
# an ADO.NET-style value mis-parses as a key/value separator. Mirrors the
# Terraform db_password validation — see docs/16-deployment.md "Which values
# must be supplied manually".
if printf '%s' "$DB_PASSWORD" | grep -q "[;'\"@/= ]"; then
  echo "error: DB_PASSWORD contains a disallowed character (; ' \" @ / = or space)." >&2
  echo "       Use letters, digits and: ! # \$ % ^ & * ( ) _ + . , : ? ~ -" >&2
  exit 1
fi

tf() { terraform -chdir="$TF_DIR" output -raw "$1"; }

echo "Reading Terraform outputs for '${ENVIRONMENT}'..."
AWS_REGION="$(tf aws_region)"
CLUSTER_NAME="$(tf eks_cluster_name)"
BUCKET_NAME="$(tf s3_bucket_name)"
CF_DISTRIBUTION_ID="$(tf cloudfront_distribution_id)"
CF_DOMAIN="$(tf cloudfront_domain_name)"
DB_ENDPOINT="$(tf rds_database_endpoint)" # host:port
DB_NAME="$(tf rds_database_name)"
DB_USERNAME="$(tf rds_database_username)"

# The RDS endpoint output is "address:port"; split it for the connection string.
DB_HOST="${DB_ENDPOINT%%:*}"
DB_PORT="${DB_ENDPOINT##*:}"
if [ "$DB_PORT" = "$DB_ENDPOINT" ]; then
  DB_PORT="5432"
fi

CONNECTION_STRING="Host=${DB_HOST};Port=${DB_PORT};Database=${DB_NAME};Username=${DB_USERNAME};Password=${DB_PASSWORD}"

# Target the environment's cluster (idempotent).
echo "Configuring kubectl for '${CLUSTER_NAME}'..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null

# The namespace must exist before the ConfigMaps/Secret. deploy.yml also applies it
# on every run; applying it here (idempotent) lets the bootstrap run first.
kubectl apply -f "${REPO_ROOT}/k8s/base/namespace.yaml"

echo "Applying backend-config..."
kubectl create configmap backend-config -n "$NAMESPACE" \
  --from-literal=ASPNETCORE_ENVIRONMENT="Production" \
  --from-literal=AWS__Region="$AWS_REGION" \
  --from-literal=AWS__BucketName="$BUCKET_NAME" \
  --from-literal=AWS__CloudFrontDistributionId="$CF_DISTRIBUTION_ID" \
  --from-literal=AWS__CloudFrontDomain="$CF_DOMAIN" \
  --from-literal=Authentication__CookieName="HostingPlatform.Auth" \
  --from-literal=Authentication__ExpireDays="7" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying frontend-config..."
kubectl create configmap frontend-config -n "$NAMESPACE" \
  --from-literal=NODE_ENV="production" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying backend-secrets..."
kubectl create secret generic backend-secrets -n "$NAMESPACE" \
  --from-literal=ConnectionStrings__DefaultConnection="$CONNECTION_STRING" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Done. backend-config, frontend-config and backend-secrets are present in '${NAMESPACE}' (env: ${ENVIRONMENT})."
