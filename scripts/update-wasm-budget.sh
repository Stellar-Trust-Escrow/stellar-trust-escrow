#!/usr/bin/env bash
# update-wasm-budget.sh — Update a contract's WASM size budget
#
# Usage:
#   scripts/update-wasm-budget.sh {contract_name} {new_budget_bytes}
#
# Refuses to set a new budget more than 10% above the contract's CURRENT
# measured (wasm-opt -Oz'd) size — this guards against runaway budget
# inflation, where a size regression gets "fixed" by just raising the
# ceiling instead of addressing the bloat. A legitimate feature that
# genuinely needs more room can still raise the budget; it just can't
# jump by more than 10% in one update, so growth stays deliberate and
# visible in the git history.
#
# Requires the contract to already be built (contracts/{name}/target/.../{name}.wasm)
# so "current size" reflects reality, not a stale number.

set -euo pipefail

CONTRACT_NAME="${1:-}"
NEW_BUDGET="${2:-}"
BUDGETS_FILE="$(dirname "$0")/../contracts/size-budgets.json"
MAX_INCREASE_PCT=10

if [[ -z "$CONTRACT_NAME" || -z "$NEW_BUDGET" ]]; then
  echo "Usage: $0 {contract_name} {new_budget_bytes}" >&2
  exit 1
fi

if ! [[ "$NEW_BUDGET" =~ ^[0-9]+$ ]]; then
  echo "new_budget_bytes must be a positive integer, got: $NEW_BUDGET" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

# Locate the compiled wasm for this contract to measure its current size.
WASM_CANDIDATE=$(find . -path "*/wasm32-unknown-unknown/release/${CONTRACT_NAME}.wasm" -o -path "*/wasm32v1-none/release/${CONTRACT_NAME}.wasm" 2>/dev/null | head -1)

if [[ -z "$WASM_CANDIDATE" ]]; then
  echo "ERROR: could not find a compiled ${CONTRACT_NAME}.wasm to measure current size against." >&2
  echo "Build the contract first: cargo build --target wasm32-unknown-unknown --release -p ${CONTRACT_NAME}" >&2
  exit 1
fi

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "ERROR: wasm-opt is not in PATH (apt-get install -y binaryen)." >&2
  exit 1
fi

OPT_WASM="$(mktemp /tmp/"${CONTRACT_NAME}"-update-opt-XXXXXX.wasm)"
trap 'rm -f "$OPT_WASM"' EXIT
wasm-opt -Oz --enable-bulk-memory "$WASM_CANDIDATE" -o "$OPT_WASM"
CURRENT_SIZE=$(stat -c%s "$OPT_WASM" 2>/dev/null || stat -f%z "$OPT_WASM")

MAX_ALLOWED=$(( CURRENT_SIZE + (CURRENT_SIZE * MAX_INCREASE_PCT / 100) ))

if [[ "$NEW_BUDGET" -gt "$MAX_ALLOWED" ]]; then
  echo "REFUSED: requested budget ${NEW_BUDGET} bytes is more than ${MAX_INCREASE_PCT}% above the current measured size (${CURRENT_SIZE} bytes, max allowed: ${MAX_ALLOWED} bytes)." >&2
  echo "This guard exists to prevent runaway budget inflation — see README.md." >&2
  exit 1
fi

TMP_JSON=$(mktemp)
jq --arg name "$CONTRACT_NAME" --argjson budget "$NEW_BUDGET" '.[$name] = $budget' "$BUDGETS_FILE" > "$TMP_JSON"
mv "$TMP_JSON" "$BUDGETS_FILE"

echo "Updated ${CONTRACT_NAME} budget to ${NEW_BUDGET} bytes (current measured size: ${CURRENT_SIZE} bytes)."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git add "$BUDGETS_FILE"
  git commit -m "chore: update ${CONTRACT_NAME} WASM size budget to ${NEW_BUDGET} bytes"
  echo "Committed budget update. Push it yourself: git push"
else
  echo "Not inside a git work tree — skipped commit; ${BUDGETS_FILE} was updated on disk only."
fi
