#!/usr/bin/env bash
#
# up.sh — the official supported deployment workflow for the hosting platform.
#
# From an empty AWS account (Terraform remote-state bucket aside) this brings the
# platform to a live, verified state with one command:
#
#     export … not required — the DB password comes from SSM (see Phase 0)
#     scripts/deployment/up.sh dev
#
# It ORCHESTRATES the existing, proven building blocks (terraform, the
# install-alb-controller.sh / bootstrap-config.sh scripts, deploy.yml) in the
# order the architecture requires, with real waits and fail-fast error handling.
# It does NOT reimplement their logic and it never applies Kubernetes app
# manifests itself — GitHub Actions (deploy.yml) remains the deployment mechanism
# and Terraform remains the infrastructure source of truth.
#
# Design principles (see docs/16-deployment.md "One-command deploy (up.sh)"):
#   * Idempotency IS the recovery model — every phase detects its done-state and
#     no-ops if already satisfied, so the fix for any failure is: resolve the
#     cause, re-run up.sh. There is NO rollback; nothing is ever auto-destroyed.
#   * Fail fast, never half-succeed silently.
#   * No hidden magic — every external command is visible; the machine-managed
#     alb_dns_name lives in a gitignored *.auto.tfvars, not buried in state.
#
# Database password: the RDS master password is stored write-once in SSM
# Parameter Store as a SecureString and is the canonical source of truth. It is
# read ONCE here and injected into both Terraform and bootstrap-config; it is
# never exported into the caller's interactive shell and never written to disk.
#
# Usage:
#   scripts/deployment/up.sh <dev|prod> [--app] [--auto-approve] [--verbose]
#
#   --app           Application-only redeploy (build+push image, trigger
#                   deploy.yml, verify). Skips infra/controller/config/CloudFront.
#   --auto-approve  Pass -auto-approve to terraform and skip interactive pauses.
#   --verbose       set -x tracing.

set -euo pipefail

# --------------------------------------------------------------------------- #
# Argument parsing
# --------------------------------------------------------------------------- #
ENVIRONMENT=""
APP_ONLY=false
AUTO_APPROVE=false
for arg in "$@"; do
  case "$arg" in
    dev | prod) ENVIRONMENT="$arg" ;;
    --app) APP_ONLY=true ;;
    --auto-approve) AUTO_APPROVE=true ;;
    --verbose) set -x ;;
    -h | --help)
      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "error: unknown argument '${arg}'" >&2
      echo "usage: up.sh <dev|prod> [--app] [--auto-approve] [--verbose]" >&2
      exit 1
      ;;
  esac
done
ENVIRONMENT="${ENVIRONMENT:-dev}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform/environments/${ENVIRONMENT}"
AUTO_TFVARS="${TF_DIR}/alb_dns_name.auto.tfvars"
NAMESPACE="hosting-platform"
DEPLOY_USER="hosting-platform-deploy"
STATE_BUCKET="hosting-platform-tfstate"
SSM_PARAM="/hosting-platform/${ENVIRONMENT}/db_password"

[ -d "$TF_DIR" ] || { echo "error: unknown environment '${ENVIRONMENT}'" >&2; exit 1; }

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
banner() { printf '\n\033[1m========== [%s] %s ==========\033[0m\n' "$1" "$2"; }
info()   { printf '  %s\n' "$1"; }
ok()     { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn()   { printf '  \033[33m!\033[0m %s\n' "$1" >&2; }
die()    { printf '\n\033[31mERROR (phase %s): %s\033[0m\n' "$1" "$2" >&2; exit 1; }
have()   { command -v "$1" >/dev/null 2>&1; }
tf_out() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true; }

# retry <attempts> <sleep_seconds> <cmd...>
retry() {
  local attempts="$1" delay="$2"; shift 2
  local i
  for ((i = 1; i <= attempts; i++)); do
    if "$@"; then return 0; fi
    [ "$i" -lt "$attempts" ] && { warn "attempt ${i}/${attempts} failed; retrying in ${delay}s…"; sleep "$delay"; }
  done
  return 1
}

