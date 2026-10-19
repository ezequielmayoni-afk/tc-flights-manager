#!/bin/sh
# Backup diario del Supabase autoalojado (/opt/supabase): volcado completo de la base (todos los esquemas:
# public, auth, storage...) + archivos de Storage. Guarda 14 días en /opt/backups/supabase-local.
# Instalado como /etc/cron.d/supabase-backup (04:30 UTC). Restaurar: ver docs/OPERACION-VPS.md.
set -eu
DEST=/opt/backups/supabase-local
KEEP_DAYS=14
TS=$(date -u +%Y%m%dT%H%MZ)
cd /opt/supabase
PGPW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
mkdir -p "$DEST/$TS"
chmod 700 "$DEST"
docker exec -e PGPASSWORD="$PGPW" supabase-db pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc -f /tmp/full.dump
docker cp supabase-db:/tmp/full.dump "$DEST/$TS/full.dump"
docker exec supabase-db rm -f /tmp/full.dump
docker exec -e PGPASSWORD="$PGPW" supabase-db pg_dumpall -h 127.0.0.1 -U supabase_admin --roles-only > "$DEST/$TS/roles.sql"
tar -C /opt/supabase/volumes -czf "$DEST/$TS/storage.tgz" storage
cp /opt/supabase/.env "$DEST/$TS/stack.env"; chmod 600 "$DEST/$TS/stack.env"
docker exec -e PGPASSWORD="$PGPW" supabase-db psql -h 127.0.0.1 -U postgres -d postgres -Atc "select 'filas', sum(n_live_tup) from pg_stat_user_tables where schemaname='public'" > "$DEST/$TS/counts.txt"
find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime +$KEEP_DAYS -exec rm -rf {} +
echo "$(date -u +%FT%TZ) ok $TS $(du -sh "$DEST/$TS" | cut -f1)" >> "$DEST/backup.log"
