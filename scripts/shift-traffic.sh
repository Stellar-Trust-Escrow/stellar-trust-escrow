#!/usr/bin/env bash
# shift-traffic.sh — Load balancer traffic-shift abstraction for blue-green deploys
#
# Usage:
#   bash scripts/shift-traffic.sh blue          # 100% blue, 0% green
#   bash scripts/shift-traffic.sh green         # 0% blue, 100% green
#   bash scripts/shift-traffic.sh split:N       # N% green, (100-N)% blue
#
# Environment variables:
#   LB_BACKEND            — "alb" or "nginx" (default: alb)
#   ALB_LISTENER_ARN      — Required if LB_BACKEND=alb
#   ALB_BLUE_TG_ARN       — Blue target group ARN (alb)
#   ALB_GREEN_TG_ARN      — Green target group ARN (alb)
#   NGINX_UPSTREAM_CONF   — Path to the nginx upstream weights file (nginx)
#   NGINX_RELOAD_CMD      — Command to reload nginx after rewriting weights
#                            (default: "nginx -s reload")
#
# The shift is applied as a single atomic operation at the load balancer
# level (one aws elbv2 modify-listener call, or one nginx config write +
# reload) — never as a sequence of partial updates a health check could
# observe mid-way.

set -euo pipefail

TARGET="${1:-}"
LB_BACKEND="${LB_BACKEND:-alb}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 {blue|green|split:N}" >&2
  exit 1
fi

# ── Parse target into a (blue_weight, green_weight) pair ───────────────────────
case "$TARGET" in
  blue)
    BLUE_WEIGHT=100
    GREEN_WEIGHT=0
    ;;
  green)
    BLUE_WEIGHT=0
    GREEN_WEIGHT=100
    ;;
  split:*)
    GREEN_WEIGHT="${TARGET#split:}"
    if ! [[ "$GREEN_WEIGHT" =~ ^[0-9]+$ ]] || [[ "$GREEN_WEIGHT" -lt 0 || "$GREEN_WEIGHT" -gt 100 ]]; then
      echo "Invalid split percentage: $GREEN_WEIGHT (expected 0-100)" >&2
      exit 1
    fi
    BLUE_WEIGHT=$((100 - GREEN_WEIGHT))
    ;;
  *)
    echo "Unknown target: $TARGET (expected blue, green, or split:N)" >&2
    exit 1
    ;;
esac

echo "Shifting traffic: blue=${BLUE_WEIGHT}% green=${GREEN_WEIGHT}% (backend: $LB_BACKEND)"

# ── AWS ALB target group weights ────────────────────────────────────────────────
shift_alb() {
  : "${ALB_LISTENER_ARN:?ALB_LISTENER_ARN is required for LB_BACKEND=alb}"
  : "${ALB_BLUE_TG_ARN:?ALB_BLUE_TG_ARN is required for LB_BACKEND=alb}"
  : "${ALB_GREEN_TG_ARN:?ALB_GREEN_TG_ARN is required for LB_BACKEND=alb}"

  # A single modify-listener call carries both weights together, so the ALB
  # applies the new distribution atomically — there's no window where only
  # one target group's weight has been updated.
  aws elbv2 modify-listener \
    --listener-arn "$ALB_LISTENER_ARN" \
    --default-actions "Type=forward,ForwardConfig={TargetGroups=[{TargetGroupArn=${ALB_BLUE_TG_ARN},Weight=${BLUE_WEIGHT}},{TargetGroupArn=${ALB_GREEN_TG_ARN},Weight=${GREEN_WEIGHT}}]}"
}

# ── nginx upstream weights ──────────────────────────────────────────────────────
shift_nginx() {
  : "${NGINX_UPSTREAM_CONF:?NGINX_UPSTREAM_CONF is required for LB_BACKEND=nginx}"
  local reload_cmd="${NGINX_RELOAD_CMD:-nginx -s reload}"

  # Write the whole upstream block in one pass and reload once — nginx picks
  # up the new config atomically on reload, so there's no partial-split
  # window visible to in-flight connections.
  cat > "$NGINX_UPSTREAM_CONF" <<EOF
upstream backend {
    server blue.internal:4000 weight=${BLUE_WEIGHT};
    server green.internal:4000 weight=${GREEN_WEIGHT};
}
EOF
  eval "$reload_cmd"
}

case "$LB_BACKEND" in
  alb) shift_alb ;;
  nginx) shift_nginx ;;
  *)
    echo "Unknown LB_BACKEND: $LB_BACKEND (expected alb or nginx)" >&2
    exit 1
    ;;
esac

echo "Traffic shift complete: blue=${BLUE_WEIGHT}% green=${GREEN_WEIGHT}%"