resolve_region() {
  if [ -n "${AWS_REGION:-}" ]; then echo "$AWS_REGION"; return; fi
  local r
  r="$(tf_out aws_region)"
  [ -n "$r" ] && { echo "$r"; return; }
  r="$(awk -F'"' '/^[[:space:]]*aws_region/ {print $2; exit}' "${TF_DIR}/terraform.tfvars" 2>/dev/null || true)"
  echo "${r:-eu-central-1}"
}

# --------------------------------------------------------------------------- #
# Phase 0 — Preflight
# --------------------------------------------------------------------------- #
banner "0/9" "Preflight"

MISSING=""
for t in aws terraform kubectl docker; do have "$t" || MISSING="${MISSING} ${t}"; done
[ "$APP_ONLY" = true ] || { have helm || MISSING="${MISSING} helm"; }
[ -n "$MISSING" ] && die 0 "missing required tools:${MISSING}"
ok "required tools present"

GH_AVAILABLE=false
if have gh && gh auth status >/dev/null 2>&1; then
  GH_AVAILABLE=true; ok "gh CLI authenticated"
else
  warn "gh CLI not available/authenticated — Phase 6 will print manual dispatch instructions"
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
[ -n "$ACCOUNT_ID" ] || die 0 "AWS credentials not valid (aws sts get-caller-identity failed). Run 'aws configure' / 'aws sso login'."
ok "AWS account ${ACCOUNT_ID}"

REGION="$(resolve_region)"
ok "region ${REGION}"

aws s3api head-bucket --bucket "$STATE_BUCKET" --region "$REGION" >/dev/null 2>&1 \
  || die 0 "Terraform state bucket '${STATE_BUCKET}' not found. Run scripts/terraform/bootstrap-remote-state.sh first."
ok "remote state bucket '${STATE_BUCKET}' reachable"

# --- SSM SecureString password (write-once source of truth) --------------- #
# Only needed for the full workflow (terraform apply + bootstrap-config).
DB_PW=""
if [ "$APP_ONLY" = false ]; then
  if DB_PW="$(aws ssm get-parameter --name "$SSM_PARAM" --with-decryption \
        --query 'Parameter.Value' --output text --region "$REGION" 2>/dev/null)" && [ -n "$DB_PW" ]; then
    ok "DB password loaded from SSM (${SSM_PARAM})"
  else
    warn "no SSM parameter at ${SSM_PARAM} — first run: creating it now"
    printf '  Enter a new RDS master password for %s (input hidden): ' "$ENVIRONMENT" >&2
    read -rs DB_PW; echo >&2
    [ -n "$DB_PW" ] || die 0 "empty password"
    # Same charset rule Terraform + bootstrap-config enforce.
    if printf '%s' "$DB_PW" | grep -q "[;'\"@/= ]"; then
      die 0 "password contains a disallowed character (; ' \" @ / = or space). Use letters, digits and ! # \$ % ^ & * ( ) _ + . , : ? ~ -"
    fi
    [ "${#DB_PW}" -ge 8 ] || die 0 "password must be at least 8 characters"
    # WRITE-ONCE: no --overwrite, so this fails if the parameter already exists.
    aws ssm put-parameter --name "$SSM_PARAM" --type SecureString \
      --value "$DB_PW" --region "$REGION" \
      --description "RDS master password for hosting-platform ${ENVIRONMENT} (write-once)" >/dev/null \
      || die 0 "failed to create SSM parameter ${SSM_PARAM}"
    ok "created write-once SSM parameter ${SSM_PARAM}"
  fi
fi

