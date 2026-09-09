# Operación del VPS

VPS `148.230.72.17` (2 vCPU, 8 GB RAM). Acceso: `ssh -i ~/.ssh/deploy_vps root@148.230.72.17`.
Es el runtime real de todo: HUB **no** corre en Vercel (`vercel.json` era decorativo y se borró).

## Procesos (PM2)

| Proceso | Puerto | Path | Qué es |
|---|---|---|---|
| `hub` | 3001 | `/opt/hub` (Next standalone) | HUB. Lo deploya GitHub Actions. |
| `cotizador-bot` | 8090 | `/opt/cotizador-bot` | Cotizador emisivo (FastAPI, JSF sobre siviajo.com), `--workers 1`. |
| `cotizador-nacional` | 8091 | `/opt/cotizador-nacional` | Mismo código, `.env` distinto (cabotaje sobre cuartocontinente.com). |
| `backend`, `invoice-bot`, `video-downloader` | — / — / 8096 | `/opt/*` | Otros servicios; no forman parte del loop. |
| — | :8095 | nginx | App de video (`auth_request`). |

`/root/tc-requote-bot` no es un proceso: lo invoca el cron a las 03:00 UTC y HUB lo spawnea bajo demanda
(recotización, subida de SEO). Repo: `github.com/ezequielmayoni-afk/tc-requote-bot`; copia local en `~/tc-requote-bot`.

## Deploy de HUB

`push` a `main` → `.github/workflows/deploy.yml`: `npm ci` → `vitest run` → `npm run build` → rsync del build
standalone a `/opt/hub` → `pm2 delete hub && PORT=3001 pm2 start server.js --name hub`.

- `.env.local` de producción vive en `/opt/hub/.env.local` y **no** se sube en el rsync.
- El rsync lleva `--delete`: **todo lo que no viene en el build desaparece de `/opt/hub`**. Por eso el script del
  cron y su secreto viven en `/opt/hub-cron/` (el primer deploy después de la Fase 0 los borró de `/opt/hub/bin`).
- Un deploy reinicia PM2: los jobs en curso pierden el proceso, pero el lease vence y el próximo tick los
  reencola (`requeue_stale_jobs`). Por eso todo job tiene que ser idempotente.

## Crontab

Fuente de verdad: `ops/crontab.vps`. Se instala con `ops/install-crontab.sh` (hace backup del anterior en
`/root/crontab.backup.*`). Horas en UTC (ART = UTC−3).

`ops/hub-cron.sh <ruta>` hace el `curl` a `http://127.0.0.1:3001/api/cron/<ruta>` con
`Authorization: Bearer $CRON_SECRET`, leído de **`/opt/hub-cron/.env.cron`** (root, modo 600). El crontab no contiene
secretos. Log: `/var/log/hub-cron.log` (los ticks vacíos no se loguean).

| Cuándo (UTC) | Ruta | Qué hace |
|---|---|---|
| cada minuto | `jobs-tick` | Un tick del runner de jobs. |
| 06:00 | `refresh-packages` | Importa paquetes nuevos de TC y refresca precios. |
| 06:15 | `enqueue?schedule=daily` | `cupo.link_refresh`, `health.check`, `health.digest` (a las 10:00 UTC = 07:00 ART). |
| 06:30 | `enqueue?schedule=nightly` | `tc.reconcile`; Fase 8: rollup del CRM. |
| cada hora | `enqueue?schedule=hourly` | `insights.sync` (ayer; a las 09 UTC los últimos 7 días; domingos 30) → al terminar encola `marketing.guard`. |
| 12:00 | `check-deadlines` | Vencimientos de 48 h (cotización manual, diseño). |
| lunes 08:00 | `enqueue?schedule=weekly` | `trend.run`, `demand.signals`, `profile.audit`; Fase 13: competencia. |

## Runner de jobs

Cola en Postgres (`hub_jobs`), drenada por el tick. Un job por `kind`, handler en `src/lib/jobs/handlers/<kind>.ts`.

- **Lanes** (`src/lib/jobs/lanes.ts`): concurrencia y ventana horaria por recurso. `cotizador` sólo de noche
  (01–10 UTC) y `crm` sólo 05–09 UTC, salvo jobs con `priority >= 8` (clic desde la UI).
- **Kill switches** (`system_flags`): apagado ⇒ el job termina `skipped`, nunca `failed`. Se manejan en
  `/automatizacion`.
