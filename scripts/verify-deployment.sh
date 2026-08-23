#!/usr/bin/env bash
# =============================================================================
# verify-deployment.sh — Post-deploy contract verification
#
# Verifies that a deployed Soroban contract is live and responsive by calling
# one or more view-only entry points. Designed to be called from CI/CD.
#
# Usage:
#   bash scripts/verify-deployment.sh <contract-name> <address> \
#     --rpc-url <url> \
#     --network-passphrase <passphrase> \
#     [--entry-point <name>] [--expected-version <n>]
#
# Environment variables (fallback):
#   SOROBAN_RPC_URL, SOROBAN_NETWORK_PASSPHRASE
#
# Exit codes:
#   0 — verification passed
#   1 — configuration error
#   2 — contract unreachable or invocation failed
#   3 — version mismatch (when --expected-version is set)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
  cat <<EOF
Usage: $0 <contract-name> <address> [options]

Arguments:
  contract-name    Logical name (e.g. escrow, insurance, governance)
  address          Contract address (C...)

Options:
  --rpc-url <url>              Soroban RPC URL
  --network-passphrase <str>   Network passphrase
  --entry-point <name>         Entry point to invoke (default: version)
  --expected-version <n>       Assert the returned version matches (when using version())
  -h, --help                   Show this help
EOF
  exit 0
}

# ── Parse arguments ───────────────────────────────────────────────────────────
CONTRACT_NAME=""
CONTRACT_ADDRESS=""
ENTRY_POINT="version"
EXPECTED_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --rpc-url) SOROBAN_RPC_URL="$2"; shift 2 ;;
    --network-passphrase) SOROBAN_NETWORK_PASSPHRASE="$2"; shift 2 ;;
    --entry-point) ENTRY_POINT="$2"; shift 2 ;;
    --expected-version) EXPECTED_VERSION="$2"; shift 2 ;;
    *)
      if [[ -z "$CONTRACT_NAME" ]]; then
        CONTRACT_NAME="$1"
      elif [[ -z "$CONTRACT_ADDRESS" ]]; then
        CONTRACT_ADDRESS="$1"
      else
        echo -e "${RED}Error: Unexpected argument '$1'${NC}" >&2
        exit 1
      fi
      shift ;;
  esac
done

if [[ -z "$CONTRACT_NAME" || -z "$CONTRACT_ADDRESS" ]]; then
  echo -e "${RED}Error: contract-name and address are required${NC}" >&2
  usage
fi

if [[ -z "${SOROBAN_RPC_URL:-}" ]]; then
  echo -e "${RED}Error: SOROBAN_RPC_URL not set${NC}" >&2
  exit 1
fi
if [[ -z "${SOROBAN_NETWORK_PASSPHRASE:-}" ]]; then
  echo -e "${RED}Error: SOROBAN_NETWORK_PASSPHRASE not set${NC}" >&2
  exit 1
fi

# ── Invoke entry point ────────────────────────────────────────────────────────
echo -e "${CYAN}🔍 Verifying ${CONTRACT_NAME} at ${CONTRACT_ADDRESS}...${NC}" >&2

# We use a dummy secret key for view-only invocations (no auth required).
# The soroban CLI still requires --source-account, so use a generic one.
VIEW_KEY="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"

OUTPUT=""
if OUTPUT=$(soroban contract invoke \
  --source-account "$VIEW_KEY" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
  --id "$CONTRACT_ADDRESS" \
  -- "$ENTRY_POINT" 2>&1); then
  echo -e "${GREEN}   ✅ ${CONTRACT_NAME}.${ENTRY_POINT}() responded: ${OUTPUT}${NC}" >&2
else
  echo -e "${RED}   ❌ ${CONTRACT_NAME}.${ENTRY_POINT}() failed${NC}" >&2
  echo -e "${RED}   Error: ${OUTPUT}${NC}" >&2
  exit 2
fi

# ── Optional: check expected version ──────────────────────────────────────────
if [[ -n "$EXPECTED_VERSION" ]]; then
  # Strip quotes if present
  OUTPUT_CLEAN="${OUTPUT//\"/}"
  OUTPUT_CLEAN="${OUTPUT_CLEAN//[[:space:]]/}"
  if [[ "$OUTPUT_CLEAN" != "$EXPECTED_VERSION" ]]; then
    echo -e "${RED}   ❌ Version mismatch: got '${OUTPUT_CLEAN}', expected '${EXPECTED_VERSION}'${NC}" >&2
    exit 3
  fi
  echo -e "${GREEN}   ✅ Version matches: ${EXPECTED_VERSION}${NC}" >&2
fi

echo -e "${GREEN}✅ ${CONTRACT_NAME} verification passed${NC}" >&2
