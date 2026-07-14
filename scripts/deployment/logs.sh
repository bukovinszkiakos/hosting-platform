#!/usr/bin/env bash
#
# logs.sh — uniform access to the platform's log sources, including the two whose
# pods are dynamically named (the migration Job and per-deployment build Jobs),
# where finding the right pod by hand is the real friction this script removes.
#
# Usage:
#   scripts/deployment/logs.sh backend            [-f] [--previous]
#   scripts/deployment/logs.sh frontend           [-f] [--previous]
#   scripts/deployment/logs.sh migrations         [-f]
#   scripts/deployment/logs.sh build --latest     [-f]
#   scripts/deployment/logs.sh build <deployment-id>
#
# Flags:
#   -f, --follow      stream logs (default: print recent logs and exit)
#   -p, --previous    logs from the previous (crashed) container instance
#
# Namespace is always hosting-platform (prevents wrong-namespace mistakes).

set -euo pipefail

NAMESPACE="hosting-platform"
TARGET="${1:-}"; shift || true

FOLLOW=""
PREVIOUS=""
BUILD_ID=""
for arg in "$@"; do
  case "$arg" in
    -f | --follow) FOLLOW="-f" ;;
    -p | --previous) PREVIOUS="--previous" ;;
    --latest) BUILD_ID="__latest__" ;;
    -*) echo "error: unknown flag '${arg}'" >&2; exit 1 ;;
    *) BUILD_ID="$arg" ;;
  esac
done

usage() {
  sed -n '5,18p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 1
}

kexists() { kubectl -n "$NAMESPACE" get "$1" >/dev/null 2>&1; }

case "$TARGET" in
  backend | frontend)
    kexists "deploy/${TARGET}" || { echo "error: deployment '${TARGET}' not found in ${NAMESPACE}" >&2; exit 1; }
    # shellcheck disable=SC2086
    exec kubectl -n "$NAMESPACE" logs "deploy/${TARGET}" --tail=200 $FOLLOW $PREVIOUS
    ;;

  migrations)
    if ! kexists "job/db-migrate"; then
      echo "error: no db-migrate job found (it is short-lived — ttlSecondsAfterFinished=600)." >&2
      exit 1
    fi
    # shellcheck disable=SC2086
    exec kubectl -n "$NAMESPACE" logs "job/db-migrate" --tail=-1 $FOLLOW
    ;;

  build)
    [ -n "$BUILD_ID" ] || { echo "error: 'build' needs <deployment-id> or --latest" >&2; usage; }
    if [ "$BUILD_ID" = "__latest__" ]; then
      # Newest build Job by creation time (label app=hosting-platform-build).
      JOB="$(kubectl -n "$NAMESPACE" get jobs -l app=hosting-platform-build \
        --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null || true)"
      [ -n "$JOB" ] || { echo "error: no build jobs found (they auto-expire after 1h)." >&2; exit 1; }
    else
      JOB="build-${BUILD_ID}"
      kexists "job/${JOB}" || { echo "error: build job '${JOB}' not found (may have expired)." >&2; exit 1; }
    fi
    echo "→ ${JOB}" >&2
    # shellcheck disable=SC2086
    exec kubectl -n "$NAMESPACE" logs "job/${JOB}" --tail=-1 $FOLLOW
    ;;

  "" | -h | --help) usage ;;
  *) echo "error: unknown target '${TARGET}'" >&2; usage ;;
esac