- **Presupuesto** (`provider_budgets` + `external_calls`): al 100 % los jobs del proveedor quedan `skipped`.
- **Lease**: 15 min con heartbeat cada 30 s. Lease vencido ⇒ vuelve a `queued`.
- **Dedupe**: `dedupe_key` único mientras el job esté `queued`/`running`.

Depurar: `SELECT id, kind, status, attempts, last_error, created_at FROM hub_jobs ORDER BY id DESC LIMIT 50;`
Disparar un tick a mano: `ssh ... '/opt/hub-cron/hub-cron.sh jobs-tick'`.

## Tendencias (Fase 1 del loop)

Corre sola los lunes a las 08:00 UTC (`enqueue?schedule=weekly` → jobs `trend.run` y `demand.signals`) o con
"Correr ahora" en `/producto/tendencias` (sección `producto`: admin, marketing y producto).

- `trend.run` (lane `serpapi`, flag `automation.serpapi_calls`, presupuesto `serpapi`): sólo demanda de mercado,
  nada de siviajo.com. (1) Autocomplete de Google con expansión por letra descubre destinos (gratis, ~110
  consultas); (2) consultas relacionadas de "paquetes", "viajes", "vuelos", "vacaciones", "all inclusive",
  "escapadas", "crucero" en Trends AR (7 llamadas) dan volumen relativo e "en alza"; (3) Google Trends compara 41 destinos
  (los 17 más fuertes del descubrimiento + los que tienen paquetes en el catálogo, primero los de más paquetes) con
  "paquetes X", "viaje X" y "vuelos X" en grupos con un ancla mediana del primer grupo (30 llamadas; el score es el
  promedio de las dos mejores plantillas) + relacionadas de los 4 primeros (4); YouTube corrobora (gratis, ~60
  consultas); (4) "tendencias ahora" de Argentina (1 llamada). **42 llamadas a SerpAPI por corrida** (tope diario 250, mensual 2.500 en `provider_budgets`). Cruce con `packages` + `package_destinations` (alias ES↔EN en
  `src/lib/tendencias/config.ts`) → opportunity | gap | saturated | declining → alertas. Escribe `trend_runs`
  (con `buzz`: lo que se busca y de lo que se habla), `trend_destinations` (con `signals` por fuente), `trend_alerts`.
  Tarda ~3 min. El momentum sólo se calcula contra una corrida de menos de 21 días.
- `demand.signals` (lane `default`, sin proveedor): dólar minorista/mayorista del BCRA (API v4) y blue con brecha,
  fines de semana largos (argentinadatos). Upsert en `demand_signals_weekly`.
- Código: `src/lib/tendencias/**`; cliente `src/lib/serpapi/client.ts` (registra cada llamada en `external_calls`).
- Requiere `SERPAPI_API_KEY` en `/opt/hub/.env.local` (misma cuenta que usaba media-os).
- Depurar: `SELECT week_label, status, trigger, duration_ms, error FROM trend_runs ORDER BY created_at DESC LIMIT 5;`
  y `SELECT * FROM demand_signals_weekly WHERE destination_code = '*' ORDER BY week_label DESC;`

## Guard de marketing (Fase 2 del loop)

Modo en `automation_modes.marketing_guard` (shadow | semi | auto; se cambia en `/automatizacion`). Decisiones en
`ad_decisions`; pantalla en `/tareas` (aprobar, rechazar, deshacer). Reglas en `src/lib/marketing/guard/rules.ts`.

- **Qué mira**: anuncios `ACTIVE` con `auto_managed = true` cuyo paquete está vencido, no visible, inactivo en TC o con
  cupo agotado (vínculo `flight_package_links` confirmado o de confianza alta); precio distinto al de la creatividad
  (`notification_settings.price_change_threshold_pct`, el único umbral); CTR o costo por conversación fuera de umbral.
- **Salidas múltiples**: si el paquete tiene `departure_group_id` y otra salida del grupo tiene lugares, en vez de pausar
  crea una redirección en `siv_redirects` (el bot del CRM responde con la salida nueva al recibir el SIV viejo) y pide
  creatividad con la fecha nueva. Se agrupa desde la tabla de paquetes ("Agrupar salidas").
