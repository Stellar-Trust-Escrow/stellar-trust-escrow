#!/usr/bin/env bash
# gas-profile.sh
#
# Runs gas profiling tests for all contracts and writes gas-report.json.
#
# Usage:
#   bash scripts/gas-profile.sh              # run + write report
#   bash scripts/gas-profile.sh --compare    # compare against previous report
#
# Output:
#   gas-report.json   — latest results (committed or gitignored as preferred)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT="$REPO_ROOT/gas-report.json"
PREV_REPORT="$REPO_ROOT/gas-report.prev.json"
COMPARE=false

for arg in "$@"; do
  [[ "$arg" == "--compare" ]] && COMPARE=true
done

# ── collect raw GAS_PROFILE lines from both contracts ────────────────────────

collect() {
  local dir="$1"
  (cd "$dir" && cargo test gas_profiling -- --nocapture 2>/dev/null) \
    | grep "^GAS_PROFILE" || true
}

echo "⛽  Profiling escrow_contract…"
ESCROW_LINES=$(collect "$REPO_ROOT/contracts/escrow_contract")

echo "⛽  Profiling insurance_contract…"
INSURANCE_LINES=$(collect "$REPO_ROOT/contracts/insurance_contract")

ALL_LINES=$(printf '%s\n%s\n' "$ESCROW_LINES" "$INSURANCE_LINES")

# ── build JSON ────────────────────────────────────────────────────────────────

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

{
  echo "{"
  echo "  \"generated_at\": \"$TIMESTAMP\","
  echo "  \"results\": ["

  first=true
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    # GAS_PROFILE | <contract> | <function> | cpu=<n> | mem=<n>
    contract=$(echo "$line" | awk -F' \\| ' '{print $2}' | xargs)
    function=$(echo "$line" | awk -F' \\| ' '{print $3}' | xargs)
    cpu=$(echo "$line" | awk -F' \\| ' '{print $4}' | sed 's/cpu=//')
    mem=$(echo "$line" | awk -F' \\| ' '{print $5}' | sed 's/mem=//')

    [[ "$first" == "false" ]] && echo "    ,"
    echo "    {\"contract\": \"$contract\", \"function\": \"$function\", \"cpu_instructions\": $cpu, \"memory_bytes\": $mem}"
    first=false
  done <<< "$ALL_LINES"

  echo "  ]"
  echo "}"
} > "$REPORT"

echo ""
echo "✅  Report written to gas-report.json"
echo ""

# ── pretty-print table ────────────────────────────────────────────────────────

printf "%-30s %-30s %18s %18s\n" "CONTRACT" "FUNCTION" "CPU INSTRUCTIONS" "MEMORY BYTES"
printf '%s\n' "$(printf '%.0s-' {1..100})"

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  contract=$(echo "$line" | awk -F' \\| ' '{print $2}' | xargs)
  function=$(echo "$line" | awk -F' \\| ' '{print $3}' | xargs)
  cpu=$(echo "$line" | awk -F' \\| ' '{print $4}' | sed 's/cpu=//')
  mem=$(echo "$line" | awk -F' \\| ' '{print $5}' | sed 's/mem=//')
  printf "%-30s %-30s %18s %18s\n" "$contract" "$function" "$cpu" "$mem"
done <<< "$ALL_LINES"

echo ""

# ── optional comparison ───────────────────────────────────────────────────────

if [[ "$COMPARE" == "true" && -f "$PREV_REPORT" ]]; then
  echo "📊  Comparing against previous report…"
  echo ""
  printf "%-30s %-30s %12s %12s %10s\n" "CONTRACT" "FUNCTION" "CPU (prev)" "CPU (now)" "DELTA %"
  printf '%s\n' "$(printf '%.0s-' {1..100})"

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    contract=$(echo "$line" | awk -F' \\| ' '{print $2}' | xargs)
    function=$(echo "$line" | awk -F' \\| ' '{print $3}' | xargs)
    cpu_now=$(echo "$line" | awk -F' \\| ' '{print $4}' | sed 's/cpu=//')

    cpu_prev=$(python3 -c "
import json, sys
data = json.load(open('$PREV_REPORT'))
for r in data['results']:
    if r['contract'] == '$contract' and r['function'] == '$function':
        print(r['cpu_instructions'])
        sys.exit(0)
print('N/A')
" 2>/dev/null || echo "N/A")

    if [[ "$cpu_prev" != "N/A" ]]; then
      delta=$(python3 -c "print(f'{(($cpu_now - $cpu_prev) / $cpu_prev * 100):+.1f}%')" 2>/dev/null || echo "?")
    else
      delta="new"
    fi

    printf "%-30s %-30s %12s %12s %10s\n" "$contract" "$function" "$cpu_prev" "$cpu_now" "$delta"
  done <<< "$ALL_LINES"
  echo ""
fi
