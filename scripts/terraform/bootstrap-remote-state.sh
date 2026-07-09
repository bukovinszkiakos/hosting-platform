#!/usr/bin/env bash
#
# Create the Terraform remote-state S3 bucket (one-time), then print the exact
# steps to enable the S3 backend in each environment. See terraform/README.md
# "Remote state bootstrap" and docs/06-terraform.md "Remote State".
#
# The terraform/backend/ config itself uses LOCAL state: it cannot store its own
# state in the bucket it is creating (chicken-and-egg), and the bucket changes
# rarely. Re-running this script is safe — creating the bucket is idempotent
# (Terraform no-ops when the bucket already exists in its local state).
#
# This script only does the safe, repeatable part (create the bucket + guide the
# next steps). It intentionally does NOT edit the environment files or run
# `terraform init -migrate-state` for you: enabling the backend and migrating state
# are deliberate, interactive, per-environment actions (see the printed steps).
#
# Prerequisites: terraform and AWS credentials for the target account on PATH.
#
# Usage:
#   scripts/terraform/bootstrap-remote-state.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/terraform/backend"

echo "Provisioning the remote-state backend (terraform/backend, local state)..."
terraform -chdir="$BACKEND_DIR" init -input=false
terraform -chdir="$BACKEND_DIR" apply -input=false

BUCKET="$(terraform -chdir="$BACKEND_DIR" output -raw bucket_name)"
REGION="$(terraform -chdir="$BACKEND_DIR" output -raw region)"

cat <<EOF

State bucket ready: ${BUCKET} (${REGION})

Next, enable the remote backend once per environment (dev, then prod):

  1. In terraform/environments/<env>/main.tf, uncomment the backend "s3" block so
     it reads exactly:

       backend "s3" {
         bucket       = "${BUCKET}"
         key          = "<env>/terraform.tfstate"
         region       = "${REGION}"
         use_lockfile = true
         encrypt      = true
       }

  2. Migrate the environment's local state into the bucket:

       terraform -chdir=terraform/environments/<env> init -migrate-state

     Answer "yes" when asked to copy existing state to the new backend.

Remote state is then active. Do NOT re-run this script to "reset" state; it only
manages the bucket. See terraform/README.md for the full runbook and recovery.
EOF
