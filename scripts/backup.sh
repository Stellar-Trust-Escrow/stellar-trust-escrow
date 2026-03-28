#!/usr/bin/env bash
# backup.sh — Automated PostgreSQL backup with verification and retention
#
# Usage:
#   bash scripts/backup.sh [--verify] [--restore-test]
#
# Environment variables (can be set in .env or exported):
#   DATABASE_URL        — PostgreSQL connection string (required)
#   BACKUP_DIR          — Where to store backups (default: /var/backups/stellar-trust)
#   BACKUP_RETENTION_DAYS — How many days to keep backups (default: 7)
#   BACKUP_S3_BUCKET    — Optional: s3://bucket/prefix to upload backups
#   SLACK_BACKUP_WEBHOOK — Optional: Slack webhook for notifications

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

BACKUP_DIR="${BACKUP_DIR:-/var/backups/stellar-trust}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.dump"
LOG_FILE="${BACKUP_DIR}/backup.log"
VERIFY="${1:-}"
RESTORE_TEST="${2:-}"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$LOG_FILE"
}

notify_slack() {
  local status="$1" message="$2"
  if [[ -n "${SLACK_BACKUP_WEBHOOK:-}" ]]; then
    local color
    color=$([ "$status" = "success" ] && echo "good" || echo "danger")
    curl -sf -X POST "$SLACK_BACKUP_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"attachments\":[{\"color\":\"${color}\",\"text\":\"${message}\"}]}" \
      > /dev/null || true
  fi
}

die() {
  log "ERROR: $*"
  notify_slack "failure" "❌ Backup FAILED on $(hostname): $*"
  exit 1
}

# ── Parse DATABASE_URL ────────────────────────────────────────────────────────

# Load .env if DATABASE_URL not already set
if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$(dirname "$0")/../backend/.env"
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
  fi
fi

[[ -z "${DATABASE_URL:-}" ]] && die "DATABASE_URL is not set"

# Extract connection parts from DATABASE_URL
# Format: postgresql://user:pass@host:port/dbname[?params]
DB_URL_STRIPPED="${DATABASE_URL%%\?*}"  # strip query params
DB_USER=$(echo "$DB_URL_STRIPPED" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL_STRIPPED" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DB_URL_STRIPPED" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
DB_PORT=$(echo "$DB_URL_STRIPPED" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL_STRIPPED" | sed -E 's|.*/([^/]+)$|\1|')

export PGPASSWORD="$DB_PASS"

# ── Setup ─────────────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

log "=== Backup started: $TIMESTAMP ==="
log "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
log "Output:   $BACKUP_FILE"

# ── Step 1: Dump ──────────────────────────────────────────────────────────────

log "Running pg_dump..."
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=custom \
  --compress=9 \
  --no-password \
  --file="$BACKUP_FILE" \
  || die "pg_dump failed"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Dump complete. Size: $BACKUP_SIZE"

# ── Step 2: Verify ────────────────────────────────────────────────────────────

log "Verifying backup integrity..."
pg_restore --list "$BACKUP_FILE" > /dev/null \
  || die "Backup verification failed — dump is corrupt"
log "Verification passed"

# ── Step 3: Checksum ──────────────────────────────────────────────────────────

sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
log "Checksum written: ${BACKUP_FILE}.sha256"

# ── Step 4: Upload to S3 (optional) ──────────────────────────────────────────

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  log "Uploading to S3: $BACKUP_S3_BUCKET"
  aws s3 cp "$BACKUP_FILE" "${BACKUP_S3_BUCKET}/backup_${TIMESTAMP}.dump" \
    || die "S3 upload failed"
  aws s3 cp "${BACKUP_FILE}.sha256" "${BACKUP_S3_BUCKET}/backup_${TIMESTAMP}.dump.sha256" \
    || die "S3 checksum upload failed"
  log "S3 upload complete"
fi

# ── Step 5: Restore test (optional, run with --restore-test) ─────────────────

if [[ "${VERIFY:-}" == "--restore-test" || "${RESTORE_TEST:-}" == "--restore-test" ]]; then
  TEST_DB="${DB_NAME}_restore_test_$$"
  log "Running restore test into temporary DB: $TEST_DB"

  createdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" "$TEST_DB" \
    || die "Could not create test DB"

  pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$TEST_DB" \
    --no-password \
    "$BACKUP_FILE" \
    || { dropdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" "$TEST_DB" 2>/dev/null; die "Restore test failed"; }

  dropdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" "$TEST_DB"
  log "Restore test passed — temporary DB dropped"
fi

# ── Step 6: Retention ─────────────────────────────────────────────────────────

log "Enforcing retention: removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "backup_*.dump" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "backup_*.dump.sha256" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "backup_*.dump" | wc -l)
log "Retention complete. Backups on disk: $REMAINING"

# ── Done ──────────────────────────────────────────────────────────────────────

log "=== Backup finished successfully ==="
notify_slack "success" "✅ Backup succeeded on $(hostname): ${DB_NAME} (${BACKUP_SIZE})"
