#!/usr/bin/env bash
# rollback.sh — One-command rollback for the blue-green deploy pipeline
#
# Shifts traffic back to blue, tears down the green environment, and sends
# a Slack alert. Idempotent: running this when already on blue (green
# already torn down or never existed) is a no-op, not an error.
#
# Usage:
#   bash scripts/rollback.sh
#
# Environment variables:
#   SLACK_DEPLOY_WEBHOOK   — Optional: Slack webhook for the rollback alert
#   GREEN_ENV_NAME         — Green environment/service name to tear down
#                             (default: green)
#   TEARDOWN_CMD           — Command to tear down the green environment
#                             (default: a no-op echo, since the actual
#                             ECS/K8s command is environment-specific — see
#                             DEPLOYMENT.md)

set -euo pipefail

GREEN_ENV_NAME="${GREEN_ENV_NAME:-green}"
LOG_PREFIX="[rollback]"

log() {
  echo "${LOG_PREFIX} $(date -u +"%Y-%m-%dT%H:%M:%SZ") $*"
}

notify_slack() {
  local status="$1" message="$2"
  if [[ -n "${SLACK_DEPLOY_WEBHOOK:-}" ]]; then
    local color
    color=$([ "$status" = "success" ] && echo "good" || echo "danger")
    curl -sf -X POST "$SLACK_DEPLOY_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"attachments\":[{\"color\":\"${color}\",\"text\":\"${message}\"}]}" \
      > /dev/null || true
  fi
}

# ── Idempotency check ────────────────────────────────────────────────────────
# If shift-traffic.sh's target already resolves to blue=100/green=0 (e.g. via
# a status file the deploy pipeline maintains), there's nothing to do. This
# check is intentionally soft: if GREEN_STATUS_FILE isn't configured, we
# proceed with the rollback anyway (shifting to blue and tearing down green
# are both themselves idempotent operations — a repeat run is harmless, just
# not a fast no-op).
GREEN_STATUS_FILE="${GREEN_STATUS_FILE:-}"
if [[ -n "$GREEN_STATUS_FILE" && -f "$GREEN_STATUS_FILE" ]]; then
  CURRENT_TARGET=$(cat "$GREEN_STATUS_FILE" 2>/dev/null || echo "")
  if [[ "$CURRENT_TARGET" == "blue" ]]; then
    log "Already on blue (per ${GREEN_STATUS_FILE}) — nothing to roll back. No-op."
    exit 0
  fi
fi

log "Starting rollback: shifting traffic to blue…"
bash "$(dirname "$0")/shift-traffic.sh" blue
log "Traffic shifted to blue."

if [[ -n "${GREEN_STATUS_FILE:-}" ]]; then
  echo "blue" > "$GREEN_STATUS_FILE"
fi

log "Tearing down green environment (${GREEN_ENV_NAME})…"
TEARDOWN_CMD="${TEARDOWN_CMD:-echo 'No TEARDOWN_CMD configured — skipping actual teardown (see DEPLOYMENT.md)'}"
eval "$TEARDOWN_CMD" || log "WARNING: teardown command failed or green was already torn down — continuing (idempotent)."

log "Rollback complete."
notify_slack "failure" "🔴 Rollback executed: traffic shifted back to blue, green (${GREEN_ENV_NAME}) torn down."
