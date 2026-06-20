#!/usr/bin/env bash
# start-sandbox.sh
#
# Starts the local Stellar Quickstart sandbox, deploys smart contracts,
# provisions pre-funded test wallets, and patches frontend/.env.local
# so the app points at the local network — no public testnet required.
#
# Usage:
#   bash scripts/start-sandbox.sh           # start + deploy + fund wallets
#   bash scripts/start-sandbox.sh --reset   # tear down volumes first
#   bash scripts/start-sandbox.sh --stop    # stop all containers
#
# Prerequisites:
#   docker, docker compose, soroban-cli (cargo install soroban-cli)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HORIZON_URL="http://localhost:8000"
SOROBAN_RPC_URL="http://localhost:8001"
NETWORK_PASSPHRASE="Standalone Network ; February 2017"
NETWORK_NAME="local"
WALLETS_FILE="$REPO_ROOT/.sandbox-wallets.json"
FRONTEND_ENV="$REPO_ROOT/frontend/.env.local"

# ── Argument parsing ──────────────────────────────────────────────────────────

RESET=false
STOP=false
for arg in "$@"; do
  [[ "$arg" == "--reset" ]] && RESET=true
  [[ "$arg" == "--stop"  ]] && STOP=true
done

# ── Stop ──────────────────────────────────────────────────────────────────────

if [[ "$STOP" == "true" ]]; then
  echo "🛑  Stopping sandbox containers…"
  (cd "$REPO_ROOT" && docker compose stop stellar)
  echo "✅  Stopped."
  exit 0
fi

# ── Reset ─────────────────────────────────────────────────────────────────────

if [[ "$RESET" == "true" ]]; then
  echo "🗑   Removing stellar_data volume…"
  (cd "$REPO_ROOT" && docker compose rm -sf stellar)
  docker volume rm "$(basename "$REPO_ROOT")_stellar_data" 2>/dev/null || true
fi

# ── Start Stellar Quickstart ──────────────────────────────────────────────────

echo "🚀  Starting Stellar Quickstart (local Soroban mode)…"
(cd "$REPO_ROOT" && docker compose up -d stellar)

echo "⏳  Waiting for Horizon to be healthy…"
for i in $(seq 1 60); do
  if curl -sf "$HORIZON_URL/health" > /dev/null 2>&1; then
    echo "✅  Horizon is up."
    break
  fi
  [[ $i -eq 60 ]] && { echo "❌  Horizon did not start in time."; exit 1; }
  sleep 2
done

# ── Configure soroban-cli network ─────────────────────────────────────────────

if command -v soroban &>/dev/null; then
  echo "🔧  Configuring soroban-cli network…"
  soroban network add \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    "$NETWORK_NAME" 2>/dev/null || true
else
  echo "⚠   soroban-cli not found — skipping network config and contract deploy."
  echo "    Install with: cargo install soroban-cli"
fi

# ── Provision test wallets ────────────────────────────────────────────────────

echo ""
echo "💳  Provisioning pre-funded test wallets…"

provision_wallet() {
  local alias="$1"
  soroban keys generate --no-fund "$alias" --network "$NETWORK_NAME" 2>/dev/null || true
  local address
  address=$(soroban keys address "$alias" 2>/dev/null || echo "")
  if [[ -n "$address" ]]; then
    # Fund via Horizon friendbot (local quickstart exposes this)
    curl -sf "$HORIZON_URL/friendbot?addr=$address" > /dev/null 2>&1 || true
    echo "  $alias → $address (funded)"
    echo "$address"
  fi
}

if command -v soroban &>/dev/null; then
  CLIENT_ADDR=$(provision_wallet "test-client")
  FREELANCER_ADDR=$(provision_wallet "test-freelancer")
  ARBITER_ADDR=$(provision_wallet "test-arbiter")

  # Write wallet addresses to a local JSON for scripts / tests
  cat > "$WALLETS_FILE" <<JSON
{
  "network": "$NETWORK_NAME",
  "horizon_url": "$HORIZON_URL",
  "soroban_rpc_url": "$SOROBAN_RPC_URL",
  "wallets": {
    "client":     "$CLIENT_ADDR",
    "freelancer": "$FREELANCER_ADDR",
    "arbiter":    "$ARBITER_ADDR"
  }
}
JSON
  echo "  Wallet addresses saved to .sandbox-wallets.json"
fi

# ── Deploy contracts ──────────────────────────────────────────────────────────

if command -v soroban &>/dev/null; then
  echo ""
  echo "📜  Building and deploying escrow_contract…"

  WASM="$REPO_ROOT/target/wasm32-unknown-unknown/release/escrow_contract.wasm"

  if [[ ! -f "$WASM" ]]; then
    echo "  Building WASM…"
    (cd "$REPO_ROOT" && cargo build --release --target wasm32-unknown-unknown -p escrow_contract 2>&1 \
      | grep -E '(Compiling|Finished|error)' || true)
  fi

  if [[ -f "$WASM" ]]; then
    CONTRACT_ID=$(soroban contract deploy \
      --wasm "$WASM" \
      --source test-client \
      --network "$NETWORK_NAME" 2>/dev/null || echo "")

    if [[ -n "$CONTRACT_ID" ]]; then
      echo "  ✅  escrow_contract deployed: $CONTRACT_ID"
      # Patch wallets file with contract ID
      python3 -c "
import json
data = json.load(open('$WALLETS_FILE'))
data['contract_id'] = '$CONTRACT_ID'
json.dump(data, open('$WALLETS_FILE', 'w'), indent=2)
" 2>/dev/null || true
    else
      echo "  ⚠   Deploy failed or soroban-cli not configured — skipping."
    fi
  else
    echo "  ⚠   WASM not found — run 'cargo build --release --target wasm32-unknown-unknown' first."
  fi
fi

# ── Patch frontend .env.local ─────────────────────────────────────────────────

echo ""
echo "⚙   Patching frontend/.env.local for local sandbox…"

CONTRACT_ID_LINE=""
if [[ -f "$WALLETS_FILE" ]]; then
  CONTRACT_ID_LINE=$(python3 -c "
import json
d = json.load(open('$WALLETS_FILE'))
cid = d.get('contract_id', '')
if cid: print(f'NEXT_PUBLIC_CONTRACT_ID={cid}')
" 2>/dev/null || true)
fi

cat > "$FRONTEND_ENV" <<ENV
# Auto-generated by scripts/start-sandbox.sh — do not commit
NEXT_PUBLIC_STELLAR_NETWORK=local
NEXT_PUBLIC_HORIZON_URL=$HORIZON_URL
NEXT_PUBLIC_SOROBAN_RPC_URL=$SOROBAN_RPC_URL
NEXT_PUBLIC_NETWORK_PASSPHRASE=$NETWORK_PASSPHRASE
NEXT_PUBLIC_API_URL=http://localhost:4000
${CONTRACT_ID_LINE}
ENV

echo "  Written to frontend/.env.local"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  🌟  Stellar Local Sandbox Ready"
echo "═══════════════════════════════════════════════════════"
echo "  Horizon API  : $HORIZON_URL"
echo "  Soroban RPC  : $SOROBAN_RPC_URL"
echo "  Wallets file : .sandbox-wallets.json"
echo ""
echo "  Start the app: npm run dev"
echo "  Stop sandbox : bash scripts/start-sandbox.sh --stop"
echo "  Reset ledger : bash scripts/start-sandbox.sh --reset"
echo "═══════════════════════════════════════════════════════"
