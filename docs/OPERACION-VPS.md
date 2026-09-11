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

`/root/tc-requote-bot` no es un proceso: HUB lo spawnea bajo demanda sólo para la subida de SEO. Su recotización
nocturna (cron de las 03:00 UTC) se retiró el 2026-09-10: la hace el job `package.requote` (ver "Monitoreo de precio"). Repo: `github.com/ezequielmayoni-afk/tc-requote-bot`; copia local en `~/tc-requote-bot`.

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
  creatividad con la fecha nueva. Los grupos `auto:…` los calcula `cupo.link_refresh` por firma de producto
  (`src/lib/cupos/departure-groups.ts`: origen + destinos + noches en más de una fecha); un grupo manual `grp-…`
  desde "Agrupar salidas" manda sobre el automático.
- **Sombra** registra "haría X"; **semi** aplica lo determinista (vencido, no visible, inactivo, cupo agotado confirmado)
  con aviso a Slack y deshacer; **auto** aplica también las pausas por precio. Los avisos de rendimiento nunca pausan.
- Si `integration_status.meta` no está `ok`, sólo propone. `automation.meta_writes` apagado ⇒ `skipped`.
- Escrituras en TC (`tc.write`: desactivar, activar, temáticas) van por job con verificación posterior; `activatePackage`
  y `updatePackageThemes` **no están verificados contra TC**: la primera prueba la autoriza Ezequiel.
- Depurar: `SELECT rule, action, status, reason FROM ad_decisions ORDER BY id DESC LIMIT 30;`

## Monitoreo de precio de paquetes publicados (desde 2026-09-10, por el cotizador)

- Reemplaza al `tc-requote-bot` (Playwright con sesión de agente en siviajo.com, que la verificación por email
  dejó sin poder entrar). La línea de las 03:00 salió del crontab; el código del bot queda en `/root/tc-requote-bot`
  sólo por su modo de subida de SEO.
- `enqueue?schedule=nightly` encola `package.requote.plan` → un `package.requote` por paquete con
  `monitor_enabled` y `tc_active` (los de cupo se saltean: el aéreo es de contrato) → `package.requote.notify`
  manda a Slack el resumen de los que quedaron en revisión manual (uno por 24 h).
- Cada `package.requote` le pide al cotizador la misma combinación que vende el paquete (origen del vuelo,
  fecha, un tramo por hotel con destino, noches, régimen y hotel, pasajeros, directo si el paquete vuela
  directo; `src/lib/requote/package-request.ts`), guarda la llamada en `quote_runs` (`purpose = requote`) y
  compara el precio de la opción que trae el mismo hotel contra `target_price` (o el precio actual):
  sube más que `notification_settings.requote_variance_threshold_pct` (10 %) → `needs_manual`; si no →
  `completed`; si el hotel no aparece en la búsqueda → `needs_manual` con el motivo. Todo queda en
  `packages.requote_note`/`requote_source` y en `package_requote_logs` (`source = cotizador`).
- Lo que ya no pasa: "Actualizar y guardar idea" en siviajo.com. Si el precio bajó más que el umbral, la nota
  lo dice y la idea se actualiza a mano (o por JSF en la Fase 6).
- "Recotizar ahora" en `/packages` (`POST /api/requote/run`) encola los mismos jobs con prioridad manual y va
  mostrando el avance; cada paquete tarda ~1 min porque el lane `cotizador` corre de a uno.
- Depurar: `SELECT id, tc_package_id, requote_status, requote_price, requote_variance_pct, requote_note, last_requote_at FROM packages WHERE monitor_enabled ORDER BY last_requote_at DESC;`
  y `SELECT * FROM package_requote_logs ORDER BY checked_at DESC LIMIT 20;`.

## Cupo agotado → aéreo de sistema (desde 2026-09-11)

Cuando un cupo se agota y el paquete tiene que seguir vendiéndose con el mismo ID (indexación en Google,
anuncios de Meta con el mismo SIV), el aéreo se cambia por una tarifa de sistema. El orden importa:

