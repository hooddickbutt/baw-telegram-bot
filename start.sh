#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ $# -lt 1 ]]; then
  echo "ব্যবহার: ./start.sh <আপনার_টেলিগ্রাম_ইউজার_আইডি>" >&2
  echo "আইডি পেতে টেলিগ্রামে @userinfobot-এ মেসেজ পাঠান।" >&2
  exit 1
fi

OWNER_ID="$1"
if [[ ! "$OWNER_ID" =~ ^[0-9]+$ ]]; then
  echo "OWNER_TELEGRAM_ID অবৈধ। শুধু সংখ্যা দিন, যেমন 123456789।" >&2
  exit 1
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN এনভায়রনমেন্টে সেট নেই। বট টোকেন ফাইলে লিখবেন না।" >&2
  exit 1
fi

export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
export OWNER_TELEGRAM_ID="$OWNER_ID"

if ! command -v baw >/dev/null 2>&1; then
  echo "baw কমান্ড পাওয়া যায়নি। আগে ইনস্টল করুন: npm install -g @binance/agentic-wallet" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js পাওয়া যায়নি।" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "নির্ভরশীল প্যাকেজ ইনস্টল করা হচ্ছে..."
  npm install --omit=dev
fi

exec node src/index.js