# --- --app mode: verify infrastructure already exists --------------------- #
if [ "$APP_ONLY" = true ]; then
  CLUSTER_NAME="$(tf_out eks_cluster_name)"
  [ -n "$CLUSTER_NAME" ] && aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1 \
    || die 0 "--app requires an existing environment, but no cluster was found. Run 'up.sh ${ENVIRONMENT}' (full) first."
  aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1 || true
  kubectl -n "$NAMESPACE" get configmap backend-config >/dev/null 2>&1 \
    || die 0 "--app requires bootstrap config to exist. Run 'up.sh ${ENVIRONMENT}' (full) first."
  ok "existing infrastructure detected (--app mode)"
fi

# =========================================================================== #
# Phase 1 — Terraform apply (infrastructure)   [skipped in --app]
# =========================================================================== #
if [ "$APP_ONLY" = false ]; then
  banner "1/9" "Terraform apply (infrastructure)"
  # Machine-managed: force the platform-CloudFront module OFF for the first apply
  # (the ALB does not exist yet). Phase 8 rewrites this with the real hostname.
  printf '# Managed by scripts/deployment/up.sh — do not edit or commit.\nalb_dns_name = ""\n' > "$AUTO_TFVARS"
  info "wrote ${AUTO_TFVARS} (alb_dns_name = \"\")"

  terraform -chdir="$TF_DIR" init -input=false >/dev/null || die 1 "terraform init failed"
  APPLY_ARGS=(-input=false)
  [ "$AUTO_APPROVE" = true ] && APPLY_ARGS+=(-auto-approve)
  # NOTE: interactive approval is the default so an operator sees any unexpected
  # plan (e.g. an RDS replacement, which ignore_changes[password] does not guard).
  TF_VAR_db_password="$DB_PW" terraform -chdir="$TF_DIR" apply "${APPLY_ARGS[@]}" \
    || die 1 "terraform apply failed. If it is a state-lock, release with 'terraform -chdir=${TF_DIR} force-unlock <ID>' (only if no other run is active), then re-run up.sh."
  ok "infrastructure applied"
else
  banner "1/9" "Terraform apply — skipped (--app)"
fi

# Outputs needed downstream (available after Phase 1, or from prior state in --app)
CLUSTER_NAME="$(tf_out eks_cluster_name)"
BACKEND_REPO="$(tf_out ecr_backend_repository_url)"
FRONTEND_REPO="$(tf_out ecr_frontend_repository_url)"
[ -n "$CLUSTER_NAME" ] || die 1 "eks_cluster_name output missing — infrastructure not applied?"
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1 || true

# =========================================================================== #
# Phase 2 — AWS Load Balancer Controller   [skipped in --app]
# =========================================================================== #
if [ "$APP_ONLY" = false ]; then
  banner "2/9" "Install AWS Load Balancer Controller"
  retry 2 15 "${SCRIPT_DIR}/install-alb-controller.sh" "$ENVIRONMENT" \
    || die 2 "ALB controller install failed. Inspect: kubectl -n kube-system get pods; logs deploy/aws-load-balancer-controller."
  kubectl -n kube-system rollout status deploy/aws-load-balancer-controller --timeout=300s >/dev/null 2>&1 || true
  ok "aws-load-balancer-controller ready"
else
  banner "2/9" "ALB controller — skipped (--app)"
fi

# =========================================================================== #
# Phase 3 — Build & push images
# =========================================================================== #
banner "3/9" "Build & push images"
[ -n "$BACKEND_REPO" ] && [ -n "$FRONTEND_REPO" ] || die 3 "ECR repository outputs missing."

TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
if [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]; then
  warn "working tree is dirty — image ${TAG} will not exactly match a clean commit"
fi
BACKEND_IMAGE="${BACKEND_REPO}:${TAG}"
FRONTEND_IMAGE="${FRONTEND_REPO}:${TAG}"

image_exists() { # repo_uri tag
  local name="${1##*/}"
  aws ecr describe-images --repository-name "$name" --image-ids imageTag="$2" \
    --region "$REGION" >/dev/null 2>&1
}