1. **En TC, a mano**: en el paquete vacacional sacarle el "fijo" al aéreo, buscar la tarifa de sistema similar,
   actualizar y guardar.
2. **En HUB**: botón "Pasó a sistema" en la tarea de cupos agotados (`/tareas`) o en la selección de `/packages`.
   HUB relee el paquete en TC (aéreo, hoteles, destinos, precio). Si TC sigue devolviendo el aéreo como contrato,
   contesta con el motivo y no toca nada. Si ya es de sistema: `is_cupo = false`, precio y fechas nuevos (con
   historial de precio y aviso a diseño si estaba en marketing), vínculos con el cupo liberados
   (`flight_package_links.rejected`, revisión `switched_to_system`), monitoreo encendido con el precio nuevo como
   objetivo y primera recotización encolada. `packages.switched_to_system_at/by` guardan quién y cuándo.
3. El import diario también lo reclasifica solo (el aéreo viene sin proveedor de contrato), pero sin el botón no
   se prende el monitoreo ni se liberan los vínculos.

### Fecha alternativa en la misma temporada (2026-09-11)

Antes de reemplazar el vuelo en la misma fecha a cualquier precio, HUB busca la mejor fecha de la misma temporada
del perfil (`high_season_months`: si la salida era de temporada alta, otra fecha de esa misma alta; enero 17 con
[1,2,7,12] → enero–febrero del mismo año; en baja, el bloque de meses bajos, recortado a ±31 días si es largo).

- **Propuesta** (`package.alternative_date`, lane cotizador, 3 a 5 min): sondea el aéreo de sistema por fecha
  (mismo día de la semana que la salida, cada semana de la ventana; reutiliza las sondas de la semana de
  vuelos.siviajo.com si coinciden ruta y noches, y guarda las nuevas en `flight_price_probes`), aplica la regla
  directo/escala del perfil por fecha, cotiza el paquete completo (mismos hoteles, noches, pasajeros) en las dos
  mejores y guarda la mejor en `requote_alternatives` (estado `proposed`). En la tarea de cupos agotados:
  "Buscar fecha en la temporada" → propuesta con fecha, aéreo, precio y desvío → "Aprobar fecha" / "Rechazar".
- **Aplicación** (`package.apply_alternative`, lane default, flags `tc_writes` + `jsf_writes`): lanza el bot
  `ops/tc-bot/switch-date.js` (Playwright; se instala en `/root/tc-requote-bot/` con `ops/install-tc-bot.sh` y
  usa el `.env` del tc-requote-bot: HUBSIVIAJO). El bot: (1) backoffice `/admin/holidays` → Editar → pestaña
  Fechas: pone Desde/Hasta en la fecha nueva y tilda su día de la semana, Guardar; (2) el sitio como agente
  (misma sesión): idea → "reservar | ver fechas" → fecha nueva → Buscar → resumen; si el aéreo no es el propuesto
  o sigue siendo de contrato, "Edita" del transporte y elige por número de vuelo (si no, directo más barato, o
  más barato); verifica que no quede "Contract Transport" y que el precio esté dentro del ±8 % de la propuesta;
  (3) "Actualizar y guardar idea"; (4) HUB `switchPackageToSystem` (reimporta de TC, `is_cupo=false`, vínculos
  liberados, monitoreo). "Ensayar" (`mode=prepare`) hace 1 y 2, no guarda, y vuelve a dejar Desde/Hasta como
  estaban; si eso fallara, `node switch-date.js --tc-id=<id> --mode=restore --start=dd/mm/yyyy --end=dd/mm/yyyy`.
  Capturas en `/tmp/switch-date/<propuesta>/` del VPS.
- Primera corrida real (2026-09-11, SIV 52574571, cupo Arajet 17/01 agotado): 9 domingos sondeados; mejor 28/02
  con Arajet directo ida y vuelta, USD 1.731 pp según el cotizador y USD 1.874 en el resumen de TC (el cotizador
  arma la combinación más barata de hotel y tarifa; TC recotiza la idea guardada).

