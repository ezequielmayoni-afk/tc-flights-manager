#!/bin/sh
# CORTE: Supabase cloud → Supabase autoalojado (/opt/supabase). Corre en el VPS como root.
# NO lo corre ningún cron. Ensayado 3 veces el 2026-10-19 (resync ~110 s).
# Supabase cloud NO se toca: queda congelado como respaldo hasta noviembre de 2026.
#
# Uso:  CLOUD_PW=<pw de hub_migrator> sh /opt/supabase/cutover.sh
# Después, desde la iMac:  sh ops/supabase/cutover-github.sh   (secretos de build + deploy)
# Vuelta atrás:            sh /opt/supabase/rollback.sh  y  sh ops/supabase/rollback-github.sh
set -eu
STAMP=$(date -u +%Y%m%dT%H%MZ)
BK=/opt/backups/supabase/cutover-$STAMP
mkdir -p "$BK"; chmod 700 "$BK"
cd /opt/supabase
NEW_URL=https://hub.siviajo.com/supabase
INTERNAL_URL=http://127.0.0.1:54321
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
SERVICE=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)

echo "1. Pausa: HUB, bot de facturas y crontab"
crontab -l > "$BK/crontab.txt"
crontab -l | sed 's#^\([^#].*hub-cron.sh.*\)$#\#CUTOVER \1#' | crontab -
pm2 stop hub invoice-bot hub-staging >/dev/null 2>&1 || true

echo "2. Copia final de los datos (Supabase cloud queda intacto)"
CLOUD_PW="$CLOUD_PW" sh /opt/supabase/resync-from-cloud.sh

echo "3. Cambio de variables (con copia de cada .env en $BK)"
swap() { # archivo, var-url, var-anon, var-service, url
  f=$1; [ -f "$f" ] || return 0
  cp -p "$f" "$BK/$(echo "$f" | tr / _)"
  sed -i "s#^$2=.*#$2=$5#" "$f"
  [ -n "$3" ] && sed -i "s#^$3=.*#$3=$ANON#" "$f"
  sed -i "s#^$4=.*#$4=$SERVICE#" "$f"
  echo "   $f"
}
swap /opt/hub/.env.local NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY $NEW_URL
swap /opt/invoice-bot/.env SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY $INTERNAL_URL
swap /opt/tc-requote-bot/.env SUPABASE_URL "" SUPABASE_SERVICE_KEY $INTERNAL_URL
swap /root/tc-requote-bot/.env SUPABASE_URL "" SUPABASE_SERVICE_KEY $INTERNAL_URL
echo "$STAMP" > /opt/backups/supabase/cutover-latest.txt

echo "4. Bot de facturas arriba. HUB arranca con el deploy (paso de la iMac: cutover-github.sh)"
pm2 restart invoice-bot --update-env >/dev/null
echo "   Cuando el deploy termine:  sh /opt/supabase/cutover-finish.sh"
