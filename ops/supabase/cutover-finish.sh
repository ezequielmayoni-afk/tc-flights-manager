#!/bin/sh
# Paso final del corte (después del deploy con los secretos nuevos): vuelve el crontab y prueba.
set -eu
crontab -l | sed 's#^\#CUTOVER ##' | crontab -
sleep 5
curl -s -o /dev/null -w "HUB /login: %{http_code}\n" http://127.0.0.1:3001/login
grep -q '^NEXT_PUBLIC_SUPABASE_URL=https://hub.siviajo.com/supabase' /opt/hub/.env.local && echo "HUB apunta al Supabase autoalojado"
grep -rl "hub.siviajo.com/supabase" /opt/hub/.next/static/chunks 2>/dev/null | head -1 | grep -q . && echo "El build del navegador tiene la URL nueva" || echo "ATENCIÓN: el build del navegador NO tiene la URL nueva (¿secretos de GitHub?)"
