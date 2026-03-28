#!/usr/bin/env bash
# restore_pitr.sh — Prepare Point-In-Time Recovery from base backup + WAL archive
# Usage:
#   bash scripts/restore_pitr.sh <basebackup.tar.gz> <target_time>
#   Example: bash scripts/restore_pitr.sh /var/backups/stellar-trust/basebackup_20260328T020000Z.tar.gz "2026-03-28 01:15:00 UTC"

set -euo pipefail

BASEBACKUP_FILE="${1:-}"
RECOVERY_TARGET_TIME="${2:-}"
TARGET_PGDATA="${TARGET_PGDATA:-/var/lib/postgresql/pitr_data}"
WAL_ARCHIVE_S3_BUCKET="${WAL_ARCHIVE_S3_BUCKET:-}"
S3_SSE_ALGORITHM="${S3_SSE_ALGORITHM:-AES256}"

if [[ -z "$BASEBACKUP_FILE" ]]; then
  echo "ERROR: basebackup file path required"
  echo "Usage: $0 <basebackup.tar.gz> [recovery_target_time]"
  exit 1
fi

if [[ -z "$WAL_ARCHIVE_S3_BUCKET" ]]; then
  echo "ERROR: WAL_ARCHIVE_S3_BUCKET is required for WAL replay"
  exit 1
fi

if [[ ! -f "$BASEBACKUP_FILE" ]]; then
  echo "ERROR: basebackup file '$BASEBACKUP_FILE' not found"
  exit 1
fi

if pgrep -f "postgres" >/dev/null 2>&1; then
  echo "ERROR: Please stop PostgreSQL before running PITR restore preparation."
  exit 1
fi

mkdir -p "$TARGET_PGDATA"
rm -rf "${TARGET_PGDATA:?}"/*

echo "Unpacking base backup into $TARGET_PGDATA"
tar -xzf "$BASEBACKUP_FILE" -C "$TARGET_PGDATA"

cat > "$TARGET_PGDATA/recovery.conf" <<EOF
restore_command = 'aws s3 cp "${WAL_ARCHIVE_S3_BUCKET}/wal/%f" "%p" --sse ${S3_SSE_ALGORITHM} --quiet'
recovery_target_timeline = 'latest'
EOF

if [[ -n "$RECOVERY_TARGET_TIME" ]]; then
  cat >> "$TARGET_PGDATA/recovery.conf" <<EOF
recovery_target_time = '${RECOVERY_TARGET_TIME}'
EOF
  echo "Configured recovery_target_time=${RECOVERY_TARGET_TIME}"
fi

# For PostgreSQL 12+ can ensure recovery.signal file exists and remove standby.signal
if [[ -n "$(find "$TARGET_PGDATA" -maxdepth 1 -name 'postgresql.conf' -print -quit)" ]]; then
  touch "$TARGET_PGDATA/recovery.signal"
fi

cat >> "$TARGET_PGDATA/postgresql.auto.conf" <<EOF
restore_command = 'aws s3 cp "${WAL_ARCHIVE_S3_BUCKET}/wal/%f" "%p" --sse ${S3_SSE_ALGORITHM} --quiet'
recovery_target_timeline = 'latest'
EOF

if [[ -n "$RECOVERY_TARGET_TIME" ]]; then
  cat >> "$TARGET_PGDATA/postgresql.auto.conf" <<EOF
recovery_target_time = '${RECOVERY_TARGET_TIME}'
EOF
fi

cat > "$TARGET_PGDATA/pitr_instructions.txt" <<EOF
PITR prepared at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
* data directory: $TARGET_PGDATA
* using base backup: $BASEBACKUP_FILE
* WAL archive source: $WAL_ARCHIVE_S3_BUCKET/wal
* recovery_target_time: ${RECOVERY_TARGET_TIME:-latest}

Start PostgreSQL from this directory:
  export PGDATA=$TARGET_PGDATA
  pg_ctl -D "$TARGET_PGDATA" start

Monitor logs for recovery progress in pg_wal/recovery.done.
EOF

echo "PITR setup complete. PostgreSQL can be started from $TARGET_PGDATA"
