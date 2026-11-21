#!/bin/sh
set -eu

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${WAHA_API_KEY:?WAHA_API_KEY is required}"

mkdir -p /app/.sessions
chmod 0775 /app/.sessions || true

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

/usr/local/bin/tigrisfs \
  --endpoint "${R2_ENDPOINT}" \
  --region auto \
  -f "${R2_BUCKET_NAME}" \
  /app/.sessions &
FUSE_PID=$!

cleanup() {
  fusermount -u /app/.sessions 2>/dev/null || true
  kill "$FUSE_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

attempt=0
until mountpoint -q /app/.sessions; do
  if ! kill -0 "$FUSE_PID" 2>/dev/null; then
    echo "TigrisFS exited before the TWIGA WhatsApp session bucket mounted." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Timed out mounting the per-business R2 session bucket." >&2
    exit 1
  fi
  sleep 1
done

echo "Per-business WAHA session bucket mounted."
exec /entrypoint.sh
