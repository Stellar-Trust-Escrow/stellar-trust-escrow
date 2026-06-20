#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_BASE="${ROOT_DIR}/../docker-compose.yml"
COMPOSE_OVERRIDE="${ROOT_DIR}/../docker-compose.override.yml"
COMPOSE_TEST="${ROOT_DIR}/../docker-compose.test.yml"
LOG_DIR="${ROOT_DIR}/results"

mkdir -p "$LOG_DIR"

function log() {
  echo "==> $1"
}

function start_services() {
  log "Starting chaos benchmark sandbox services..."
  docker compose -f "$COMPOSE_TEST" up -d --wait app toxiproxy
  log "Sandbox services started."
}

function inject_tcp_chaos() {
  log "Injecting network chaos via Toxiproxy..."
  curl -sf -X DELETE "http://localhost:8474/proxies/app" >/dev/null 2>&1 || true
  curl -sf -X POST "http://localhost:8474/proxies" \
    -H "Content-Type: application/json" \
    -d '{"name":"app","listen":"0.0.0.0:3001","upstream":"app:3000","enabled":true}'
  curl -sf -X POST "http://localhost:8474/proxies/app/toxics" \
    -H "Content-Type: application/json" \
    -d '{"name":"latency","type":"latency","stream":"downstream","attributes":{"latency":350,"jitter":60}}'
  curl -sf -X POST "http://localhost:8474/proxies/app/toxics" \
    -H "Content-Type: application/json" \
    -d '{"name":"timeout","type":"timeout","stream":"downstream","toxicity":0.08,"attributes":{"timeout":1}}'
  curl -sf -X POST "http://localhost:8474/proxies/app/toxics" \
    -H "Content-Type: application/json" \
    -d '{"name":"bandwidth","type":"bandwidth","stream":"downstream","attributes":{"rate":80}}'
  log "Network chaos injected: latency + jitter + timeout drops + throttled bandwidth."
}

function stop_service_if_present() {
  local service="$1"
  local container
  container=$(docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_OVERRIDE" ps -q "$service" 2>/dev/null || true)
  if [[ -n "$container" ]]; then
    log "Simulating service failure by killing $service container..."
    docker kill "$container" || true
    sleep 8
    log "Recovering $service container..."
    docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_OVERRIDE" up -d --wait "$service"
  else
    log "Service $service not present in compose configuration, skipping." 
  fi
}

function run_nightly() {
  log "Running the nightly load test runner."
  node "$ROOT_DIR/nightly-runner.js" 2>&1 | tee "$LOG_DIR/chaos-runner.log"
}

start_services
inject_tcp_chaos

log "Starting nightly benchmark run with chaos injection."
run_nightly

log "Chaos benchmark run complete. Logs are available at $LOG_DIR/chaos-runner.log"

log "Tearing down sandbox environment."
docker compose -f "$COMPOSE_TEST" down -v

log "Chaos runner finished."
