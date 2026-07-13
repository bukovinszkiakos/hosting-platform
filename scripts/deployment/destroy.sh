#!/usr/bin/env bash
#
# Reliable, single-command teardown of an environment (see docs/16-deployment.md
# "Cost and teardown"). It automates the documented teardown ORDER with real
# waits, so a normal run needs no manual AWS cleanup.
#
# Why a wrapper (and not `terraform destroy` alone): the Application Load Balancer
# and the security groups it uses are created by the AWS Load Balancer Controller
# INSIDE Kubernetes, not by Terraform — they are absent from Terraform state, so
# Terraform has no dependency edge to them. If `terraform destroy` runs first it
# races ahead of AWS's asynchronous ALB teardown and fails with DependencyViolation
# on the subnets / Internet Gateway / VPC, and orphan security groups survive.
# The fix is ORDER + WAITING, which Terraform cannot express for resources it does
# not manage. This script enforces it:
#
#   1. delete the Ingress   (controller then deletes the ALB + its own SGs)
#   2. wait for the ALB to actually disappear   (with a direct-delete fallback)
#   3. wait for / sweep the controller's leftover SGs   (tag-scoped, safe)
#   4. empty the hosting bucket   (belt-and-suspenders; force_destroy also covers it)
#   5. terraform destroy   (VPC now has no dangling external references)
#   6. verify nothing billable survived
#
# State locks (S3 native locking, use_lockfile): an interrupted run can leave a
# stale <key>.tflock object. This script DETECTS it and prints the exact recovery
# command; it only force-unlocks when you pass --force-unlock (never silently —
# that would be unsafe if another operator is mid-run).
#
# Prerequisites: aws, kubectl, terraform on PATH; AWS credentials for the account.
#
# Usage:
#   scripts/deployment/destroy.sh [dev|prod] [--force-unlock] [--auto-approve]

set -euo pipefail

ENVIRONMENT="dev"
FORCE_UNLOCK=false
AUTO_APPROVE=false
for arg in "$@"; do
  case "$arg" in
    dev | prod) ENVIRONMENT="$arg" ;;
    --force-unlock) FORCE_UNLOCK=true ;;
    --auto-approve) AUTO_APPROVE=true ;;
    *)
      echo "error: unknown argument '${arg}' (usage: destroy.sh [dev|prod] [--force-unlock] [--auto-approve])" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform/environments/${ENVIRONMENT}"

if [ ! -d "$TF_DIR" ]; then
  echo "error: unknown environment '${ENVIRONMENT}' (expected dev or prod)" >&2
  exit 1
fi

tf_out() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true; }

echo "=== Teardown for environment '${ENVIRONMENT}' ==="
AWS_REGION="$(tf_out aws_region)"
CLUSTER_NAME="$(tf_out eks_cluster_name)"
VPC_ID="$(tf_out vpc_id)"
BUCKET_NAME="$(tf_out s3_bucket_name)"
: "${AWS_REGION:=eu-central-1}"

echo "  region:  ${AWS_REGION}"
echo "  cluster: ${CLUSTER_NAME:-<none in state>}"
echo "  vpc:     ${VPC_ID:-<none in state>}"
echo "  bucket:  ${BUCKET_NAME:-<none in state>}"

# ---- helpers ---------------------------------------------------------------

# ALB ARNs that live in this environment's VPC.
vpc_alb_arns() {
  [ -n "$VPC_ID" ] || return 0
  aws elbv2 describe-load-balancers --region "$AWS_REGION" \
    --query "LoadBalancers[?VpcId=='${VPC_ID}'].LoadBalancerArn" --output text 2>/dev/null || true
}

# Security groups the AWS Load Balancer Controller created for this cluster
# (tag-scoped: Terraform-managed SGs are never matched, so this is safe).
controller_sg_ids() {
  [ -n "$VPC_ID" ] && [ -n "$CLUSTER_NAME" ] || return 0
  aws ec2 describe-security-groups --region "$AWS_REGION" \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    "Name=tag:elbv2.k8s.aws/cluster,Values=${CLUSTER_NAME}" \
    --query "SecurityGroups[].GroupId" --output text 2>/dev/null || true
}

# ---- 0. stale state-lock detection ----------------------------------------

STATE_BUCKET="hosting-platform-tfstate"
LOCK_KEY="${ENVIRONMENT}/terraform.tfstate.tflock"
if aws s3api head-object --bucket "$STATE_BUCKET" --key "$LOCK_KEY" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo ""
  echo "WARNING: a Terraform state lock object exists (s3://${STATE_BUCKET}/${LOCK_KEY})."
  if [ "$FORCE_UNLOCK" = true ]; then
    LOCK_ID="$(aws s3 cp "s3://${STATE_BUCKET}/${LOCK_KEY}" - --region "$AWS_REGION" 2>/dev/null \
      | grep -o '"ID"[^,}]*' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]+)".*/\1/')"
    if [ -n "$LOCK_ID" ]; then
      echo "  --force-unlock given: releasing lock ID ${LOCK_ID}..."
      terraform -chdir="$TF_DIR" force-unlock -force "$LOCK_ID"
    else
      echo "  could not parse the lock ID; release manually before destroy:" >&2
      echo "    terraform -chdir=${TF_DIR} force-unlock <LOCK_ID>" >&2
    fi
  else
    echo "  If no other run is active this is stale. Re-run with --force-unlock, or:"
    echo "    terraform -chdir=${TF_DIR} force-unlock <LOCK_ID>"
    echo "  Continuing with cluster/ALB cleanup (that does not touch Terraform state)..."
  fi