if image_exists "$BACKEND_REPO" "$TAG" && image_exists "$FRONTEND_REPO" "$TAG"; then
  ok "images for ${TAG} already in ECR — skipping build/push (idempotent)"
else
  info "authenticating docker to ECR…"
  retry 2 5 bash -c "aws ecr get-login-password --region '$REGION' | docker login --username AWS --password-stdin '${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com'" \
    || die 3 "ECR docker login failed"

  for pair in "backend ${BACKEND_REPO} ${REPO_ROOT}/backend" "frontend ${FRONTEND_REPO} ${REPO_ROOT}/frontend"; do
    set -- $pair; comp="$1"; repo="$2"; ctx="$3"
    if image_exists "$repo" "$TAG"; then
      ok "${comp}:${TAG} already present — skipping"
      continue
    fi
    info "building ${comp} (linux/amd64)…"
    retry 3 10 docker build --platform linux/amd64 -t "${repo}:${TAG}" "$ctx" \
      || die 3 "docker build (${comp}) failed — fix the Dockerfile/build and re-run"
    info "pushing ${comp}…"
    # A concurrent build may have pushed the immutable tag first; treat that as success.
    if ! retry 2 5 docker push "${repo}:${TAG}"; then
      image_exists "$repo" "$TAG" || die 3 "docker push (${comp}) failed"
    fi
    ok "${comp}:${TAG} pushed"
  done
fi

# =========================================================================== #
# Phase 4 — Bootstrap config (ConfigMaps + Secret)   [skipped in --app]
# =========================================================================== #
if [ "$APP_ONLY" = false ]; then
  banner "4/9" "Bootstrap ConfigMaps + Secret"
  DB_PASSWORD="$DB_PW" "${SCRIPT_DIR}/bootstrap-config.sh" "$ENVIRONMENT" >/dev/null \
    || die 4 "bootstrap-config failed"
  ok "backend-config, frontend-config, backend-secrets applied"
else
  banner "4/9" "Bootstrap config — skipped (--app)"
fi

# =========================================================================== #
# Phase 5 — EKS access entry for the deploy principal   [skipped in --app]
# =========================================================================== #
if [ "$APP_ONLY" = false ]; then
  banner "5/9" "EKS access entry for ${DEPLOY_USER}"
  PRINCIPAL="arn:aws:iam::${ACCOUNT_ID}:user/${DEPLOY_USER}"
  if aws eks list-access-entries --cluster-name "$CLUSTER_NAME" --region "$REGION" \
        --query 'accessEntries' --output text 2>/dev/null | grep -q "$PRINCIPAL"; then
    ok "access entry already present"
  else
    retry 5 8 aws eks create-access-entry --cluster-name "$CLUSTER_NAME" --region "$REGION" \
      --principal-arn "$PRINCIPAL" >/dev/null 2>&1 || true
    aws eks associate-access-policy --cluster-name "$CLUSTER_NAME" --region "$REGION" \
      --principal-arn "$PRINCIPAL" \
      --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
      --access-scope type=cluster >/dev/null 2>&1 || true
    aws eks list-access-entries --cluster-name "$CLUSTER_NAME" --region "$REGION" \
      --query 'accessEntries' --output text 2>/dev/null | grep -q "$PRINCIPAL" \
      || die 5 "could not create the EKS access entry for ${DEPLOY_USER}"
    ok "access entry created"
  fi
else
  banner "5/9" "EKS access entry — skipped (--app)"
fi

