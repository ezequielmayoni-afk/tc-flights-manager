#!/bin/sh
# VUELTA ATRÁS: restaura los .env del último corte (apuntan otra vez a Supabase cloud) y reinicia.
# Lo que se haya escrito en el autoalojado después del corte NO vuelve solo a cloud (queda en /opt/supabase).
set -eu
STAMP=$(cat /opt/backups/supabase/cutover-latest.txt)
BK=/opt/backups/supabase/cutover-$STAMP
for f in /opt/hub/.env.local /opt/invoice-bot/.env /opt/tc-requote-bot/.env /root/tc-requote-bot/.env; do
  b="$BK/$(echo "$f" | tr / _)"; [ -f "$b" ] && cp -p "$b" "$f" && echo "restaurado $f"
done
pm2 restart invoice-bot --update-env >/dev/null
crontab "$BK/crontab.txt"
echo "Falta: desde la iMac, sh ops/supabase/rollback-github.sh (secretos viejos + deploy)"
