#!/usr/bin/env bash
# gas-analyzer.sh
#
# Builds Soroban smart contracts, measures WASM output size, and profiles
# CPU/memory gas usage via cargo test. Compares against a baseline and
# fails if WASM exceeds the size limit or gas increases by more than 15%.
#
# Usage:
#   bash scripts/gas-analyzer.sh                  # build + profile + report
#   bash scripts/gas-analyzer.sh --compare        # also compare vs baseline
#   bash scripts/gas-analyzer.sh --save-baseline  # save current as baseline
#
# Environment:
#   WASM_SIZE_LIMIT_KB   Max allowed WASM size in KB (default: 100)
#   GAS_INCREASE_LIMIT   Max allowed gas increase % (default: 15)
#
# Output:
#   gas-analysis.json   — latest results
#   gas-baseline.json   — baseline for comparison (committed to repo)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANALYSIS_FILE="$REPO_ROOT/gas-analysis.json"
BASELINE_FILE="$REPO_ROOT/gas-baseline.json"

WASM_SIZE_LIMIT_KB="${WASM_SIZE_LIMIT_KB:-100}"
GAS_INCREASE_LIMIT="${GAS_INCREASE_LIMIT:-15}"

COMPARE=false
SAVE_BASELINE=false
FAILED=false

for arg in "$@"; do
  [[ "$arg" == "--compare" ]]       && COMPARE=true
  [[ "$arg" == "--save-baseline" ]] && SAVE_BASELINE=true
done

# ── Build contracts ───────────────────────────────────────────────────────────

echo "🔨  Building contracts (release, wasm32-unknown-unknown)…"
(cd "$REPO_ROOT" && cargo build --release --target wasm32-unknown-unknown --workspace 2>&1) \
  | grep -E '(Compiling|Finished|error)' || true

WASM_DIR="$REPO_ROOT/target/wasm32-unknown-unknown/release"

# ── Collect WASM sizes ────────────────────────────────────────────────────────

echo ""
echo "📦  WASM sizes:"
printf "%-40s %12s %10s\n" "FILE" "SIZE (bytes)" "SIZE (KB)"
printf '%s\n' "$(printf '%.0s-' {1..65})"

declare -A WASM_SIZES
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

SIZE_ENTRIES=""
SIZE_EXCEEDED=false

