# vuelos.siviajo.com — landing de "vuelos baratos"

Réplica de TurismoCity corriendo sobre el motor de siviajo.com. Landing pública de "vuelos baratos a
&lt;destino&gt;" (grilla por mes, filtros de escalas/estadía, buscador) que vive **dentro de HUB**, no es
una app aparte. Fase 1 (commit `905fd17`) está en `main` y deployada en producción (`hub.siviajo.com`,
VPS `148.230.72.17`, PM2 `hub` :3001). El dominio público `vuelos.siviajo.com` **ya apunta acá**
(cutover hecho el 2026-09-10): ver [Cutover del DNS](#cutover-del-dns).

## Cómo funciona el dato

No hay scraping ni feed externo: un barrido nocturno sondea el propio cotizador emisivo (el mismo que
usa siviajo.com) con pares de fechas realistas y guarda cada observación en `flight_price_probes`
(`source = 'cotizador_probe'`, `route_id` apuntando a la ruta sondeada). Las páginas públicas sólo leen
agregados de esa tabla, nunca cotizan en vivo.

Desde el estimador (ver [Estimador Sabre](#estimador-sabre)) el barrido no elige las fechas a ciegas:
**Sabre elige, siviajo confirma**. Un par de horas antes, Sabre estima `scan_per_month` pares por mes y
el barrido gasta sus (menos) sondas en los más baratos de ésos. El precio que se publica sigue saliendo
**siempre** de una sonda real.

- **Ventana de vigencia**: una observación sirve para mostrar precio hasta 48 h después
  (`OBSERVATION_WINDOW_HOURS` en `src/lib/vuelos-baratos/config.ts`). Pasado ese tiempo, esa fecha
  desaparece de la grilla hasta la próxima sonda.
- **Precio**: por persona (`precio_pp`), la tarifa más baja **sin valija despachada** (equivalente a la
  tarifa "económica" del buscador de siviajo.com).
- **Anticipación mínima**: no se sondea nada con menos de 3 días de anticipación (`MIN_LEAD_DAYS`) — no
  tiene sentido como tarifa de landing.
- Cada fila también guarda escalas, duración, aerolínea, familia tarifaria y equipaje de la opción, para
  los filtros (`?stops=0`, `?stay=4-14`) y para el chip "Directo".

## Tablas

- **`flight_landing_destinations`**: destinos publicables en la landing, extensión 1:1 de
  `destination_profiles`. Cada fila tiene `slug` (URL pública), `tc_code` (código de **destino** de
  Travel Compositor — no el IATA del aeropuerto), `haul` (short/medium/long, define las estadías por
  defecto) y `active` (si aparece en la landing). Seed inicial: 11 destinos (MIA, MAD, RIO, FLO, PUJ,
  CUN, SCL, NYC, BCN, ROE, MCO); en producción hoy hay 5 activos: **MIA, MAD, RIO, PUJ, CUN**.
- **`flight_landing_routes`**: origen × destino, con la configuración del freno look-to-book —
  `stay_nights` (noches a sondear), `weekdays` (días ISO en los que se busca salida), `scan_per_month`
  (pares que estima Sabre por mes, default 8), `confirm_per_month` (de ésos, cuántos confirma el barrido,
  default 3), `probes_per_month` (el plan de respaldo cuando no hay estimaciones, default 8) y
  `months_ahead` (default 12). `active` decide si esa ruta entra al barrido de la noche. Hoy sólo las
  rutas BUE de los 5 destinos activos están `active = true`; el resto (incluidas las de
  Córdoba/Rosario/Mendoza) está creado pero apagado.
- **`flight_fare_estimates`**: una fila por ruta + par de fechas con lo que estimó Sabre (`price_pp`,
  `airline_code`, escalas y los ≤5 itinerarios en `itineraries`). Es un **upsert** por
  `(route_id, depart_date, return_date, source)`: la estimación de esta noche pisa la de anoche, no es
  una serie histórica. **Nunca se publica como precio confirmado.**
- **`gsc_page_stats` / `gsc_url_status` / `gsc_sitemap_status`**: la copia local de lo que responde
  Search Console — clics e impresiones por página y día (upsert por `site + date + page`), la última
  inspección de cada URL y el estado del sitemap. Ver [Search Console](#search-console).
- Migraciones: `supabase/migrations/20260921_vuelos_baratos.sql` (idempotente, ya aplicada en producción).
  También agrega a `flight_price_probes` las columnas `route_id`, `status`, `options`, `fare_family`,
  `checked_bag`, `carry_on`, `airline_code`, `stops_back`, `duration_back_minutes`, `adults`,
  `elapsed_ms`, `error`. Y `20260923_flight_estimates.sql` (también aplicada): `flight_fare_estimates`,
  `scan_per_month` / `confirm_per_month`, el flag `automation.sabre_calls` y el presupuesto `sabre`. Y
  `20260925_gsc_vuelos.sql`: las tres tablas `gsc_*` (el flag `automation.gsc_writes` y el presupuesto
  `gsc` ya venían del kernel).

## Jobs

| Job | Lane | Prioridad | Qué hace |
|---|---|---|---|
| `flights.estimate.plan` | `default` | — | 23:00 UTC. Cancela las estimaciones que quedaron en cola de noches anteriores y encola un `flights.estimate` por ruta activa × grupo de 3 meses. No llama a Sabre. |
| `flights.estimate` | `sabre` | 5 | Abre **una** sesión SOAP y pide un BFM por par de fechas (`scan_per_month` por mes); guarda las estimaciones (`runEstimate`). |
| `flights.sweep.plan` | `default` | — | 01:00 UTC. Arma la cola de la noche: cancela lo que quedó pendiente de noches anteriores (`cancelStaleFlightJobs`, esos precios ya no sirven) y encola un `flights.sweep` por cada ruta activa × mes, con las fechas que eligió Sabre. No sondea nada. |
| `flights.sweep` | `cotizador` | 3 (4 los primeros meses) | Sondea una tanda de pares de fechas de una ruta contra el bot y guarda las observaciones (`runSweep`). |
| `gsc.vuelos_sync` | `gsc` | — | Diario. Reenvía el sitemap a Search Console, trae clics/impresiones por página e inspecciona hasta 20 URLs (`runVuelosGscSync`). |

- `flights.sweep.plan` se dispara una vez por noche a las **01:00 UTC** (22:00 ART), desde
  `enqueue?schedule=hourly` (`SWEEP_ENQUEUE_HOUR_UTC` en `config.ts`) — el mismo cron horario que ya
  encola `insights.sync`, no hay un cron nuevo. Ver `src/app/api/cron/enqueue/route.ts`.
- `flights.sweep` corre en el lane `cotizador` (un worker, ventana 01:00–10:00 UTC), con **prioridad 3,
  +1 los primeros 4 meses** (`SWEEP_PRIORITY` en `config.ts`): incluso con el empujón queda en 4, así que
  **las ideas (5) ganan** — las cotizaciones reales de la Fase 3 se llevan la noche antes que el barrido
  de la landing.
- Cada `flights.sweep` hace hasta **10 sondas** (`MAX_PROBES_PER_JOB`): el tick del cron corta a los ~8
  minutos, así que una tanda más grande no llegaría a terminar.
- **Dedupe**: la clave de encolado combina ruta + mes + día, así un mismo disparo (o un reintento del
  cron) no duplica jobs de la misma noche.
- `gsc.vuelos_sync` se encola desde `enqueue?schedule=daily` (mismo cron que `health.check`), con dedupe
  por día. El lane `gsc` no tiene ventana horaria y va de a uno.
- Handlers: `src/lib/jobs/handlers/flights-sweep-plan.ts`, `flights-sweep.ts`, `flights-estimate-plan.ts`,
  `flights-estimate.ts` y `gsc-vuelos-sync.ts`. Lógica de fechas y tandas: `src/lib/vuelos-baratos/sweep.ts`
  y `estimate.ts`, y `src/lib/gsc/vuelos-sync.ts` para Search Console (puras, sin red ni DB, para poder
  testear con dobles — una búsqueda de Sabre se cobra y la cuota de Google es de 100 llamadas por día).

Depurar: `SELECT id, kind, status, attempts, last_error FROM hub_jobs WHERE kind LIKE 'flights.%' OR kind = 'gsc.vuelos_sync' ORDER BY id DESC LIMIT 30;`

## Kill switch y presupuesto

- `system_flags.automation.flights_sweep`: apagado ⇒ tanto `flights.sweep.plan` como `flights.sweep`
  terminan `skipped`, nunca `failed`. Se maneja desde `/automatizacion` (o `/producto/vuelos-baratos`).
- `flights.sweep` también respeta `automation.cotizador_calls` (el kill switch general del bot).
- Presupuesto `cotizador_probe` en `provider_budgets`: **2500 sondas/día**, 50.000/mes. Al agotarse, el job
  en curso corta y termina `skipped` con "presupuesto agotado (N/M pares sondeados)"; el resto queda para
  la noche siguiente (no se pierde, `flights.sweep.plan` lo vuelve a encolar).
- `system_flags.automation.sabre_calls`: kill switch del estimador. Apagado (o sin las `SABRE_*`), tanto
  `flights.estimate.plan` como `flights.estimate` terminan `skipped` y **el barrido sigue andando** con
  las fechas fijas de cada ruta.
- Presupuesto `sabre`: **1500 búsquedas/día**, 30.000/mes (una unidad = una transacción BFM). Al agotarse,
  el job corta y termina `skipped`; lo estimado hasta ahí queda guardado.
- `system_flags.automation.gsc_writes`: kill switch de Search Console. Apagado (o sin
  `GOOGLE_DRIVE_CREDENTIALS`), `gsc.vuelos_sync` termina `skipped` y la card del admin queda con los
  últimos datos guardados.
- Presupuesto `gsc`: **100 llamadas/día**, 2000/mes (una unidad = una llamada a la API, también si falla).
  Una corrida completa gasta ~23 (1 envío + 1 lectura del sitemap + 1 de métricas + 20 inspecciones).

## Bot: `POST /flights/probe`

El cliente HTTP vive en `src/lib/cotizador/client.ts` (`probeFlights`). Contra el cotizador emisivo
(`127.0.0.1:8090`, `X-API-Key`), **sin el límite de 3 llamadas/minuto** de `/quote-multi` (es un endpoint
aparte, pensado para volumen). Body: `origen`/`destino` como `Destination::<código TC>`, `fecha_ida`,
`fecha_vta`, `adultos`, `menores`, `top_n`, `only_direct`. El camino normal es **200 con `status`**
(`ok` | `sin_resultados` | `timeout` | `error_upstream`) y el job decide qué hacer; pero sí devuelve HTTP
de error cuando corresponde: **422** por códigos o fechas inválidas y **502** si el upstream falla.
`probeFlights` los mapea a `status: 'error'` con `httpStatus` y `retryable` — `false` para 422 y 401
(reintentar no los arregla), `true` para el resto. Timeout del lado de HUB: 60 s. Sonda real medida
BUE→MIA: ~15 s.

También expone `POST /flights/resolve` (`resolveDestination`) para traducir un texto libre ("Miami",
"FLN") al código de destino TC — sirve para dar de alta rutas nuevas sin adivinar códigos a mano.

## Estimador Sabre

**Qué hace**: cada noche a las **23:00 UTC** (20:00 ART), `flights.estimate.plan` encola un
`flights.estimate` por ruta activa × grupo de 3 meses. Cada job abre **una** sesión SOAP contra Sabre y
le pide un `BargainFinderMax` por par de fechas (`scan_per_month` pares por mes — no el mes entero—, con
las mismas estadías y días de salida que usa el barrido). Cada respuesta se guarda en
`flight_fare_estimates`.
A la **01:00 UTC**, `flights.sweep.plan` lee las estimaciones vigentes (`ESTIMATE_WINDOW_HOURS`, 30 h) y,
por ruta y mes, encola sondas para los **`confirm_per_month` pares más baratos** que estimó Sabre. El
`result` del plan dice cuántos meses salieron de estimaciones (`monthsFromEstimates`) y cuántos de fechas
fijas (`monthsFixed`), y cada job lleva `source: 'estimate' | 'fixed'` en el payload.

**Por qué así** (verificado en vivo contra el PCC propio, 2026-09-10 — ver el comentario de cabecera de
`src/lib/sabre/client.ts`):

- El **REST de Sabre está deshabilitado** para estas credenciales (403). Sólo SOAP contra
  `https://webservices.platform.sabre.com`.
- `BargainFinderMax_ADRQ` (fechas alternativas en una sola llamada) responde "No service / adapter": hay
  que pedir **par de fechas por par de fechas**, y por eso el estimador es secuencial y va en su propio
  lane (`sabre`, concurrencia 1, sin ventana horaria).
- Las sesiones son un recurso escaso (el PCC tiene cupo) y expiran a los 15 minutos: `createSabreShopper`
  abre una sola por job, la renueva sola y la cierra al terminar.
- **La tanda tarda**: el runner toma **un job por lane y por tick** (un minuto) y sostiene el lock del
  lane mientras corre, así que los jobs no se encavalgan: 5 rutas × 12 meses ÷ 3 meses por job = **20
  jobs ≈ 40 min**. Por eso el plan sale a las 23:00 y no a las 00:00: dos horas de margen antes del
  barrido. Si se suman rutas hay que rehacer esta cuenta (o los últimos meses caen a fechas fijas, que no
  rompe nada pero gasta más sondas). El lease del lane es de **20 min** (`leaseSeconds: 1200`): el
  heartbeat va por par, pero un BFM puede tardar hasta 60 s.
- BFM **no manda `ElapsedTime`**: `duration_out_minutes` / `duration_back_minutes` quedan en `null`. No se
  calculan por diferencia de horarios (son horas locales de husos distintos).

**Cupos por ruta**: `scan_per_month` (0–62, default 8) es cuántas fechas mira Sabre por mes — en 0 la ruta
no se estima y el barrido usa `probes_per_month`. `confirm_per_month` (1–31, default 3) es cuántas de ésas
se cotizan de verdad en siviajo.com. Si Sabre devolvió menos pares que el cupo, el barrido completa con
sus fechas fijas sin repetir combinaciones.

**Costos por ruta y noche**: `scan_per_month × meses` transacciones BFM en el PCC propio (`6U9L`) +
`confirm_per_month × meses` sondas del cotizador. Con las 5 rutas activas y los defaults (8 / 3, 12
meses): **≈ 480 BFM + 180 sondas por noche**, contra las 480 sondas de antes. Es un canje explícito:
**se publican 3 fechas por mes en vez de 8** (menos filas en la grilla) y a cambio el tráfico contra el
motor de reservas baja ~62 %, y las 3 que quedan son las más baratas del mes en vez de fechas fijas. Si
una ruta necesita la grilla llena, se sube `confirm_per_month` (o se le deja `scan_per_month` en 0 y
vuelve al barrido de siempre).

**Códigos**: Sabre trabaja con IATA, no con los códigos de destino de Travel Compositor. Los orígenes se
mapean en `ORIGINS` (`src/lib/vuelos-baratos/config.ts`): BUE→`BUE`, CRD→`COR`, RO6→`ROS`, MEZ→`MDZ`. El
destino sale de `iata_display ?? tc_code` (MIA, MAD, GIG, FLN, PUJ, CUN, SCL, JFK, BCN, FCO, MCO). Si
Sabre rechaza un código, no vuelve como "sin vuelos" sino como `error`: el job termina fallado en
`/automatizacion` (con `errors` en su `result`), queda un aviso por par en `/logs` y la ruta se queda con
la estimación vieja en `/producto/vuelos-baratos`. Se arregla cargando `iata_display` en el destino.

**Si Sabre falla, no pasa nada grave**: sin estimaciones vigentes (flag apagado, credenciales caídas,
presupuesto agotado, ruta con `scan_per_month = 0`) el barrido vuelve al plan fijo de siempre
(`probes_per_month` pares por mes). Los frenos del job:

- **Credenciales rechazadas** (el mensaje empieza con "Sabre no abrió la sesión"): corta en el primer par
  y no se reintenta. Ojo que un fault de la búsqueda puede decir "NOT AUTHORIZED TO USE THIS FARE" y eso
  **no** es el PCC: es esa tarifa, y la tanda sigue.
- **3 errores seguidos**: abandona la tanda (`MAX_CONSECUTIVE_ERRORS`). Es la ruta (un código que Sabre no
  acepta) o el host caído; seguir sería juntar el mismo error 20 veces gastando presupuesto. El job pide
  reintento sólo si el último error era reintentable (host caído sí, código inválido no). Un error suelto
  entre búsquedas buenas no corta nada: la racha se reinicia con cada `ok` o `empty`.
- **Presupuesto agotado**: termina `skipped` con lo estimado hasta ahí ya guardado.

**En la landing**: un mes sin sonda vigente pero con estimación muestra `≈ US$ X` en gris, con el título
"Estimado con Sabre, se confirma en siviajo.com". El H1, la tabla de fechas y el JSON-LD usan **sólo**
precios confirmados.

Depurar: `SELECT route_id, depart_date, return_date, price_pp, airline_code, observed_at FROM flight_fare_estimates ORDER BY observed_at DESC LIMIT 20;`

## Deep link a siviajo.com

El botón "Seleccionar" arma una URL de búsqueda directa contra el motor
(`src/lib/vuelos-baratos/deep-link.ts`, `buildSiviajoFlightUrl`). Formato exacto (template literal a
propósito: `URLSearchParams` escaparía `Destination::` y las fechas, rompiendo la búsqueda):

```
https://www.siviajo.com/home?latestSearch=true&tripType=ONLY_FLIGHT&directSubmit=true
  &departureDate=05/01/2026&arrivalDate=19/01/2026
  &distribution=1~~0
  &departure=Destination::BUE&destination=Destination::MIA
  &roundTripFlight=true
```

Fechas en `DD/MM/YYYY` (no ISO). `distribution` es `adultos~~menores` (`1~~0~~edades` si hay menores).
Siempre lleva UTM (`withUtm`): `utm_source=vuelos`, `utm_medium`, `utm_campaign`.

## Variables de entorno

| Variable | Dónde | Valor en producción |
|---|---|---|
| `NEXT_PUBLIC_VUELOS_BASE_URL` | `/opt/hub/.env.local` | `https://vuelos.siviajo.com` (canonicals, sitemap, JSON-LD de la landing) |
| `VUELOS_PUBLIC_HOST` | `/opt/hub/.env.local` | `vuelos.siviajo.com` (ver middleware abajo) |
| `SIVIAJO_BASE_URL` | `/opt/hub/.env.local` | `https://www.siviajo.com` (base del deep link; **no** lleva prefijo `NEXT_PUBLIC_`: el buscador la recibe como prop de server component, así un override del `.env` no se ignora en el cliente) |
| `NEXT_PUBLIC_GTM_ID` | `/opt/hub/.env.local` | GTM de la landing (tracking de clicks/conversión) |
| `COTIZADOR_URL` / `COTIZADOR_API_KEY` | `/opt/hub/.env.local` | Ya existían (Fase 3); las reusa `probeFlights` |
| `SABRE_USERNAME`, `SABRE_PASSWORD`, `SABRE_PCC`, `SABRE_CLIENT_ID`, `SABRE_CLIENT_SECRET` | `/opt/hub/.env.local` | Credenciales del estimador (obligatorias las cinco: sin alguna, `isSabreConfigured()` es `false` y los jobs terminan `skipped`) |
| `SABRE_DOMAIN` / `SABRE_SOAP_URL` | `/opt/hub/.env.local` | Opcionales: `DEFAULT` y `https://webservices.platform.sabre.com` |
| `GSC_SITE_URL` | `/opt/hub/.env.local` | Opcional: propiedad de Search Console, default `sc-domain:siviajo.com` (la SA de `GOOGLE_DRIVE_CREDENTIALS` ya tiene permiso) |

Las tres primeras ya están agregadas en `/opt/hub/.env.local` del VPS de HUB.

**Middleware** (`src/lib/supabase/middleware.ts`): cuando el `Host` del pedido coincide con
`VUELOS_PUBLIC_HOST`, la raíz (`/`) se reescribe a `/vuelos-baratos` y cualquier otra ruta redirige ahí
— así el dashboard no queda expuesto en un dominio sin login. `/vuelos-baratos`, `/robots.txt`,
`/sitemap.xml` y `GET /api/vuelos-baratos/cities` se sirven sin pasar por Supabase (sin sesión que
refrescar; el autocomplete del buscador pega una consulta por tecla).

## Activar un destino o ruta

Desde `/producto/vuelos-baratos` (sección `producto`: admin, marketing y producto):

1. **Publicar destino**: toggle "activo" en `flight_landing_destinations`. Antes de publicar, "verificar
   código TC" confirma que el `tc_code` resuelve contra el cotizador (evita publicar un destino con
   código roto).
2. **Activar ruta**: toggle con confirmación (activa el barrido nocturno para esa ruta desde la próxima
   noche) — pide confirmar porque suma sondas al presupuesto diario.
3. **Sabre/mes** y **Confirmar/mes**: editables por ruta (`scan_per_month`, `confirm_per_month`) — cuántas
   fechas mira el estimador y cuántas se confirman de verdad. **Sondas/mes** (`probes_per_month`) es el
   plan de respaldo para cuando no hay estimaciones. Los tres son el dial fino del freno look-to-book.
4. **"Estimar ahora"**: encola un `flights.estimate` manual de 2 meses (el lane `sabre` no tiene ventana
   horaria, así que corre en el próximo tick). Cada par es una búsqueda que se cobra: por eso son 2 meses
   y no los 12 de la ruta. Comparte la clave de dedupe con el plan nocturno (ruta + meses + día), así que
   después de las 23:00 UTC devuelve los jobs de esa noche en vez de duplicar búsquedas.
5. **"Barrer ahora"**: encola un `flights.sweep` manual (prioridad de UI, no espera a la ventana nocturna)
   para probar una ruta recién activada sin esperar 24 h. Comparte la clave de dedupe con el plan
   nocturno (ruta + mes + día), así que **después de las 01:00 UTC dedupea contra los jobs de esa noche**:
   devuelve los que ya estaban encolados (`deduped: true`) en vez de duplicar sondas — la ventana no se
   saltea, esos jobs ya van a correr igual.
6. **Alta, edición y borrado** (2026-09-10): "Nuevo destino" elige un perfil de `destination_profiles` que
   todavía no tiene landing (la landing es una extensión 1:1 del perfil) y precarga slug, código TC, IATA y
   distancia; nace sin publicar y con la ruta BUE apagada. "Editar" cambia todo lo demás (slug = URL pública,
   SEO, portada, FAQ, orden). "Nueva ruta" / "Editar" en cada ruta: origen (código de ciudad de TC), estadías,
   días de salida, sondas/mes, **Sabre/mes**, **Confirmar/mes** y meses; una ruta nueva que no los declare
   toma los defaults de la tabla (8 y 3). "Borrar" pide confirmación: borrar un destino se lleva sus rutas
   (cascade), las sondas ya guardadas quedan con `route_id` en null y el perfil de Producto no se toca.
   API: `GET/POST /api/vuelos-baratos/destinations`, `PATCH/DELETE .../destinations/[code]`,
   `GET/POST /api/vuelos-baratos/routes`, `PATCH/DELETE .../routes/[id]`. Cada cambio invalida el memo
   público y queda en `system_logs` (`vuelos_baratos.*`).

## Cómo escalar con cuidado

El barrido nocturno es tráfico real contra el motor de reservas: hay que cuidar el ratio
look-to-book (sondas vs. reservas de verdad) para no verse como abuso. Con el estimador, el alcance es
**5 rutas × 12 meses × 3 confirmaciones ≈ 180 sondas/noche** (más 480 búsquedas BFM, que no tocan
siviajo.com). La escala plena planificada es de **~2.000 sondas/noche**. Para llegar ahí: activar rutas de
a poco (no todas de una), mirar `cotizador_probe` y `sabre` en `provider_budgets` y `external_calls` (tasa
de error/timeout) antes de sumar la próxima, y preferir subir `scan_per_month` (que sale barato) antes que
`confirm_per_month` de rutas que ya andan bien.

## Search Console

La landing se mide sola contra Google: el job diario `gsc.vuelos_sync` habla con la API de Search Console
y guarda las respuestas en `gsc_page_stats`, `gsc_url_status` y `gsc_sitemap_status`
(`supabase/migrations/20260925_gsc_vuelos.sql`).

- **Propiedad**: `sc-domain:siviajo.com`, propiedad de **dominio** — cubre `www.siviajo.com` y
  `vuelos.siviajo.com` con la misma verificación (por eso la landing no necesita verificarse aparte).
  Se puede cambiar con `GSC_SITE_URL`.
- **Credenciales**: la MISMA service account que Drive (`GOOGLE_DRIVE_CREDENTIALS`,
  `hub-siviajo@hub-siviajo.iam.gserviceaccount.com`), que tiene permiso `siteFullUser` sobre la propiedad,
  pero **sin `subject`**: la delegación a `emayoni@` no está habilitada para el scope `webmasters`
  (impersonar da `unauthorized_client`). Cliente: `src/lib/gsc/client.ts`.
- **Qué hace el job**, en este orden (`src/lib/gsc/vuelos-sync.ts`):
  1. **Sitemap**: reenvía `https://vuelos.siviajo.com/sitemap.xml` (el envío es idempotente: Google lo
     vuelve a encolar) y guarda cómo lo ve (`sitemaps.get`).
  2. **Rendimiento**: `searchanalytics.query` con dimensiones `date` + `page` y filtro
     `page contains <base pública>`. La primera corrida trae 28 días; después, los últimos 4. Siempre
     termina **2 días antes de hoy**: Search Console publica con ese retraso y pedir hasta ayer trae filas
     que después habría que pisar.
  3. **Indexación**: `urlInspection.index.inspect` de hasta **20 URLs** por corrida (la landing primero y
     después los destinos activos).
- **Cómo leer la card** (`/producto/vuelos-baratos`): clics, impresiones, CTR y posición media de los
  últimos 28 días — el CTR es clics/impresiones del total y la posición va **ponderada por impresiones**,
  como la calcula Google, no como promedio de días. Abajo, el estado del sitemap ("enviado {fecha} ·
  pendiente/procesado · N/M URLs indexadas") y la tabla por URL con el veredicto (`Indexada`,
  `Sin indexar`, `Excluida`), el último rastreo y el tráfico de cada página. El botón **"Sincronizar
  Search Console"** encola el mismo job a mano (`POST /api/vuelos-baratos/gsc-sync`, dedupe por día).
- **Cuota**: 100 llamadas/día (presupuesto `gsc`). Una corrida gasta ~23, así que entran la del cron y
  varias manuales. Si se agota a mitad de camino, el job termina `skipped` y sigue mañana.
- **Paciencia**: un dominio nuevo tarda **días o semanas** en indexarse. Al principio la inspección
  devuelve "Google no reconoce esta URL" (`NEUTRAL`) para todo y eso **no es un error**. Lo que acelera
  el proceso es que le lleguen **enlaces desde `siviajo.com` y desde el blog** (un sitemap enviado sólo
  le dice a Google que las URLs existen; los enlaces le dicen que valen la pena).

## Cutover del DNS

**Hecho el 2026-09-10.** `vuelos.siviajo.com` apunta a `148.230.72.17` (VPS de HUB), con nginx
(`ops/nginx/vuelos.siviajo.com.conf`, proxy a :3001 pasando el `Host`) y certificado de Let's Encrypt
emitido ese mismo día. La app interna `vuelos-siviajo` quedó en `agentes.siviajo.com`
(`181.215.135.113`, Docker, repo aparte).

Lo que queda por hacer del lado de HUB: apuntar `VUELOS_URL` en `/opt/hub/.env.local` a
`https://agentes.siviajo.com` y `pm2 restart hub`. **Hoy `VUELOS_URL` no está definida** y por eso
`idea.probe` de la Fase 3 termina `skipped` (no hay VPS de vuelos internos que sondear); el barrido de la
landing no la usa.

Verificar: `curl -I https://vuelos.siviajo.com/vuelos-baratos` (200, certificado válido) y correr el
smoke (abajo).

## Smoke

`cotizador-bot/scripts/smoke_vuelos_baratos.py` (rama `feat/smoke-vuelos-baratos` del bot). Playwright
headless contra la landing pública: carga `/vuelos-baratos`, entra a un destino, prueba los filtros
`?stops=0&stay=4-14`, sigue el link "Seleccionar" hasta `onlyTransportAvail.xhtml` en siviajo.com y
compara el precio mostrado vs. el precio en vivo, y chequea `robots.txt`/`sitemap.xml`.

```
BASE=https://vuelos.siviajo.com .venv/bin/python scripts/smoke_vuelos_baratos.py
```

Sin `BASE`, apunta a `http://localhost:3001` (para probar contra HUB directo, antes del cutover).

## Pendiente

- **Calibrar el estimador**: falta medir cuánto se parece la estimación de Sabre al precio que después
  confirma siviajo.com (el error relativo por ruta) para saber si conviene subir `scan_per_month` o bajar
  `confirm_per_month`. Los datos ya están: `flight_fare_estimates` y `flight_price_probes` comparten
  `route_id` + par de fechas.
- **Observaciones de calidad de dato**: hoy sólo hay sondas del cotizador. Falta cruzar con clicks reales
  de la landing (qué precio vio el usuario que después reservó) y con el CRM (conversión real por
  destino/ruta) para saber si el precio mostrado predice bien lo que después se cotiza.
- Verificado en producción: job manual `flights.sweep` #45 → 3 sondas OK (US$ 721 / 814 / 908).