# =========================================================================== #
# Phase 6 — Trigger & watch deploy.yml (GitHub Actions)
# =========================================================================== #
banner "6/9" "Deploy via GitHub Actions (deploy.yml)"
if [ "$GH_AVAILABLE" = true ]; then
  info "dispatching deploy.yml (environment=${ENVIRONMENT})…"
  gh workflow run deploy.yml \
    -f environment="$ENVIRONMENT" \
    -f backend_image="$BACKEND_IMAGE" \
    -f frontend_image="$FRONTEND_IMAGE" \
    --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo '')" 2>/dev/null \
    || gh workflow run deploy.yml -f environment="$ENVIRONMENT" -f backend_image="$BACKEND_IMAGE" -f frontend_image="$FRONTEND_IMAGE" \
    || die 6 "failed to dispatch deploy.yml"
  sleep 6
  RUN_ID="$(gh run list --workflow=deploy.yml -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
  [ -n "$RUN_ID" ] || die 6 "could not find the dispatched run; check: gh run list --workflow=deploy.yml"
  info "watching run ${RUN_ID}…"
  gh run watch "$RUN_ID" --exit-status \
    || die 6 "deploy.yml failed. Inspect: gh run view ${RUN_ID} --log-failed  (and: scripts/deployment/logs.sh backend)"
  ok "deploy.yml run ${RUN_ID} succeeded"
else
  cat >&2 <<EOF
  gh is unavailable. Trigger the deployment manually, then re-run 'up.sh ${ENVIRONMENT} --app'
  (or press Enter here once it has completed):

    gh workflow run deploy.yml -f environment=${ENVIRONMENT} \\
      -f backend_image=${BACKEND_IMAGE} \\
      -f frontend_image=${FRONTEND_IMAGE}

  …or via GitHub → Actions → "Deploy (manual)" → Run workflow with those inputs.
EOF
  if [ "$AUTO_APPROVE" = true ]; then
    die 6 "gh unavailable and --auto-approve set (non-interactive): dispatch deploy.yml manually, then re-run with --app."
  fi
  read -r -p "  Press Enter once deploy.yml has completed successfully… " _
fi
kubectl -n "$NAMESPACE" rollout status deploy/backend --timeout=180s >/dev/null 2>&1 || true
kubectl -n "$NAMESPACE" rollout status deploy/frontend --timeout=180s >/dev/null 2>&1 || true

# =========================================================================== #
# Phase 7 — Wait for the ALB
# =========================================================================== #
banner "7/9" "Wait for the ALB"
ALB_HOST=""
for i in $(seq 1 40); do
  ALB_HOST="$(kubectl -n "$NAMESPACE" get ingress hosting-platform \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  [ -n "$ALB_HOST" ] && break
  [ "$i" -eq 40 ] && die 7 "ALB never appeared. Inspect: kubectl -n ${NAMESPACE} describe ingress hosting-platform; kubectl -n kube-system logs deploy/aws-load-balancer-controller"
  sleep 15
done
ok "ALB: ${ALB_HOST}"
# Confirm it is active (best-effort).
for i in $(seq 1 20); do
  STATE="$(aws elbv2 describe-load-balancers --region "$REGION" \
    --query "LoadBalancers[?DNSName=='${ALB_HOST}'].State.Code" --output text 2>/dev/null || true)"
  [ "$STATE" = "active" ] && { ok "ALB state: active"; break; }
  sleep 15
done

# =========================================================================== #
# Phase 8 — Second Terraform apply (platform CloudFront)   [skipped in --app]
# =========================================================================== #
if [ "$APP_ONLY" = false ]; then
  banner "8/9" "Terraform apply (platform CloudFront)"
  printf '# Managed by scripts/deployment/up.sh — do not edit or commit.\nalb_dns_name = "%s"\n' "$ALB_HOST" > "$AUTO_TFVARS"
  info "wrote ${AUTO_TFVARS} (alb_dns_name = \"${ALB_HOST}\")"
  APPLY_ARGS=(-input=false)
  [ "$AUTO_APPROVE" = true ] && APPLY_ARGS+=(-auto-approve)
  TF_VAR_db_password="$DB_PW" terraform -chdir="$TF_DIR" apply "${APPLY_ARGS[@]}" \
    || die 8 "second terraform apply (platform CloudFront) failed — re-run up.sh (idempotent)."
  ok "platform CloudFront applied"