fi

# ---- 1. delete the Ingress while the controller is still alive -------------

if [ -n "$CLUSTER_NAME" ] && aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo ""
  echo "[1/6] Deleting the Ingress so the controller removes the ALB it created..."
  aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1 || true
  kubectl -n hosting-platform delete ingress hosting-platform --ignore-not-found --wait=false 2>/dev/null || true
else
  echo ""
  echo "[1/6] Cluster not present — skipping Ingress deletion (will clean up any orphaned ALB/SGs directly)."
fi

# ---- 2. wait for the ALB to disappear (direct-delete fallback) -------------

echo "[2/6] Waiting for the ALB in ${VPC_ID:-the VPC} to be deleted..."
DELETED_DIRECTLY=false
for attempt in $(seq 1 40); do # ~10 min max (40 x 15s)
  arns="$(vpc_alb_arns)"
  if [ -z "$arns" ]; then
    echo "  ALB gone."
    break
  fi
  # Fallback: if the controller is not deleting it (e.g. already uninstalled or
  # orphaned), delete the ALB directly after a short grace period.
  if [ "$DELETED_DIRECTLY" = false ] && [ "$attempt" -ge 8 ]; then
    echo "  ALB still present after grace period — deleting it directly..."
    for arn in $arns; do
      aws elbv2 delete-load-balancer --load-balancer-arn "$arn" --region "$AWS_REGION" 2>/dev/null || true
    done
    DELETED_DIRECTLY=true
  fi
  [ "$attempt" -eq 40 ] && {
    echo "error: ALB still present after timeout; inspect: aws elbv2 describe-load-balancers" >&2
    exit 1
  }
  sleep 15
done

# ---- 3. wait for / sweep the controller's leftover security groups ---------

echo "[3/6] Removing the controller's leftover security groups (tag-scoped)..."
for attempt in $(seq 1 20); do # ~5 min max — absorbs ENI-detachment lag
  sgs="$(controller_sg_ids)"
  if [ -z "$sgs" ]; then
    echo "  No controller security groups remain."
    break
  fi
  for sg in $sgs; do
    aws ec2 delete-security-group --group-id "$sg" --region "$AWS_REGION" 2>/dev/null \
      && echo "  deleted ${sg}" \
      || echo "  ${sg} not yet deletable (ENIs detaching) — will retry"
  done
  [ "$attempt" -eq 20 ] && {
    echo "error: controller security groups still present after timeout: $(controller_sg_ids)" >&2
    exit 1
  }
  sleep 15
done

# ---- 4. empty the hosting bucket (safety net) ------------------------------

if [ -n "$BUCKET_NAME" ] && aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "[4/6] Emptying the hosting bucket s3://${BUCKET_NAME} (force_destroy also covers this)..."
  aws s3 rm "s3://${BUCKET_NAME}" --recursive --region "$AWS_REGION" >/dev/null 2>&1 || true
else
  echo "[4/6] Hosting bucket not present — nothing to empty."
fi

# ---- 5. terraform destroy --------------------------------------------------

echo "[5/6] Running terraform destroy..."
DESTROY_ARGS=()
[ "$AUTO_APPROVE" = true ] && DESTROY_ARGS+=(-auto-approve)
if [ -z "${TF_VAR_db_password:-}" ]; then
  # db_password has no default; destroy still evaluates variables. Supply a
  # throwaway value so destroy never blocks on a prompt (the RDS instance is
  # being deleted, so the value is irrelevant).
  export TF_VAR_db_password="Destroy.Placeholder.123"
fi
terraform -chdir="$TF_DIR" destroy "${DESTROY_ARGS[@]}"

# ---- 6. verify nothing billable survived -----------------------------------

echo "[6/6] Post-destroy verification..."
REMAINING_ALB="$(vpc_alb_arns)"
REMAINING_SG="$(controller_sg_ids)"
if [ -z "$REMAINING_ALB" ] && [ -z "$REMAINING_SG" ]; then
  echo "  Clean: no ALB or controller security groups remain for '${ENVIRONMENT}'."
else
  echo "  WARNING: leftovers detected — ALB='${REMAINING_ALB}' SG='${REMAINING_SG}'" >&2
  exit 1
fi

echo "=== Teardown of '${ENVIRONMENT}' complete. ==="
echo "Note: the remote-state bucket (${STATE_BUCKET}) is intentionally preserved."
