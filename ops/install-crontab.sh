#!/usr/bin/env bash
# Instala en el VPS el crontab versionado y el script que lee el secreto.
#
# Uso (desde la máquina de trabajo):
#   ops/install-crontab.sh                 # usa ~/.ssh/deploy_vps y root@148.230.72.17
#   VPS_HOST=1.2.3.4 ops/install-crontab.sh
#
# Qué hace en el VPS:
#   1. copia ops/hub-cron.sh a /opt/hub/bin/ (ejecutable)
#   2. si no existe /opt/hub/.env.cron, lo crea tomando CRON_SECRET de
#      /opt/hub/.env.local (modo 600); nunca imprime el valor
#   3. guarda una copia del crontab actual en /root/crontab.backup.<fecha>
#   4. instala ops/crontab.vps como crontab de root
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VPS_HOST="${VPS_HOST:-148.230.72.17}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy_vps}"
SSH="ssh -i $SSH_KEY -o ConnectTimeout=15 $VPS_USER@$VPS_HOST"

echo "→ copiando hub-cron.sh"
$SSH "mkdir -p /opt/hub/bin"
scp -q -i "$SSH_KEY" "$HERE/hub-cron.sh" "$VPS_USER@$VPS_HOST:/opt/hub/bin/hub-cron.sh"
$SSH "chmod 750 /opt/hub/bin/hub-cron.sh"

echo "→ preparando /opt/hub/.env.cron"
$SSH 'set -e
if [ ! -f /opt/hub/.env.cron ]; then
  secret=$(grep -E "^CRON_SECRET=" /opt/hub/.env.local | head -1 | cut -d= -f2- | tr -d "\"")
  if [ -z "$secret" ]; then echo "CRON_SECRET no está en /opt/hub/.env.local" >&2; exit 1; fi
  umask 077
  printf "CRON_SECRET=%s\n" "$secret" > /opt/hub/.env.cron
  chmod 600 /opt/hub/.env.cron
  echo "   creado (600)"
else
  echo "   ya existía, no se toca"
fi'

echo "→ instalando crontab (backup previo en /root/crontab.backup.*)"
scp -q -i "$SSH_KEY" "$HERE/crontab.vps" "$VPS_USER@$VPS_HOST:/tmp/crontab.vps"
$SSH 'crontab -l > /root/crontab.backup.$(date +%Y%m%d%H%M%S) 2>/dev/null || true; crontab /tmp/crontab.vps && rm /tmp/crontab.vps'

echo "→ crontab instalado:"
$SSH "crontab -l | grep -v '^#' | grep -v '^\$'"
echo "→ ok. Verificá en unos minutos: ssh ... 'tail -5 /var/log/hub-cron.log'"