Regla del matcher (`src/lib/packages/flight-match.ts`): un transporte **sin proveedor** (`supplier_name` null) es
tarifa de sistema y no se vincula a ningún cupo, aunque sea el mismo vuelo en la misma fecha. Antes HUB vinculaba
esas tarifas al cupo agotado y el bot del CRM decía "agotado". Verificado el 2026-09-11 sobre los 99 paquetes
activos: se pierde un solo vínculo y era falso (Florianópolis con JetSMART de sistema); los 23 reales quedan.

## Producto: perfiles e ideas (Fase 3 del loop)

- `destination_profiles`: usos y costumbres por destino (régimen obligatorio, noches, categoría, temporada, ventana
  de compra, umbral directo/escala). Pantalla `/producto/perfiles` (alta, edición completa y borrado; el borrado
  falla con 409 si el perfil tiene ideas o una landing de vuelos baratos, y desvincula los paquetes que lo
  tenían asignado). `profile.audit` corre los lunes y asigna `destination_profile_code`, `family`, `is_cupo` y
  `profile_violations` a los paquetes activos.
- **`tc_destination_code` es obligatorio en la práctica**: sin él la idea se cotiza por nombre (homónimos: "San
  Andrés" puede caer en San Andrés Cholula, México) y el link "Abrir búsqueda en siviajo.com" sale sin destino, con
  lo que el buscador cae al home sin error. Los códigos de TC pueden llevar sufijo (`SAI-123` San Andrés, `MBJ-1`
  Montego Bay, `NRT-1` Tokio, `PAN-1` Ciudad de Panamá, `SJO-10` San José, `SVD-1` Salvador, `MV-3` Malé, `BAI`
  Bali, `OGI` Maragogi). Se resuelven con `POST /api/vuelos-baratos/resolve` (cotizador `/flights/resolve`, el
  mismo autocomplete de siviajo.com); el alta desde Tendencias lo hace sola y el editor de Perfiles tiene
  "Resolver en TC". Ojo con lo que devuelve TC para textos ambiguos: "Panamá" → Panama City Beach (Florida),
  "Tokyo" → Tokyo Disneyland, "Jamaica" → nodo país sin aeropuerto. El 2026-09-10 se completaron los 20 perfiles
  del seed que no tenían código.
- Ideas (`package_ideas`): `/producto/ideas`. `idea.probe` (lane `vuelos`, sólo si `VUELOS_URL` está configurada:
  matrix de vuelos-siviajo para el mes) → `idea.quote` (lane `cotizador`, ventana nocturna salvo manual): valida
  contra el perfil, cotiza con `POST /quote-multi` (fecha flexible por mes) y, si salió con escala y el destino tiene
  umbral, cotiza sólo directo en la misma fecha; la regla directo/escala decide. Máximo dos cotizaciones por idea.
  Cada llamada queda en `quote_runs`; las fechas alternativas en `flight_price_probes`. Cada idea tiene "Abrir
  búsqueda en siviajo.com" (`siviajoPackageSearchUrl` en `src/lib/packages/public-url.ts`, mismo formato de URL
  que usa el cotizador-bot) para corregir a mano lo que cotizó.
- Estados: draft → probing → quoting → priced | needs_review | failed → approved (siempre humano) → saved (hasta la
  Fase 6, a mano: "pegar ID") → verified → imported.
- Env: `COTIZADOR_URL` (127.0.0.1:8090), `COTIZADOR_API_KEY`, opcional `COTIZADOR_NACIONAL_URL` (8091) y
  `COTIZADOR_NACIONAL_API_KEY`; `VUELOS_URL` cuando vuelos-siviajo esté en el VPS.
- Depurar: `SELECT id, status, destination_name, month, quoted_price_pp, chosen_departure_date, error FROM package_ideas ORDER BY id DESC LIMIT 20;`

