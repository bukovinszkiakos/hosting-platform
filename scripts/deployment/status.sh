#!/usr/bin/env bash
#
# status.sh — one-glance health board for a deployed environment.
#
# Aggregates state that is otherwise scattered across `terraform output`,
# `aws eks`, `kubectl`, `aws elbv2`, `aws cloudfront` and `aws rds` into a single
# human-readable dashboard answering: is the platform up, is it healthy, what
# version is live, and what is the URL? It is READ-ONLY — it never changes any
# resource — so it doubles as the "doctor" for a misbehaving environment.
#
# Usage:
#   scripts/deployment/status.sh [dev|prod]

set -euo pipefail

ENVIRONMENT="${1:-dev}"
NAMESPACE="hosting-platform"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform/environments/${ENVIRONMENT}"
[ -d "$TF_DIR" ] || { echo "error: unknown environment '${ENVIRONMENT}'" >&2; exit 1; }

tf_out() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true; }
ok()   { printf '  \033[32m✓\033[0m %-16s %s\n' "$1" "$2"; }
bad()  { printf '  \033[31m✗\033[0m %-16s %s\n' "$1" "$2"; }
warn() { printf '  \033[33m!\033[0m %-16s %s\n' "$1" "$2"; }
row()  { # label  value  good_regex
  if [ -n "$2" ] && printf '%s' "$2" | grep -Eq "$3"; then ok "$1" "$2"; else
    [ -z "$2" ] && bad "$1" "<none>" || warn "$1" "$2"; fi
}

REGION="$(tf_out aws_region)"; REGION="${REGION:-${AWS_REGION:-eu-central-1}}"
CLUSTER_NAME="$(tf_out eks_cluster_name)"
VPC_ID="$(tf_out vpc_id)"
PLATFORM_DOMAIN="$(tf_out platform_cloudfront_domain_name)"
PLATFORM_ID="$(tf_out platform_cloudfront_distribution_id)"
PLATFORM_URL=""; [ -n "$PLATFORM_DOMAIN" ] && PLATFORM_URL="https://${PLATFORM_DOMAIN}"

printf '\n\033[1m===== Hosting Platform status — %s (%s) =====\033[0m\n' "$ENVIRONMENT" "$REGION"

# --- Terraform --------------------------------------------------------------
printf '\nTerraform\n'
if [ -n "$CLUSTER_NAME" ]; then
  ok "state" "outputs present (cluster ${CLUSTER_NAME})"
else
  bad "state" "no outputs — environment not applied"
  echo; echo "Nothing deployed for '${ENVIRONMENT}'. Run: scripts/deployment/up.sh ${ENVIRONMENT}"
  exit 0
fi

# --- EKS + nodes ------------------------------------------------------------
printf '\nKubernetes\n'
CL_STATUS="$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" --query 'cluster.status' --output text 2>/dev/null || true)"
row "cluster" "${CL_STATUS:-}" '^ACTIVE$'
if aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1; then
  NODES_READY="$(kubectl get nodes --no-headers 2>/dev/null | grep -c ' Ready ' || true)"
  NODES_TOTAL="$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ' || true)"
  row "nodes" "${NODES_READY:-0}/${NODES_TOTAL:-0} Ready" '^([1-9][0-9]*)/\1 '
else
  bad "nodes" "cannot reach the cluster API"
fi

# --- Workloads --------------------------------------------------------------
printf '\nWorkloads (ns: %s)\n' "$NAMESPACE"
for d in backend frontend; do
  ready="$(kubectl -n "$NAMESPACE" get deploy "$d" -o jsonpath='{.status.readyReplicas}/{.spec.replicas}' 2>/dev/null || true)"
  img="$(kubectl -n "$NAMESPACE" get deploy "$d" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"
  sha="${img##*:}"
  if [ -n "$ready" ] && [ "${ready%%/*}" = "${ready##*/}" ] && [ "${ready%%/*}" != "" ] && [ "${ready%%/*}" != "0" ]; then
    ok "$d" "${ready} ready   (version ${sha:-?})"
  else
    bad "$d" "${ready:-not deployed} ready   (version ${sha:-?})"
  fi
done

# --- ALB --------------------------------------------------------------------
printf '\nLoad balancer\n'
ALB_HOST="$(kubectl -n "$NAMESPACE" get ingress hosting-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
if [ -n "$ALB_HOST" ]; then
  ALB_STATE="$(aws elbv2 describe-load-balancers --region "$REGION" --query "LoadBalancers[?DNSName=='${ALB_HOST}'].State.Code" --output text 2>/dev/null || true)"
  row "alb" "${ALB_STATE:-unknown} (${ALB_HOST})" 'active'
else
  bad "alb" "no ingress address yet"
fi

# --- Platform CloudFront ----------------------------------------------------
printf '\nCloudFront (platform)\n'
if [ -n "$PLATFORM_ID" ]; then
  CF_STATUS="$(aws cloudfront get-distribution --id "$PLATFORM_ID" --query 'Distribution.Status' --output text 2>/dev/null || true)"
  row "distribution" "${CF_STATUS:-unknown}" '^Deployed$'
else
  warn "distribution" "not created (run full up.sh to complete the two-phase apply)"
fi

# --- RDS --------------------------------------------------------------------
printf '\nDatabase\n'
RDS_STATE="$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "hosting-platform-${ENVIRONMENT}-postgres" --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || true)"
row "rds" "${RDS_STATE:-unknown}" '^available$'

# --- Health -----------------------------------------------------------------
printf '\nHealth\n'
if [ -n "$PLATFORM_URL" ]; then
  hr="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "${PLATFORM_URL}/" || echo 000)"
  ha="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "${PLATFORM_URL}/api/auth/me" || echo 000)"
  if [ "$hr" = "200" ] && [ "$ha" = "401" ]; then
    ok "endpoint" "/ → 200   /api/auth/me → 401"
  else
    warn "endpoint" "/ → ${hr}   /api/auth/me → ${ha}  (CloudFront may still be propagating)"
  fi
  printf '\n  Platform URL   %s\n' "$PLATFORM_URL"
else
  warn "endpoint" "no platform URL yet"
fi
echo