else
  banner "8/9" "Platform CloudFront apply — skipped (--app)"
fi

# =========================================================================== #
# Phase 9 — Verify & summarize
# =========================================================================== #
banner "9/9" "Verify & summarize"
PLATFORM_DOMAIN="$(tf_out platform_cloudfront_domain_name)"
PLATFORM_URL=""
[ -n "$PLATFORM_DOMAIN" ] && PLATFORM_URL="https://${PLATFORM_DOMAIN}"

be_state="$(kubectl -n "$NAMESPACE" get deploy backend  -o jsonpath='{.status.readyReplicas}/{.spec.replicas}' 2>/dev/null || echo '?')"
fe_state="$(kubectl -n "$NAMESPACE" get deploy frontend -o jsonpath='{.status.readyReplicas}/{.spec.replicas}' 2>/dev/null || echo '?')"
be_img="$(kubectl -n "$NAMESPACE" get deploy backend  -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"; be_sha="${be_img##*:}"
fe_img="$(kubectl -n "$NAMESPACE" get deploy frontend -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"; fe_sha="${fe_img##*:}"
cf_state="$([ -n "$PLATFORM_URL" ] && echo Deployed || echo 'not created')"
rds_state="$(aws rds describe-db-instances --region "$REGION" \
  --db-instance-identifier "hosting-platform-${ENVIRONMENT}-postgres" \
  --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo '?')"

http_root="000"; http_api="000"
if [ -n "$PLATFORM_URL" ]; then
  for i in 1 2 3; do
    http_root="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "${PLATFORM_URL}/" || echo 000)"
    http_api="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "${PLATFORM_URL}/api/auth/me" || echo 000)"
    [ "$http_root" = "200" ] && [ "$http_api" = "401" ] && break
    sleep 10
  done
fi
HEALTHY=false
[ "$http_root" = "200" ] && [ "$http_api" = "401" ] && HEALTHY=true

mark() { [ "$1" = ok ] && printf '✅' || printf '⚠️ '; }
title="✅  Hosting Platform Ready"; [ "$HEALTHY" = true ] || title="⚠️  Hosting Platform deployed with WARNINGS"

cat <<EOF

================================================================
  ${title}
================================================================
  Environment      ${ENVIRONMENT}
  Platform URL     ${PLATFORM_URL:-<run full up.sh to create platform CloudFront>}
  Deployed version backend  ${be_sha:-?}
                   frontend ${fe_sha:-?}
----------------------------------------------------------------
  CloudFront       $(mark "$([ "$cf_state" = Deployed ] && echo ok || echo warn)") ${cf_state}
  ALB              $(mark ok) ${ALB_HOST}
  Backend          $([ "${be_state%%/*}" = "${be_state##*/}" ] && [ "${be_state%%/*}" != "?" ] && mark ok || mark warn) ${be_state} ready
  Frontend         $([ "${fe_state%%/*}" = "${fe_state##*/}" ] && [ "${fe_state%%/*}" != "?" ] && mark ok || mark warn) ${fe_state} ready
  RDS              $([ "$rds_state" = available ] && mark ok || mark warn) ${rds_state}
  Health check     $([ "$HEALTHY" = true ] && mark ok || mark warn) / → ${http_root}   /api/auth/me → ${http_api}
----------------------------------------------------------------
  Next steps
    Status      scripts/deployment/status.sh ${ENVIRONMENT}
    Logs        scripts/deployment/logs.sh backend
    Redeploy    scripts/deployment/up.sh ${ENVIRONMENT} --app
    Tear down   scripts/deployment/destroy.sh ${ENVIRONMENT}
================================================================
EOF

[ "$HEALTHY" = true ] || { echo "  (health check not green yet — CloudFront may still be propagating; re-check with status.sh)" >&2; exit 1; }
