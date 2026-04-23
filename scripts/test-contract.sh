#!/usr/bin/env bash
# test-contract.sh
#
# Runs the Soroban contract test suite with coverage, gas profiling, and optional fuzzing.
# Usage: bash scripts/test-contract.sh [--fuzz] [--coverage] [--gas] [--ci] [--build]
#
# Flags:
#   --fuzz      Run cargo-fuzz targets (requires nightly + cargo-fuzz)
#   --coverage  Generate llvm-cov HTML + lcov report
#   --gas       Emit per-test instruction counts via SOROBAN_GAS_PROFILE=1
#   --ci        Write GitHub Actions step summaries and set output variables
#   --build     Build optimized WASM artifacts (release profile, opt-level=z)

set -euo pipefail

FUZZ=false
COVERAGE=false
GAS=false
CI_MODE=false
BUILD=false

for arg in "$@"; do
  case $arg in
    --fuzz)     FUZZ=true ;;
    --coverage) COVERAGE=true ;;
    --gas)      GAS=true ;;
    --ci)       CI_MODE=true ;;
    --build)    BUILD=true ;;
  esac
done

CONTRACTS=(escrow_contract insurance_contract)
ARTIFACTS_DIR="${ARTIFACTS_DIR:-test-artifacts}"
mkdir -p "$ARTIFACTS_DIR"

echo ""
echo "🧪 Running Soroban Contract Tests"
echo "=================================="
echo ""

for CONTRACT in "${CONTRACTS[@]}"; do
  CONTRACT_DIR="contracts/$CONTRACT"
  echo "── $CONTRACT ──────────────────────────────"

  # Format check
  echo "📐 Checking format…"
  (cd "$CONTRACT_DIR" && cargo fmt -- --check)
  echo "   ✅ Format OK"

  # Clippy
  echo "🔍 Running Clippy…"
  (cd "$CONTRACT_DIR" && cargo clippy -- -D warnings)
  echo "   ✅ Clippy OK"

  # Tests (with optional gas profiling)
  echo "🧪 Running tests…"
  TEST_OUT="../../$ARTIFACTS_DIR/${CONTRACT}-test.txt"
  if [ "$GAS" = true ]; then
    echo "   ⛽ Gas profiling enabled"
    (cd "$CONTRACT_DIR" && SOROBAN_GAS_PROFILE=1 cargo test -- --nocapture 2>&1 | tee "../../$ARTIFACTS_DIR/${CONTRACT}-gas.txt" | tee "$TEST_OUT" > /dev/null)
  else
    (cd "$CONTRACT_DIR" && cargo test -- --nocapture 2>&1 | tee "$TEST_OUT")
  fi
  echo "   ✅ Tests OK"

  # Coverage
  if [ "$COVERAGE" = true ]; then
    echo "📊 Generating coverage report…"
    if ! command -v cargo-llvm-cov &>/dev/null; then
      cargo install cargo-llvm-cov --quiet
    fi
    (cd "$CONTRACT_DIR" && \
      cargo llvm-cov --lcov --output-path "../../$ARTIFACTS_DIR/${CONTRACT}-lcov.info" && \
      cargo llvm-cov --html  --output-dir  "../../$ARTIFACTS_DIR/${CONTRACT}-coverage-html")
    echo "   ✅ Coverage written to $ARTIFACTS_DIR/${CONTRACT}-lcov.info"

  fi

  # Optimized WASM build
  if [ "$BUILD" = true ]; then
    echo "🔨 Building optimized WASM…"
    (cd "$CONTRACT_DIR" && cargo build --release --target wasm32-unknown-unknown)
    WASM_FILE=$(find "$CONTRACT_DIR/target/wasm32-unknown-unknown/release" -maxdepth 1 -name "*.wasm" | head -1)
    if [ -n "$WASM_FILE" ]; then
      WASM_SIZE=$(du -sh "$WASM_FILE" | cut -f1)
      echo "   ✅ WASM built: $(basename "$WASM_FILE") ($WASM_SIZE)"
    fi
  fi

  echo ""
done

# Fuzzing (escrow_contract only — requires nightly + cargo-fuzz)
if [ "$FUZZ" = true ]; then
  echo "🎲 Running fuzz targets…"
  FUZZ_DIR="contracts/escrow_contract/fuzz"
  if [ ! -d "$FUZZ_DIR" ]; then
    echo "   ⚠️  No fuzz directory found at $FUZZ_DIR — skipping"
  else
    FUZZ_SECS="${FUZZ_SECS:-30}"
    for target in "$FUZZ_DIR/fuzz_targets"/*.rs; do
      name=$(basename "$target" .rs)
      echo "   Running fuzz target: $name (${FUZZ_SECS}s)"
      (cd contracts/escrow_contract && \
        cargo +nightly fuzz run "$name" -- -max_total_time="$FUZZ_SECS" \
          -artifact_prefix="../../$ARTIFACTS_DIR/fuzz-$name-" 2>&1 | \
          tee "../../$ARTIFACTS_DIR/fuzz-$name.txt") || {
        echo "   ❌ Fuzz target $name found a failure — artifact saved to $ARTIFACTS_DIR/"
        exit 1
      }
    done
    echo "   ✅ Fuzzing OK"
  fi
  echo ""
fi

echo "=================================="
echo "✅ All contract checks passed!"
echo "   Artifacts: $ARTIFACTS_DIR/"

# Write GitHub Actions step summary
if [ "$CI_MODE" = true ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## ✅ Contract Test Results"
    echo ""
    echo "| Contract | Tests | Gas Profile | Coverage |"
    echo "|---|---|---|---|"
    for CONTRACT in "${CONTRACTS[@]}"; do
      TEST_COUNT=$(grep -c "^test .* ok$" "$ARTIFACTS_DIR/${CONTRACT}-test.txt" 2>/dev/null || echo "—")
      GAS_FILE="$ARTIFACTS_DIR/${CONTRACT}-gas.txt"
      COV_FILE="$ARTIFACTS_DIR/${CONTRACT}-lcov.info"
      echo "| \`$CONTRACT\` | $TEST_COUNT passed | $([ -f "$GAS_FILE" ] && echo "✅" || echo "—") | $([ -f "$COV_FILE" ] && echo "✅" || echo "—") |"
    done
  } >> "$GITHUB_STEP_SUMMARY"
fi
