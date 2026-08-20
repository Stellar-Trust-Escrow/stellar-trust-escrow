#!/usr/bin/env bash
#
# seed-load.sh — Populate the test database with production-like data volumes
#                so migration safety CI can measure apply time and lock behaviour.
#
# Inserts (defaults):
#   - 100,000 escrow rows
#   - 500,000 milestone rows (5 per escrow)
#
# Override volumes with environment variables:
#   ESCROW_ROWS=1000 MILESTONE_ROWS=5000 ./scripts/seed-load.sh
#
# Requires: a reachable PostgreSQL instance and a generated Prisma client.
# Default DATABASE_URL targets the CI PostgreSQL service container.
#
set -euo pipefail

# Default to the CI Postgres service if not provided.
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_db?schema=public"
fi

# Optional row-count overrides.
export ESCROW_ROWS="${ESCROW_ROWS:-100000}"
export MILESTONE_ROWS="${MILESTONE_ROWS:-$((ESCROW_ROWS * 5))}"
export SEED_TENANT_ID="${SEED_TENANT_ID:-load_test_tenant}"

# Run from the repository root so that require('@prisma/client') resolves
# through the backend workspace.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "▶ Seeding load dataset (escrows=${ESCROW_ROWS}, milestones=${MILESTONE_ROWS})"
echo "  DATABASE_URL=${DATABASE_URL%%@*}@<redacted>"

time node scripts/seed-load.js

echo "✅ seed-load.sh complete"
