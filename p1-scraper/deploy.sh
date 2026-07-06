#!/usr/bin/env bash
# Deploy del p1-scraper al VPS desde local.
# Uso: cd p1-scraper && ./deploy.sh   (DEBE correrse desde dentro de p1-scraper/)
#
# Prerequisitos:
#   - SSH key en ~/.ssh/deploy_vps con acceso a root@148.230.72.17
#   - rsync instalado local
#
# Lo que hace:
#   1. rsync del código a /opt/p1-scraper (excluye node_modules, .env.local, .git, logs)
#   2. En el VPS: copia creds desde /opt/hub/.env.local → /opt/p1-scraper/.env.local
#      (si falta), npm ci, pm2 start/restart + save
#   3. Health check con RETRY LOOP: pm2 online + restart count estable (worker cron,
#      NO servidor HTTP, así que no hay curl /health)
set -euo pipefail

VPS_HOST="${VPS_HOST:-148.230.72.17}"
VPS_USER="${VPS_USER:-root}"
VPS_PATH="/opt/p1-scraper"
APP_NAME="p1-scraper"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy_vps}"

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"
echo "🚀 Deploying $APP_NAME → $VPS_USER@$VPS_HOST:$VPS_PATH (key: $SSH_KEY)"

# 1. rsync el código (desde p1-scraper/ — el script vive acá, ./ es la fuente)
echo "📦 Sincronizando código…"
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude='node_modules' \
  --exclude='.git/' \
  --exclude='.env.local' \
  --exclude='.env' \
  --exclude='*.png' \
  --exclude='*.log' \
  --exclude='.planning/' \
  ./ "$VPS_USER@$VPS_HOST:$VPS_PATH/"

# 2. Setup en el VPS (idempotente)
echo "🔧 Setup Node + PM2 en VPS…"
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" bash <<'REMOTE'
set -euo pipefail
cd /opt/p1-scraper

# Si no existe .env.local, copiar las claves necesarias desde /opt/hub/.env.local.
# El archivo escrito queda en /opt/p1-scraper/.env.local — el PRIMER candidato que
# resuelve config.ts en el layout standalone del VPS.
if [ ! -f .env.local ]; then
  if [ -f /opt/hub/.env.local ]; then
    echo "⚙️  Copiando credenciales desde /opt/hub/.env.local → /opt/p1-scraper/.env.local"
    grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|TC_API_BASE_URL|TC_USERNAME|TC_PASSWORD|TC_MICROSITE_ID|TC_SUPPLIER_ID)=" /opt/hub/.env.local > .env.local
  else
    echo "❌ No existe /opt/p1-scraper/.env.local ni /opt/hub/.env.local — abortando deploy." >&2
    exit 1
  fi
fi

# Validar claves críticas (sin imprimir valores)
if ! grep -q "^NEXT_PUBLIC_SUPABASE_URL=" .env.local || ! grep -q "^SUPABASE_SERVICE_ROLE_KEY=" .env.local; then
  echo "❌ Faltan claves Supabase en /opt/p1-scraper/.env.local — abortando." >&2
  exit 1
fi

# Instalar deps (npm ci si hay lockfile, sino npm install). devDeps incluyen tsx.
if [ -f package-lock.json ]; then
  echo "📥 npm ci"
  npm ci
else
  echo "📥 npm install (sin lockfile)"
  npm install
fi

# PM2 restart o start
if pm2 list | grep -q "p1-scraper"; then
  echo "🔄 PM2 restart p1-scraper"
  pm2 restart p1-scraper --update-env
else
  echo "🆕 PM2 start p1-scraper"
  pm2 start ecosystem.config.cjs
  pm2 save
fi

# Health check (worker cron, NO HTTP) — RETRY LOOP que exige:
#   status=online AND restart count estable contra el baseline (no crash-loop).
JLIST_NAME='p1-scraper'
read_field() {
  # $1 = field expr inside the matched app object; emite "status restart"
  pm2 jlist | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d).find(x=>x.name==='p1-scraper');process.stdout.write(a?(a.pm2_env.status+' '+a.pm2_env.restart_time):'missing 0')})"
}

BASE_LINE=$(read_field)
BASE=$(echo "$BASE_LINE" | awk '{print $2}')
echo "ℹ️  baseline restart count = $BASE"

OK=0
for i in $(seq 1 10); do
  sleep 2
  LINE=$(read_field)
  STATUS=$(echo "$LINE" | awk '{print $1}')
  RST=$(echo "$LINE" | awk '{print $2}')
  if [ "$STATUS" = "online" ] && [ "$RST" = "$BASE" ]; then
    echo "✅ p1-scraper online and stable (no new restarts) — attempt $i"
    OK=1
    break
  fi
  echo "… attempt $i: status=$STATUS restarts=$RST (baseline=$BASE)"
done

if [ "$OK" != "1" ]; then
  echo "❌ p1-scraper not stably online (crash-looping or down) — check pm2 logs p1-scraper" >&2
  pm2 logs p1-scraper --lines 30 --nostream || true
  exit 1
fi

pm2 status p1-scraper
REMOTE

echo ""
echo "✅ Deploy completo."
echo "   Logs:        ssh $VPS_USER@$VPS_HOST 'pm2 logs p1-scraper'"
echo "   Force run:   ssh $VPS_USER@$VPS_HOST 'cd /opt/p1-scraper && npx tsx src/cron.ts --now'"
echo "   One-off:     ssh $VPS_USER@$VPS_HOST 'cd /opt/p1-scraper && npx tsx src/run-scrape.ts'"
