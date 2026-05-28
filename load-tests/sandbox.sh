#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"
TOXIPROXY_API="http://localhost:8474"
REPORT_DIR="load-tests/reports"

mkdir -p "$REPORT_DIR"

echo "==> Starting E2E sandbox..."
docker compose -f "$COMPOSE_FILE" up -d --wait app toxiproxy

echo "==> Configuring Toxiproxy network constraints..."
curl -sf -X DELETE "$TOXIPROXY_API/proxies/app" >/dev/null 2>&1 || true

curl -sf -X POST "$TOXIPROXY_API/proxies" \
  -H "Content-Type: application/json" \
  -d '{"name":"app","listen":"0.0.0.0:3001","upstream":"app:3000","enabled":true}'

curl -sf -X POST "$TOXIPROXY_API/proxies/app/toxics" \
  -H "Content-Type: application/json" \
  -d '{"name":"latency","type":"latency","stream":"downstream","attributes":{"latency":300,"jitter":30}}'

curl -sf -X POST "$TOXIPROXY_API/proxies/app/toxics" \
  -H "Content-Type: application/json" \
  -d '{"name":"loss_like_timeouts","type":"timeout","stream":"downstream","toxicity":0.02,"attributes":{"timeout":1}}'

curl -sf -X POST "$TOXIPROXY_API/proxies/app/toxics" \
  -H "Content-Type: application/json" \
  -d '{"name":"bandwidth","type":"bandwidth","stream":"downstream","attributes":{"rate":48}}'

echo "==> Network shaping active: 300ms latency | 2% timeout drops | 3G bandwidth"
echo "==> Running Playwright E2E tests..."

set +e
docker compose -f "$COMPOSE_FILE" run --rm playwright \
  npx playwright test --config frontend/playwright.config.js --reporter=html \
  2>&1 | tee "$REPORT_DIR/test-run.log"
EXIT_CODE=${PIPESTATUS[0]}
set -e

echo "==> Tearing down sandbox..."
docker compose -f "$COMPOSE_FILE" down -v

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "All E2E tests passed under simulated network constraints."
else
  echo "Tests failed. See $REPORT_DIR/ for logs and the Playwright HTML report."
fi

exit "$EXIT_CODE"