for wasm in "$WASM_DIR"/*.wasm; do
  [[ -f "$wasm" ]] || continue
  name=$(basename "$wasm")
  size=$(stat -c%s "$wasm" 2>/dev/null || stat -f%z "$wasm")
  size_kb=$(( size / 1024 ))
  WASM_SIZES["$name"]=$size

  marker=""
  if (( size_kb > WASM_SIZE_LIMIT_KB )); then
    marker=" ⚠  EXCEEDS LIMIT (${WASM_SIZE_LIMIT_KB} KB)"
    SIZE_EXCEEDED=true
    FAILED=true
  fi

  printf "%-40s %12s %10s%s\n" "$name" "$size" "${size_kb} KB" "$marker"

  SIZE_ENTRIES="${SIZE_ENTRIES}    {\"file\": \"$name\", \"bytes\": $size, \"kb\": $size_kb},"
done

SIZE_ENTRIES="${SIZE_ENTRIES%,}"  # strip trailing comma

# ── Run gas profiling tests ───────────────────────────────────────────────────

echo ""
echo "⛽  Running gas profiling tests…"

collect_gas() {
  local dir="$1"
  (cd "$dir" && cargo test gas_profiling -- --nocapture 2>/dev/null) \
    | grep "^GAS_PROFILE" || true
}

ESCROW_LINES=$(collect_gas "$REPO_ROOT/contracts/escrow_contract" 2>/dev/null || true)
ALL_LINES="$ESCROW_LINES"

# Also try escrow_extensions if present
if [[ -d "$REPO_ROOT/contracts/escrow_extensions" ]]; then
  EXT_LINES=$(collect_gas "$REPO_ROOT/contracts/escrow_extensions" 2>/dev/null || true)
  ALL_LINES=$(printf '%s\n%s\n' "$ALL_LINES" "$EXT_LINES")
fi

echo ""
printf "%-30s %-30s %18s %18s\n" "CONTRACT" "FUNCTION" "CPU INSTRUCTIONS" "MEMORY BYTES"
printf '%s\n' "$(printf '%.0s-' {1..100})"

GAS_ENTRIES=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  contract=$(echo "$line" | awk -F' \\| ' '{print $2}' | xargs)
  func=$(echo "$line"     | awk -F' \\| ' '{print $3}' | xargs)
  cpu=$(echo "$line"      | awk -F' \\| ' '{print $4}' | sed 's/cpu=//')
  mem=$(echo "$line"      | awk -F' \\| ' '{print $5}' | sed 's/mem=//')
  printf "%-30s %-30s %18s %18s\n" "$contract" "$func" "$cpu" "$mem"
  GAS_ENTRIES="${GAS_ENTRIES}    {\"contract\": \"$contract\", \"function\": \"$func\", \"cpu\": $cpu, \"memory\": $mem},"
done <<< "$ALL_LINES"

GAS_ENTRIES="${GAS_ENTRIES%,}"

# ── Write analysis JSON ───────────────────────────────────────────────────────

cat > "$ANALYSIS_FILE" <<JSON
{
  "generated_at": "$TIMESTAMP",
  "wasm_size_limit_kb": $WASM_SIZE_LIMIT_KB,
  "gas_increase_limit_pct": $GAS_INCREASE_LIMIT,
  "wasm_sizes": [
$SIZE_ENTRIES
  ],
  "gas_profiles": [
$GAS_ENTRIES
  ]
}
JSON

echo ""
echo "✅  Analysis written to gas-analysis.json"

# ── Save baseline ─────────────────────────────────────────────────────────────

if [[ "$SAVE_BASELINE" == "true" ]]; then
  cp "$ANALYSIS_FILE" "$BASELINE_FILE"
  echo "📌  Baseline saved to gas-baseline.json"
fi

# ── Compare against baseline ──────────────────────────────────────────────────

if [[ "$COMPARE" == "true" && -f "$BASELINE_FILE" ]]; then
  echo ""
  echo "📊  Comparing against baseline…"
  echo ""
  printf "%-30s %-30s %14s %14s %10s\n" "CONTRACT" "FUNCTION" "CPU (base)" "CPU (now)" "DELTA %"
  printf '%s\n' "$(printf '%.0s-' {1..100})"

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    contract=$(echo "$line" | awk -F' \\| ' '{print $2}' | xargs)
    func=$(echo "$line"     | awk -F' \\| ' '{print $3}' | xargs)
    cpu_now=$(echo "$line"  | awk -F' \\| ' '{print $4}' | sed 's/cpu=//')

    cpu_base=$(python3 -c "
import json, sys
data = json.load(open('$BASELINE_FILE'))
for r in data.get('gas_profiles', []):
    if r['contract'] == '$contract' and r['function'] == '$func':
        print(r['cpu'])
        sys.exit(0)
print('N/A')
" 2>/dev/null || echo "N/A")

    if [[ "$cpu_base" != "N/A" && "$cpu_base" != "0" ]]; then
      delta_pct=$(python3 -c "
base=$cpu_base; now=$cpu_now
pct = (now - base) / base * 100
print(f'{pct:+.1f}')
" 2>/dev/null || echo "?")

      marker=""
      # Strip sign for numeric comparison
      abs_delta=$(echo "$delta_pct" | tr -d '+' | awk '{if($1<0) print -$1; else print $1}')
      if python3 -c "import sys; sys.exit(0 if float('$abs_delta') > $GAS_INCREASE_LIMIT else 1)" 2>/dev/null; then
        marker=" ⚠  EXCEEDS +${GAS_INCREASE_LIMIT}% LIMIT"
        FAILED=true
      fi

      printf "%-30s %-30s %14s %14s %10s%s\n" "$contract" "$func" "$cpu_base" "$cpu_now" "${delta_pct}%" "$marker"
    else
      printf "%-30s %-30s %14s %14s %10s\n" "$contract" "$func" "N/A (new)" "$cpu_now" "new"
    fi
  done <<< "$ALL_LINES"

  echo ""
fi

# ── Final result ──────────────────────────────────────────────────────────────

echo ""
if [[ "$FAILED" == "true" ]]; then
  echo "❌  Gas analysis FAILED — WASM size or gas regression exceeded limits."
  exit 1
fi

echo "✅  Gas analysis passed."
