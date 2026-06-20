#!/usr/bin/env bash
set -euo pipefail

WASM_SIZE_LIMIT_KB=512
GAS_INCREASE_THRESHOLD=15
OUTPUT_FILE="gas-report.json"

echo "=== Gas Profiling Report ===" | tee gas-report.txt
echo "Timestamp: $(date -u)" | tee -a gas-report.txt

# Build contracts
echo "[1/3] Building contracts..."
if command -v cargo &>/dev/null; then
  cargo build --release --target wasm32-unknown-unknown 2>&1 | tail -5
fi

# Measure WASM sizes
echo "[2/3] Measuring WASM output sizes..."
declare -A SIZES
WASM_WARNINGS=0
for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
  [ -f "$wasm" ] || continue
  NAME=$(basename "$wasm")
  SIZE_BYTES=$(wc -c < "$wasm")
  SIZE_KB=$(( SIZE_BYTES / 1024 ))
  SIZES[$NAME]=$SIZE_KB
  echo "  $NAME: ${SIZE_KB}KB"
  if (( SIZE_KB > WASM_SIZE_LIMIT_KB )); then
    echo "  ⚠️  WARNING: $NAME exceeds ${WASM_SIZE_LIMIT_KB}KB limit!"
    WASM_WARNINGS=1
  fi
done | tee -a gas-report.txt

# Run tests with gas profiling
echo "[3/3] Profiling gas usage..."
if command -v cargo &>/dev/null; then
  cargo test 2>&1 | grep -E "(gas|memory|cpu|test result)" | tee -a gas-report.txt || true
fi

# Build JSON summary
python3 - << PYEOF
import json, os, sys
data = {"wasm_sizes": {}, "warnings": [], "status": "pass"}
wasm_dir = "target/wasm32-unknown-unknown/release"
limit_kb = int(os.environ.get("WASM_SIZE_LIMIT_KB", 512))
if os.path.isdir(wasm_dir):
    for f in os.listdir(wasm_dir):
        if f.endswith(".wasm"):
            sz = os.path.getsize(os.path.join(wasm_dir, f)) // 1024
            data["wasm_sizes"][f] = sz
            if sz > limit_kb:
                data["warnings"].append(f"{f} exceeds {limit_kb}KB ({sz}KB)")
                data["status"] = "fail"
with open("gas-report.json", "w") as fh:
    json.dump(data, fh, indent=2)
print(json.dumps(data, indent=2))
PYEOF

echo ""
echo "Report written to gas-report.txt and gas-report.json"
[ "$WASM_WARNINGS" -eq 0 ] && echo "✅ All contracts within size limits." || { echo "❌ Size limit violations detected."; exit 1; }