## vuelos.siviajo.com

Landing de "vuelos baratos" dentro de HUB (no es una app aparte). Barrido nocturno (`flights.sweep.plan`
a las 01:00 UTC vía `enqueue?schedule=hourly` → `flights.sweep`, lane `cotizador`, prioridad 4), kill
switch `automation.flights_sweep`, presupuesto `cotizador_probe` (2500/día). Dos horas antes corre el
estimador de Sabre (`flights.estimate.plan` a las 23:00 UTC → `flights.estimate`, lane `sabre`, uno por
vez, sin ventana horaria; son ~20 jobs a razón de uno por tick, ~40 min de tanda), que elige qué fechas confirma el barrido: kill switch `automation.sabre_calls`,
presupuesto `sabre` (1500 búsquedas/día). Env nuevas en `/opt/hub/.env.local`:
`NEXT_PUBLIC_VUELOS_BASE_URL`, `VUELOS_PUBLIC_HOST`, `SIVIAJO_BASE_URL`, `NEXT_PUBLIC_GTM_ID` y las cinco
del estimador — `SABRE_USERNAME`, `SABRE_PASSWORD`, `SABRE_PCC`, `SABRE_CLIENT_ID`, `SABRE_CLIENT_SECRET`
(opcionales `SABRE_DOMAIN` y `SABRE_SOAP_URL`); si falta alguna, los jobs del estimador terminan `skipped`
y el barrido sigue con fechas fijas. nginx de referencia: `ops/nginx/vuelos.siviajo.com.conf` (ya instalado en
`/etc/nginx/sites-enabled/`; falta certbot, requiere que el DNS del dominio apunte acá). Doc completa,
con el procedimiento de cutover del DNS: `docs/VUELOS-BARATOS.md`.

## Rotación de secretos

- `CRON_SECRET`: cambiarlo en `/opt/hub/.env.local` **y** en `/opt/hub-cron/.env.cron`, después `pm2 restart hub`.
- `HUB_API_KEY`: también la usa el bot del CRM (`/api/bot/packages`): coordinar con el equipo del CRM.
- Token de Meta, `SERPAPI_API_KEY`, credenciales del RDS del CRM y las `SABRE_*`: sólo en
  `/opt/hub/.env.local`.

- **Usuario de Travel Compositor y de siviajo.com: `HUBSIVIAJO` para todo** (decisión de Ezequiel, 2026-09-10).
  Lo usan HUB (`TC_USERNAME`/`TC_PASSWORD` en `/opt/hub/.env.local`), el cotizador emisivo (`/opt/cotizador-bot/.env`)
  y el bot de recotización (`/root/tc-requote-bot/.env`, también como `SIVIAJO_USERNAME` para el login web). Antes HUB y
  el cotizador usaban otro usuario; quedaron respaldos `.env*.bak-20260910-*` al lado de cada archivo. Después de tocar
  esos archivos: `pm2 restart hub --update-env` y `pm2 restart cotizador-bot --update-env`. Verificación rápida:
  `POST /authentication/authenticate` con `micrositeId: siviajo` tiene que devolver `token`. El login web de
  HUBSIVIAJO en siviajo.com pide verificación por email (código de 6 dígitos) desde el 2026-09 aunque la sesión
  venga del VPS; hasta que se desactive, el bot de recotización no entra aunque su log diga "Login successful"
  (sólo chequea que la URL no diga "login").

## Bases

- Supabase `phzqsjxouqttpcnqxxuq` (compartida con media-os). Migraciones en `supabase/migrations/`, se aplican
  con la Management API (`SUPABASE_ACCESS_TOKEN`) o desde el SQL editor. Todas las tablas nuevas llevan RLS.
- RDS del CRM: sólo lectura, usuario `hub`, credenciales en `~/.config/siviajo/crm-readonly.env` (local) y
  `CRM_PG_*` en `/opt/hub/.env.local` (VPS). Guía: `docs/CRM-DB-READONLY.md`.
