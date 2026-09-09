#!/usr/bin/env bash
# Dispara una ruta /api/cron/* de HUB desde el crontab del VPS.
#
# Uso: hub-cron.sh <ruta>        ej: hub-cron.sh jobs-tick
#                                    hub-cron.sh "enqueue?schedule=daily"
#
# El secreto vive en /opt/hub/.env.cron (root, modo 600) y nunca en el
# crontab: `crontab -l` no muestra nada sensible.
set -euo pipefail

ENV_FILE="/opt/hub/.env.cron"
BASE_URL="${HUB_CRON_BASE_URL:-http://127.0.0.1:3001}"
LOG="/var/log/hub-cron.log"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "$(date -u +%FT%TZ) ERROR falta $ENV_FILE" >> "$LOG"
  exit 1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "$(date -u +%FT%TZ) ERROR CRON_SECRET vacío en $ENV_FILE" >> "$LOG"
  exit 1
fi

route="${1:?falta la ruta, ej: jobs-tick}"
started=$(date +%s)

# --max-time alto: un tick puede correr varios minutos (no hay maxDuration en
# standalone). El cron del minuto siguiente no se pisa gracias al lock por lane.
if out=$(curl -fsS --max-time 600 -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/$route" 2>&1); then
  status="ok"
else
  status="ERROR"
fi

elapsed=$(( $(date +%s) - started ))
# jobs-tick corre cada minuto: sólo se loguea si hizo algo o falló, para no
# llenar el log con ticks vacíos.
if [[ "$route" != "jobs-tick" || "$status" == "ERROR" || "$out" != *'"claimed":0'* ]]; then
  echo "$(date -u +%FT%TZ) $status $route ${elapsed}s ${out:0:400}" >> "$LOG"
fi

[[ "$status" == "ok" ]]
