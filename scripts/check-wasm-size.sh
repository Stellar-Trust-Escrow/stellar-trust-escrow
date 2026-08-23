#!/usr/bin/env bash
# check-wasm-size.sh — WASM binary size budget gate
#
# Usage:
#   scripts/check-wasm-size.sh <path-to-compiled.wasm> <contract_name>
#
# Reads the budget for <contract_name> from contracts/size-budgets.json,
# runs `wasm-opt -Oz` to get the actual production (optimised) size, and
# fails if that size exceeds the budget.
#
# Exit codes:
#   0 — within budget
#   1 — over budget, or no budget defined for this contract, or wasm-opt
#       is not installed

set -euo pipefail

WASM_PATH="${1:-}"
CONTRACT_NAME="${2:-}"
BUDGETS_FILE="${WASM_SIZE_BUDGETS_FILE:-$(dirname "$0")/../contracts/size-budgets.json}"

if [[ -z "$WASM_PATH" || -z "$CONTRACT_NAME" ]]; then
  echo "Usage: $0 <path-to-compiled.wasm> <contract_name>" >&2
  exit 1
fi

if [[ ! -f "$WASM_PATH" ]]; then
  echo "WASM file not found: $WASM_PATH" >&2
  exit 1
fi

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "ERROR: wasm-opt is not in PATH." >&2
  echo "Install it with: apt-get install -y binaryen  (or: brew install binaryen)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required to read $BUDGETS_FILE." >&2
  exit 1
fi

if [[ ! -f "$BUDGETS_FILE" ]]; then
  echo "ERROR: budgets file not found: $BUDGETS_FILE" >&2
  exit 1
fi

BUDGET=$(jq -r --arg name "$CONTRACT_NAME" '.[$name] // empty' "$BUDGETS_FILE")
if [[ -z "$BUDGET" ]]; then
  echo "FAIL: No budget defined for ${CONTRACT_NAME}. Add it to size-budgets.json." >&2
  exit 1
fi

OPT_WASM="$(mktemp /tmp/"${CONTRACT_NAME}"-opt-XXXXXX.wasm)"
trap 'rm -f "$OPT_WASM"' EXIT

# -Oz: optimise for size, not speed — matches what actually gets deployed.
# Raw debug WASM is never compared against the budget.
# --enable-bulk-memory: the wasm32-unknown-unknown target emits bulk memory
# ops (memory.copy/memory.fill) by default on current Rust toolchains, and
# wasm-opt rejects them as invalid unless this feature is explicitly enabled.
wasm-opt -Oz --enable-bulk-memory "$WASM_PATH" -o "$OPT_WASM"

ACTUAL_SIZE=$(stat -c%s "$OPT_WASM" 2>/dev/null || stat -f%z "$OPT_WASM")

if [[ "$ACTUAL_SIZE" -gt "$BUDGET" ]]; then
  OVER_BY=$((ACTUAL_SIZE - BUDGET))
  echo "FAIL: ${CONTRACT_NAME}.wasm is ${ACTUAL_SIZE} bytes (budget: ${BUDGET}, over by ${OVER_BY} bytes)" >&2
  exit 1
fi

UNDER_BY=$((BUDGET - ACTUAL_SIZE))
echo "OK: ${CONTRACT_NAME}.wasm is ${ACTUAL_SIZE} bytes (budget: ${BUDGET}, ${UNDER_BY} bytes to spare)"
exit 0
