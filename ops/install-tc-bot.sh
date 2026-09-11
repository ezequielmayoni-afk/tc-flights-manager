#!/usr/bin/env bash
# Copia el bot de fecha alternativa junto al tc-requote-bot del VPS (usa su Playwright y su .env).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VPS_HOST="${VPS_HOST:-148.230.72.17}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy_vps}"
BOT_DIR="${BOT_DIR:-/root/tc-requote-bot}"
echo "→ copiando switch-date.js a $BOT_DIR"
scp -q -i "$SSH_KEY" "$HERE/tc-bot/switch-date.js" "$VPS_USER@$VPS_HOST:$BOT_DIR/switch-date.js"
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $BOT_DIR && node -e \"require('playwright'); require('dotenv'); console.log('   playwright y dotenv disponibles')\" && ls -la switch-date.js"
echo "→ ok"