- **Sombra** registra "haría X"; **semi** aplica lo determinista (vencido, no visible, inactivo, cupo agotado confirmado)
  con aviso a Slack y deshacer; **auto** aplica también las pausas por precio. Los avisos de rendimiento nunca pausan.
- Si `integration_status.meta` no está `ok`, sólo propone. `automation.meta_writes` apagado ⇒ `skipped`.
- Escrituras en TC (`tc.write`: desactivar, activar, temáticas) van por job con verificación posterior; `activatePackage`
  y `updatePackageThemes` **no están verificados contra TC**: la primera prueba la autoriza Ezequiel.
- Depurar: `SELECT rule, action, status, reason FROM ad_decisions ORDER BY id DESC LIMIT 30;`

## Producto: perfiles e ideas (Fase 3 del loop)

- `destination_profiles`: usos y costumbres por destino (régimen obligatorio, noches, categoría, temporada, ventana
  de compra, umbral directo/escala). Pantalla `/producto/perfiles`. `profile.audit` corre los lunes y asigna
  `destination_profile_code`, `family`, `is_cupo` y `profile_violations` a los paquetes activos.
- Ideas (`package_ideas`): `/producto/ideas`. `idea.probe` (lane `vuelos`, sólo si `VUELOS_URL` está configurada:
  matrix de vuelos-siviajo para el mes) → `idea.quote` (lane `cotizador`, ventana nocturna salvo manual): valida
  contra el perfil, cotiza con `POST /quote-multi` (fecha flexible por mes) y, si salió con escala y el destino tiene
  umbral, cotiza sólo directo en la misma fecha; la regla directo/escala decide. Máximo dos cotizaciones por idea.
  Cada llamada queda en `quote_runs`; las fechas alternativas en `flight_price_probes`.
- Estados: draft → probing → quoting → priced | needs_review | failed → approved (siempre humano) → saved (hasta la
  Fase 6, a mano: "pegar ID") → verified → imported.
- Env: `COTIZADOR_URL` (127.0.0.1:8090), `COTIZADOR_API_KEY`, opcional `COTIZADOR_NACIONAL_URL` (8091) y
  `COTIZADOR_NACIONAL_API_KEY`; `VUELOS_URL` cuando vuelos-siviajo esté en el VPS.
- Depurar: `SELECT id, status, destination_name, month, quoted_price_pp, chosen_departure_date, error FROM package_ideas ORDER BY id DESC LIMIT 20;`

## vuelos.siviajo.com

Landing de "vuelos baratos" dentro de HUB (no es una app aparte). Barrido nocturno (`flights.sweep.plan`
a las 01:00 UTC vía `enqueue?schedule=hourly` → `flights.sweep`, lane `cotizador`, prioridad 4), kill
switch `automation.flights_sweep`, presupuesto `cotizador_probe` (2500/día). Env nuevas en
`/opt/hub/.env.local`: `NEXT_PUBLIC_VUELOS_BASE_URL`, `VUELOS_PUBLIC_HOST`, `SIVIAJO_BASE_URL`,
`NEXT_PUBLIC_GTM_ID`. nginx de referencia: `ops/nginx/vuelos.siviajo.com.conf` (ya instalado en
`/etc/nginx/sites-enabled/`; falta certbot, requiere que el DNS del dominio apunte acá). Doc completa,
con el procedimiento de cutover del DNS: `docs/VUELOS-BARATOS.md`.

## Rotación de secretos

- `CRON_SECRET`: cambiarlo en `/opt/hub/.env.local` **y** en `/opt/hub-cron/.env.cron`, después `pm2 restart hub`.
- `HUB_API_KEY`: también la usa el bot del CRM (`/api/bot/packages`): coordinar con el equipo del CRM.
- Token de Meta, `SERPAPI_API_KEY`, credenciales del RDS del CRM: sólo en `/opt/hub/.env.local`.

## Bases

- Supabase `phzqsjxouqttpcnqxxuq` (compartida con media-os). Migraciones en `supabase/migrations/`, se aplican
  con la Management API (`SUPABASE_ACCESS_TOKEN`) o desde el SQL editor. Todas las tablas nuevas llevan RLS.
- RDS del CRM: sólo lectura, usuario `hub`, credenciales en `~/.config/siviajo/crm-readonly.env` (local) y
  `CRM_PG_*` en `/opt/hub/.env.local` (VPS). Guía: `docs/CRM-DB-READONLY.md`.
