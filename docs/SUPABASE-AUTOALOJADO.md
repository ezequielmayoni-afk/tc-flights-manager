# Supabase autoalojado en el VPS

Desde el 2026-10-19 hay un stack oficial de Supabase (Docker) en `/opt/supabase` del VPS `148.230.72.17`, con la
misma versión de Postgres que el proyecto cloud (17.6.1). **Todavía no es producción**: HUB sigue en Supabase cloud
hasta el corte. Supabase cloud queda como respaldo congelado hasta noviembre de 2026 (pedido de Ezequiel).

## Qué hay

- Servicios: Postgres, API REST (PostgREST), Auth (GoTrue), Realtime, Storage, imgproxy, meta, Studio, pooler,
  edge functions. `cd /opt/supabase && docker compose ps`.
- Datos persistentes: `/opt/supabase/volumes/db/data` (Postgres) y `/opt/supabase/volumes/storage` (archivos).
  Fuera de `/opt/hub`, así que el deploy (rsync --delete) no los toca.
- Puertos: sólo localhost (`127.0.0.1:54321` gateway, `5432` Postgres, `6543` pooler). Afuera se entra por
  `https://hub.siviajo.com/supabase/` (nginx, con websocket para Realtime). Studio: túnel SSH
  `ssh -L 54321:127.0.0.1:54321 root@148.230.72.17` y abrir `http://localhost:54321` (usuario y clave en
  `DASHBOARD_USERNAME/PASSWORD` de `/opt/supabase/.env`).
- Secretos: `/opt/supabase/.env` (600), generados con los scripts oficiales. Claves propias: el día del corte cambian
  la URL y las claves en HUB y los bots, y los usuarios vuelven a iniciar sesión (las contraseñas se conservan).
- Cuidado: `/opt/supabase/reset.sh` es del repo oficial y **borra todo**. No usarlo.

## Backups

- Diario 04:30 UTC (`/etc/cron.d/supabase-backup` → `/opt/supabase/backup.sh`): volcado completo de la base, roles,
  archivos de Storage y `.env` del stack en `/opt/backups/supabase-local/<fecha>/`, 14 días. Log en
  `backup.log`. Probado: restaura las 111 tablas en una base descartable.
- Copias de Supabase cloud: `/opt/backups/supabase/<fecha>/` (cada ensayo deja una) y en la iMac
  `~/backups/supabase/`.
- Falta una copia diaria fuera del VPS (decisión pendiente: Drive privado, S3 o similar).

## Ensayos (2026-10-19)

`/opt/supabase/resync-from-cloud.sh` copia todo cloud → autoalojado en ~110 s (sólo lee cloud, con el rol
`hub_migrator`, de sólo lectura + bypass RLS, creado para esto). Tres ensayos completos; lo que encontraron:

1. Los SQL no llegaban al contenedor (`docker exec` sin `-i`). Corregido.
2. Al recrear el esquema public se perdían los permisos de anon/authenticated/service_role (0 de 2.373) y la mitad
   de HUB daba 403. Corregido con los default privileges de Supabase y un re-grant.
3. El trigger `on_auth_user_created` (crea el perfil de cada usuario) vive en `auth`, no en `public`: se recrea.
   Las FKs de `flights`, `profiles` y `system_logs` a `auth.users` y la publicación de Realtime (`flights`,
   `packages`) también.
4. Realtime necesita reinicio después del recambio (OIDs nuevos). Incluido.

Verificación final: 111 tablas y 132.130 filas idénticas tabla por tabla; funciones 25, triggers 16, políticas 78, RLS
en 67 tablas, 340 índices, 71 FKs, 73 secuencias y 2.373 permisos iguales; 335 archivos de Storage (muestra de 10
idéntica byte a byte); 11 pruebas de API (lectura, RLS, escritura, RPC de la cola, login, Realtime, Storage) tres veces
seguidas; 22 pantallas de HUB con login real sin errores (HUB de prueba `pm2 hub-staging`, `127.0.0.1:3011`, apunta a
la copia, con automatización y Slack apagados en la copia).

## Corte (no ejecutado)

1. VPS: `CLOUD_PW=<pw hub_migrator> sh /opt/supabase/cutover.sh` → pausa HUB, bot de facturas y crontab, copia final,
   cambia las variables de `/opt/hub/.env.local`, `/opt/invoice-bot/.env`, `/opt/tc-requote-bot/.env`,
   `/root/tc-requote-bot/.env` (copias en `/opt/backups/supabase/cutover-<fecha>/`).
2. iMac: `sh ops/supabase/cutover-github.sh` → guarda los secretos de build actuales en
   `~/.config/siviajo/github-secrets-cloud.env`, pone los nuevos (la URL del navegador va compilada) y dispara el deploy.
3. VPS: `sh /opt/supabase/cutover-finish.sh` → vuelve el crontab y verifica.
4. Ventana estimada: 10 a 15 minutos (copia ~2 min + deploy ~6 min).

Vuelta atrás: `sh /opt/supabase/rollback.sh` (VPS) y `sh ops/supabase/rollback-github.sh` (iMac). Lo escrito en el
autoalojado después del corte no vuelve solo a cloud.

## Pendientes antes de apagar cloud (noviembre)

- media-os usa la misma Supabase (no está desplegado; cambiar su `.env` si se vuelve a usar).
- El bucket `p1-images` es de la tienda de entradas F1: revisar si esa app usa URLs de `supabase.co`.
- Migraciones: hoy se aplican por la Management API de supabase.com. Después del corte, directo con
  `docker exec -i supabase-db psql -U postgres -d postgres < migracion.sql`.
- Borrar el rol `hub_migrator` en cloud y el usuario de prueba `claude-staging@siviajo.com` (lo borra el corte).
