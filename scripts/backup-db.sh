#!/usr/bin/env bash
# =============================================================================
# Daily Postgres backup → encrypted tarball → S3-compatible object storage.
#
# Spec §6.2 requires daily backups with 30-day retention. The free Supabase
# tier only keeps 7 days of point-in-time recovery, so we run our own
# pg_dump on top — survivable even if the Supabase project is deleted.
#
# What this script does:
#   1. Runs `pg_dump` against $DATABASE_URL (custom format, parallel-friendly).
#   2. Encrypts the dump with `gpg --symmetric` using $BACKUP_PASSPHRASE.
#   3. Uploads the encrypted blob to S3-compatible storage via `aws s3 cp`
#      (Hetzner Storage Box, AWS S3, Backblaze B2, Cloudflare R2 all work).
#   4. Deletes any object older than $BACKUP_RETENTION_DAYS (default 30).
#
# Required env vars:
#   DATABASE_URL              postgres://USER:PASS@HOST:PORT/DB?sslmode=require
#   BACKUP_PASSPHRASE         random ≥32 chars; store separately from DB!
#   BACKUP_S3_BUCKET          e.g. priya-db-backups
#   BACKUP_S3_PREFIX          e.g. prod/   (optional, defaults to "")
#   AWS_ACCESS_KEY_ID         S3 access key
#   AWS_SECRET_ACCESS_KEY     S3 secret
#   AWS_DEFAULT_REGION        e.g. eu-central-1
#   AWS_ENDPOINT_URL          (optional) for non-AWS providers
#
# Optional:
#   BACKUP_RETENTION_DAYS     default 30 (per spec §6.2).
#   PG_DUMP_BIN               default `pg_dump` from PATH.
#
# Test locally:
#   DATABASE_URL=postgres://… BACKUP_PASSPHRASE=… BACKUP_S3_BUCKET=… ./scripts/backup-db.sh
#
# Restore (run on a target DB; verify on staging first!):
#   aws s3 cp s3://$BUCKET/$KEY ./backup.dump.gpg
#   gpg --decrypt --batch --passphrase "$BACKUP_PASSPHRASE" backup.dump.gpg > backup.dump
#   pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_URL" backup.dump
# =============================================================================

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"

PREFIX="${BACKUP_S3_PREFIX:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="${PREFIX}backup-${TS}.dump.gpg"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

DUMP_FILE="$TMPDIR/backup-${TS}.dump"
ENC_FILE="$TMPDIR/backup-${TS}.dump.gpg"

echo "[$(date -u +%FT%TZ)] dumping database..."
# --format=custom is compressed and pg_restore-friendly.
# --no-owner / --no-privileges keep the dump portable across roles.
"$PG_DUMP_BIN" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --dbname "$DATABASE_URL" \
  --file "$DUMP_FILE"

DUMP_BYTES="$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")"
echo "[$(date -u +%FT%TZ)] dump complete: ${DUMP_BYTES} bytes"

echo "[$(date -u +%FT%TZ)] encrypting..."
gpg --batch --yes \
    --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_PASSPHRASE" \
    --output "$ENC_FILE" \
    "$DUMP_FILE"

echo "[$(date -u +%FT%TZ)] uploading s3://$BACKUP_S3_BUCKET/$KEY ..."
S3_ARGS=(s3 cp "$ENC_FILE" "s3://$BACKUP_S3_BUCKET/$KEY" \
  --no-progress \
  --metadata "ts=$TS,db_url_host=$(echo "$DATABASE_URL" | sed -E 's@.*@@;s@.*//[^@]+@@;s@/.*@@')")
if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
  S3_ARGS=(--endpoint-url "$AWS_ENDPOINT_URL" "${S3_ARGS[@]}")
fi
aws "${S3_ARGS[@]}"

echo "[$(date -u +%FT%TZ)] cleaning objects older than $RETENTION_DAYS days..."
# `aws s3 ls` shows "<date> <size> <key>" lines. We iterate, parse the
# date, and delete anything older than the cutoff.
CUTOFF_EPOCH="$(date -u -d "$RETENTION_DAYS days ago" +%s 2>/dev/null || date -u -v-"${RETENTION_DAYS}d" +%s)"

LIST_ARGS=(s3 ls "s3://$BACKUP_S3_BUCKET/$PREFIX" --recursive)
if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
  LIST_ARGS=(--endpoint-url "$AWS_ENDPOINT_URL" "${LIST_ARGS[@]}")
fi

aws "${LIST_ARGS[@]}" | while read -r DATE TIME _SIZE NAME; do
  [[ -z "${NAME:-}" ]] && continue
  OBJ_EPOCH="$(date -u -d "${DATE} ${TIME}" +%s 2>/dev/null || \
               date -u -j -f "%Y-%m-%d %H:%M:%S" "${DATE} ${TIME}" +%s 2>/dev/null || echo 0)"
  if (( OBJ_EPOCH > 0 && OBJ_EPOCH < CUTOFF_EPOCH )); then
    echo "  deleting s3://$BACKUP_S3_BUCKET/$NAME"
    DEL_ARGS=(s3 rm "s3://$BACKUP_S3_BUCKET/$NAME")
    if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
      DEL_ARGS=(--endpoint-url "$AWS_ENDPOINT_URL" "${DEL_ARGS[@]}")
    fi
    aws "${DEL_ARGS[@]}" >/dev/null
  fi
done

echo "[$(date -u +%FT%TZ)] OK — uploaded $KEY (${DUMP_BYTES} bytes pre-encryption)"
