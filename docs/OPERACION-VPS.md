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
| 06:15 | `enqueue?schedule=daily` | Encola los jobs diarios. |
| 06:30 | `enqueue?schedule=nightly` | Encola el rollup del CRM (corre en la ventana 05–09 UTC del lane `crm`). |
| cada hora | `enqueue?schedule=hourly` | Insights de Meta → guard → autopilot. |
| 12:00 | `check-deadlines` | Vencimientos de 48 h (cotización manual, diseño). |
| lunes 08:00 | `enqueue?schedule=weekly` | Tendencias, competencia, auditoría de perfiles. |

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

## Rotación de secretos

- `CRON_SECRET`: cambiarlo en `/opt/hub/.env.local` **y** en `/opt/hub-cron/.env.cron`, después `pm2 restart hub`.
- `HUB_API_KEY`: también la usa el bot del CRM (`/api/bot/packages`): coordinar con el equipo del CRM.
- Token de Meta, `SERPAPI_API_KEY`, credenciales del RDS del CRM: sólo en `/opt/hub/.env.local`.

## Bases

- Supabase `phzqsjxouqttpcnqxxuq` (compartida con media-os). Migraciones en `supabase/migrations/`, se aplican
  con la Management API (`SUPABASE_ACCESS_TOKEN`) o desde el SQL editor. Todas las tablas nuevas llevan RLS.
- RDS del CRM: sólo lectura, usuario `hub`, credenciales en `~/.config/siviajo/crm-readonly.env` (local) y
  `CRM_PG_*` en `/opt/hub/.env.local` (VPS). Guía: `docs/CRM-DB-READONLY.md`.
