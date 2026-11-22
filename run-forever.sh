#!/usr/bin/env bash
# Restart loop for the owner-only read-only Telegram bot.
# Usage: ./run-forever.sh [OWNER_TELEGRAM_ID]
# Do not print or write TELEGRAM_BOT_TOKEN.

set -u
cd "$(dirname "$0")"

OWNER_ID="${1:-1816442185}"
if [[ ! "$OWNER_ID" =~ ^[0-9]+$ ]]; then
  echo "OWNER_TELEGRAM_ID অবৈধ। শুধু সংখ্যা দিন।" >&2
  exit 1
fi

PIDFILE="./run-forever.pid"
echo $$ > "$PIDFILE"

child_pid=""
stopping=0

cleanup() {
  stopping=1
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill -TERM "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  exit 0
}
trap cleanup INT TERM

while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') starting bot (owner ${OWNER_ID})"
  ./start.sh "$OWNER_ID" &
  child_pid=$!
  wait "$child_pid"
  code=$?
  child_pid=""
  if [[ "$stopping" -eq 1 ]]; then
    rm -f "$PIDFILE"
    exit 0
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') bot exited with code ${code}; restarting in 3s..."
  sleep 3
done
