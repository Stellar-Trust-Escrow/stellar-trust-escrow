#!/usr/bin/env bash
# =============================================================================
# deploy-contract.sh — Reusable Soroban contract deployment script
#
# Builds, optimizes, installs (uploads) and deploys a single Soroban contract
# to the specified Stellar network. Designed to be called from CI/CD workflows
# (deploy-testnet.yml / deploy-mainnet.yml).
#
# Usage:
#   bash scripts/deploy-contract.sh <contract-name> <wasm-path> \
#     --secret <secret-key> \
#     --rpc-url <rpc-url> \
#     --network-passphrase <passphrase> \
#     [--optimize]
#
# Environment variables (alternative to flags):
#   STELLAR_SECRET_KEY
#   SOROBAN_RPC_URL
#   SOROBAN_NETWORK_PASSPHRASE
#
# Output (JSON to stdout on success):
#   {
#     "name": "<contract-name>",
#     "address": "C...",
#     "wasmHash": "abc...",
#     "version": 1
#   }
#
# On failure: exits non-zero and prints error to stderr.
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 <contract-name> <wasm-path> [options]

Arguments:
  contract-name    Logical name (e.g. escrow, insurance, governance)
  wasm-path        Path to the compiled .wasm file

Options:
  --secret <key>               Stellar account secret key
  --rpc-url <url>              Soroban RPC URL
  --network-passphrase <str>   Network passphrase
  --optimize                   Run 'soroban contract optimize' before deploying
  -h, --help                   Show this help message

Environment variables (fallback for options):
  STELLAR_SECRET_KEY, SOROBAN_RPC_URL, SOROBAN_NETWORK_PASSPHRASE
EOF
  exit 0
}

# ── Parse arguments ───────────────────────────────────────────────────────────
CONTRACT_NAME=""
WASM_PATH=""
OPTIMIZE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --secret) STELLAR_SECRET_KEY="$2"; shift 2 ;;
    --rpc-url) SOROBAN_RPC_URL="$2"; shift 2 ;;
    --network-passphrase) SOROBAN_NETWORK_PASSPHRASE="$2"; shift 2 ;;
    --optimize) OPTIMIZE=true; shift ;;
    *)
      if [[ -z "$CONTRACT_NAME" ]]; then
        CONTRACT_NAME="$1"
      elif [[ -z "$WASM_PATH" ]]; then
        WASM_PATH="$1"
      else
        echo -e "${RED}Error: Unexpected argument '$1'${NC}" >&2
        exit 1
      fi
      shift ;;
  esac
done

if [[ -z "$CONTRACT_NAME" || -z "$WASM_PATH" ]]; then
  echo -e "${RED}Error: contract-name and wasm-path are required${NC}" >&2
  usage
fi

# Validate required parameters
if [[ -z "${STELLAR_SECRET_KEY:-}" ]]; then
  echo -e "${RED}Error: STELLAR_SECRET_KEY not set (use --secret or env var)${NC}" >&2
  exit 1
fi
if [[ -z "${SOROBAN_RPC_URL:-}" ]]; then
  echo -e "${RED}Error: SOROBAN_RPC_URL not set (use --rpc-url or env var)${NC}" >&2
  exit 1
fi
if [[ -z "${SOROBAN_NETWORK_PASSPHRASE:-}" ]]; then
  echo -e "${RED}Error: SOROBAN_NETWORK_PASSPHRASE not set (use --network-passphrase or env var)${NC}" >&2
  exit 1
fi

WASM_PATH="$(realpath "$WASM_PATH")"
if [[ ! -f "$WASM_PATH" ]]; then
  echo -e "${RED}Error: WASM file not found: $WASM_PATH${NC}" >&2
  exit 1
fi

# ── 1. Optimize (optional) ────────────────────────────────────────────────────
if [[ "$OPTIMIZE" == true ]]; then
  echo -e "${YELLOW}⚡ Optimizing ${CONTRACT_NAME} WASM...${NC}" >&2
  WASM_PATH_OPT="$(dirname "$WASM_PATH")/${CONTRACT_NAME}_optimized.wasm"
  if command -v soroban &>/dev/null; then
    soroban contract optimize \
      --wasm "$WASM_PATH" \
      --wasm-out "$WASM_PATH_OPT"
    WASM_PATH="$WASM_PATH_OPT"
    echo -e "${GREEN}   ✅ Optimized${NC}" >&2
  else
    echo -e "${YELLOW}   ⚠️  soroban CLI not found, skipping optimize${NC}" >&2
  fi
fi

# ── 2. Install (upload WASM) ──────────────────────────────────────────────────
echo -e "${CYAN}📤 Installing ${CONTRACT_NAME} WASM...${NC}" >&2
WASM_HASH=$(soroban contract install \
  --source-account "$STELLAR_SECRET_KEY" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
  --wasm "$WASM_PATH")
echo -e "${GREEN}   ✅ Installed — WASM hash: ${WASM_HASH}${NC}" >&2

# ── 3. Deploy contract ────────────────────────────────────────────────────────
echo -e "${CYAN}🚀 Deploying ${CONTRACT_NAME} contract...${NC}" >&2
CONTRACT_ADDRESS=$(soroban contract deploy \
  --source-account "$STELLAR_SECRET_KEY" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
  --wasm-hash "$WASM_HASH")
echo -e "${GREEN}   ✅ Deployed — Address: ${CONTRACT_ADDRESS}${NC}" >&2

# ── 4. Determine version ──────────────────────────────────────────────────────
# Try to call version() entry point; fall back to 1 if it doesn't exist.
VERSION="1"
VERSION_OUTPUT=""
if VERSION_OUTPUT=$(soroban contract invoke \
  --source-account "$STELLAR_SECRET_KEY" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
  --id "$CONTRACT_ADDRESS" \
  -- version 2>/dev/null); then
  VERSION="$VERSION_OUTPUT"
  echo -e "${GREEN}   📋 Version: ${VERSION}${NC}" >&2
else
  echo -e "${YELLOW}   ⚠️  version() not available, defaulting to 1${NC}" >&2
fi

# ── 5. Output result as JSON to stdout ────────────────────────────────────────
cat <<EOF
{
  "name": "$CONTRACT_NAME",
  "address": "$CONTRACT_ADDRESS",
  "wasmHash": "$WASM_HASH",
  "version": $VERSION
}
EOF

echo -e "${GREEN}✅ ${CONTRACT_NAME} deployment complete${NC}" >&2
