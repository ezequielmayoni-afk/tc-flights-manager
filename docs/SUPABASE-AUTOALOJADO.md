# Supabase autoalojado en el VPS

Desde el 2026-10-19 hay un stack oficial de Supabase (Docker) en `/opt/supabase` del VPS `148.230.72.17`, con la
misma versión de Postgres que el proyecto cloud (17.6.1). **Es producción desde el 2026-10-19 16:45 UTC** (corte hecho
con OK de Ezequiel): HUB, invoice-bot y tc-requote-bot apuntan acá. Supabase cloud quedó congelado en ese momento como
respaldo hasta noviembre de 2026; no recibe escrituras.

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

## Corte (ejecutado el 2026-10-19)

Resultado: copia final 117 s, 132.130 filas idénticas a cloud ya quieto, deploy con secretos nuevos OK, job de prueba
procesado por el runner contra la base nueva, 22 pantallas de producción sin errores con login real. Copias de los .env
viejos en `/opt/backups/supabase/cutover-20261019T1640Z/`; secretos de build de cloud en
`~/.config/siviajo/github-secrets-cloud.env` (iMac); `.env.local` viejo de la iMac en `~/.config/siviajo/`.

Procedimiento (para referencia o para repetir):

1. VPS: `CLOUD_PW=<pw hub_migrator> sh /opt/supabase/cutover.sh` → pausa HUB, bot de facturas y crontab, copia final,
   cambia las variables de `/opt/hub/.env.local`, `/opt/invoice-bot/.env`, `/opt/tc-requote-bot/.env`,
   `/root/tc-requote-bot/.env` (copias en `/opt/backups/supabase/cutover-<fecha>/`).
2. iMac: `sh ops/supabase/cutover-github.sh` → guarda los secretos de build actuales en
   `~/.config/siviajo/github-secrets-cloud.env`, pone los nuevos (la URL del navegador va compilada) y dispara el deploy.
3. VPS: `sh /opt/supabase/cutover-finish.sh` → vuelve el crontab y verifica.
4. Ventana estimada: 10 a 15 minutos (copia ~2 min + deploy ~6 min).

Vuelta atrás: `sh /opt/supabase/rollback.sh` (VPS) y `sh ops/supabase/rollback-github.sh` (iMac). Lo escrito en el
autoalojado después del corte no vuelve solo a cloud.

## Los demás proyectos de la cuenta (inventario 2026-10-23)

La cuenta de Supabase tiene dos proyectos, los dos en la org `ezequielmayoni-afk's Org`:

| Proyecto | Ref | Qué es | Estado |
|---|---|---|---|
| HUB | `phzqsjxouqttpcnqxxuq` | esta base (HUB, media-os, invoice-bot, tienda F1 con el bucket `p1-images`) | migrada el 2026-10-19; cloud congelado |
| passenger-management | `xjznsnbpnbyrbxfijdjn` (us-east-1) | plataforma de pasajeros y buses para eventos: `eventos.siviajo.com` (admin-dashboard), `operadores.siviajo.com` (operator-portal), app móvil y backend `pm2 backend` en `/var/www/passenger-management-platform` | **sin movimiento desde el 2026-03-17**; 23 tablas, 506 pasajeros, 12 archivos (14 MB), 0 usuarios de Auth; copiada al VPS el 2026-10-23 |

**Copia de passenger-management (2026-10-23):**
- Volcado en `/opt/backups/supabase-cloud/passenger-management/<fecha>/` (`latest.txt` apunta al último): `public.dump`
  (esquema + datos, formato custom), `public_schema_con_permisos.sql` (con políticas y grants), `auth_users.dump`,
  `storage_meta.dump`, `storage/chat-attachments/` (los 12 archivos), `roles.txt`, `filas_cloud.txt`. Copia en la iMac:
  `~/backups/supabase/passenger-management/<fecha>/`.
- Restaurada además como base aparte **`passenger_management`** en el Postgres autoalojado (`docker exec supabase-db
  psql -U postgres -d passenger_management`): 23 tablas con las mismas filas que cloud, 7 funciones, 5 triggers, 100
  políticas. Tiene un esquema `auth` mínimo (`uid()`, `role()`, `jwt()`) para que las políticas carguen; no la sirven
  PostgREST, Auth ni Storage del stack (que sólo atienden la base `postgres`).
- Se hizo con el rol de sólo lectura `pass_migrator` (bypass RLS) creado en cloud por la Management API y el pooler
  `aws-1-us-east-1.pooler.supabase.com:5432` (usuario `pass_migrator.<ref>`); la contraseña no se guardó: si hace falta
  otro volcado, `alter role pass_migrator password ...` por la Management API.

**Lo que todavía apunta al cloud de passenger-management** (si se da de baja, deja de andar):
- `pm2 backend` (`/var/www/passenger-management-platform/backend/.env`: `SUPABASE_URL` + clave anon).
- El build estático de `admin-dashboard` (3 archivos con la URL compilada) y la app móvil (`mobile-app/src/services/supabase.js`).

Opciones: (a) apagar la plataforma (`pm2 stop backend` y dejar los sitios estáticos o bajarlos); (b) levantar un
segundo stack autoalojado para ella (compose aparte con otros puertos, nginx y claves nuevas) y recompilar dashboard
y app móvil con la URL nueva. Mientras no se decida, el proyecto cloud tiene que seguir vivo.

## Pendientes antes de apagar cloud (noviembre)

- media-os: su `.env.local` en la iMac ya apunta a `https://hub.siviajo.com/supabase` con las claves del stack
  (cambiado el 2026-10-23; copia del anterior en `.env.local.bak-cloud-20261023`).
- El bucket `p1-images` (tienda F1) ya está en el stack (335 archivos) y `p1landing` usa `127.0.0.1:54321`.
- passenger-management: decidir (a) o (b) de arriba antes de cancelar la cuenta.
- Migraciones: hoy se aplican por la Management API de supabase.com. Después del corte, directo con
  `docker exec -i supabase-db psql -U postgres -d postgres < migracion.sql`.
- Borrar el rol `hub_migrator` en cloud y el usuario de prueba `claude-staging@siviajo.com` (lo borra el corte).
