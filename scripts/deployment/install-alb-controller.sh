#!/usr/bin/env bash
#
# Install (or upgrade) the AWS Load Balancer Controller into the EKS cluster, a
# one-time cluster bootstrap step required before the ALB Ingress can provision an
# Application Load Balancer (see docs/16-deployment.md "AWS Load Balancer
# Controller" and docs/07-kubernetes.md "Ingress").
#
# Method: the official Helm chart (AWS's recommended install path — it bundles the
# CRDs and the webhook's self-signed certificate, so no cert-manager or raw
# manifests are needed). It is intentionally NOT installed via Terraform: that
# would pull the helm/kubernetes providers into the infra apply and make the
# provider config depend on the cluster created in the same apply (a fragile
# pattern the project avoids — see the IAM module notes).
#
# Pod Identity integration: the IAM role and the EKS Pod Identity association for
# the `kube-system/aws-load-balancer-controller` service account are already
# created by Terraform (IAM module). Helm therefore just creates that service
# account by name; it must NOT carry an IRSA `eks.amazonaws.com/role-arn`
# annotation — the Pod Identity Agent (an EKS addon enabled in the EKS module)
# supplies the credentials. So no --set serviceAccount annotations here.
#
# IMPORTANT: CHART_VERSION must match the IAM policy in
# terraform/modules/iam/alb-controller-iam-policy.json (currently controller
# v2.11.x / chart 1.11.x). Bump both together — see the docs "Upgrade".
#
# Prerequisites: helm, aws, kubectl on PATH; AWS credentials for the account; the
# environment already `terraform apply`-ed (outputs must exist).
#
# Usage:
#   scripts/deployment/install-alb-controller.sh [dev|prod]

set -euo pipefail

ENVIRONMENT="${1:-dev}"
NAMESPACE="kube-system"
SERVICE_ACCOUNT="aws-load-balancer-controller"
CHART_VERSION="1.11.0" # appVersion v2.11.0 — keep in sync with alb-controller-iam-policy.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/terraform/environments/${ENVIRONMENT}"

if [ ! -d "$TF_DIR" ]; then
  echo "error: unknown environment '${ENVIRONMENT}' (expected dev or prod)" >&2
  exit 1
fi

tf() { terraform -chdir="$TF_DIR" output -raw "$1"; }

echo "Reading Terraform outputs for '${ENVIRONMENT}'..."
AWS_REGION="$(tf aws_region)"
CLUSTER_NAME="$(tf eks_cluster_name)"
VPC_ID="$(tf vpc_id)"

echo "Configuring kubectl for '${CLUSTER_NAME}'..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null

echo "Adding the eks-charts Helm repository..."
helm repo add eks https://aws.github.io/eks-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

# `upgrade --install` is idempotent: it installs on first run and upgrades in place
# on later runs. region + vpcId are set explicitly so the controller does not need
# to auto-discover them via IMDS.
echo "Installing/upgrading aws-load-balancer-controller (chart ${CHART_VERSION})..."
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace "$NAMESPACE" \
  --version "$CHART_VERSION" \
  --set clusterName="$CLUSTER_NAME" \
  --set region="$AWS_REGION" \
  --set vpcId="$VPC_ID" \
  --set serviceAccount.create=true \
  --set serviceAccount.name="$SERVICE_ACCOUNT" \
  --wait

kubectl -n "$NAMESPACE" get deployment aws-load-balancer-controller
echo "Done. The AWS Load Balancer Controller is installed in '${CLUSTER_NAME}' (env: ${ENVIRONMENT})."
