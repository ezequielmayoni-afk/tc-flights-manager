#!/usr/bin/env bash
# Deploy de la landing F1 al VPS. Uso: ./deploy.sh
# Requisitos: SSH key para root@148.230.72.17, rsync, Node 20+ en el VPS.
# Qué hace:
#   1. rsync del código a /opt/f1-landing (excluye node_modules/.next/.env)
#   2. En el VPS: npm ci + npm run build
#   3. PM2 start/restart en el puerto 3005
set -euo pipefail

VPS_HOST="${VPS_HOST:-148.230.72.17}"
VPS_USER="${VPS_USER:-root}"
VPS_PATH="/opt/f1-landing"
APP_NAME="f1-landing"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy_vps}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

echo "🚀 Deploy $APP_NAME → $VPS_USER@$VPS_HOST:$VPS_PATH"

echo "📦 Sincronizando código…"
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env.local' \
  --exclude='.git' \
  --exclude='*.log' \
  ./ "$VPS_USER@$VPS_HOST:$VPS_PATH/"

echo "🔧 Instalando + build + PM2 en el VPS…"
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" bash -s <<EOF
set -euo pipefail
cd "$VPS_PATH"
# Hereda credenciales de la BD si no hay .env.local propio.
if [ ! -f .env.local ] && [ -f /opt/hub/.env.local ]; then
  echo "⚠️  Sin .env.local propio; copiá las claves necesarias (ver .env.example)."
fi
npm ci
npm run build
pm2 describe $APP_NAME >/dev/null 2>&1 && pm2 restart $APP_NAME || pm2 start ecosystem.config.js
pm2 save
EOF

echo "✅ Deploy completo. Landing en http://$VPS_HOST:3005 (configurá nginx/dominio aparte)."
