# vuelos.siviajo.com — landing de "vuelos baratos"

Réplica de TurismoCity corriendo sobre el motor de siviajo.com. Landing pública de "vuelos baratos a
&lt;destino&gt;" (grilla por mes, filtros de escalas/estadía, buscador) que vive **dentro de HUB**, no es
una app aparte. Fase 1 (commit `905fd17`) está en `main` y deployada en producción (`hub.siviajo.com`,
VPS `148.230.72.17`, PM2 `hub` :3001). El dominio público `vuelos.siviajo.com` todavía no apunta acá:
ver [Cutover del DNS](#cutover-del-dns).

## Cómo funciona el dato

No hay scraping ni feed externo: un barrido nocturno sondea el propio cotizador emisivo (el mismo que
usa siviajo.com) con pares de fechas realistas y guarda cada observación en `flight_price_probes`
(`source = 'cotizador_probe'`, `route_id` apuntando a la ruta sondeada). Las páginas públicas sólo leen
agregados de esa tabla, nunca cotizan en vivo.

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
  `stay_nights` (noches a sondear), `weekdays` (días ISO en los que se busca salida), `probes_per_month`
  (cuántos pares de fechas por mes, default 8) y `months_ahead` (default 12). `active` decide si esa ruta
  entra al barrido de la noche. Hoy sólo las rutas BUE de los 5 destinos activos están `active = true`;
  el resto (incluidas las de Córdoba/Rosario/Mendoza) está creado pero apagado.
- Migración: `supabase/migrations/20260921_vuelos_baratos.sql` (idempotente, ya aplicada en producción).
  También agrega a `flight_price_probes` las columnas `route_id`, `status`, `options`, `fare_family`,
  `checked_bag`, `carry_on`, `airline_code`, `stops_back`, `duration_back_minutes`, `adults`,
  `elapsed_ms`, `error`.

## Jobs

| Job | Lane | Prioridad | Qué hace |
|---|---|---|---|
| `flights.sweep.plan` | `default` | — | Arma la cola de la noche: cancela lo que quedó pendiente de noches anteriores (`cancelStaleSweepJobs`, esos precios ya no sirven) y encola un `flights.sweep` por cada ruta activa × mes. No sondea nada. |
| `flights.sweep` | `cotizador` | 3 (4 los primeros meses) | Sondea una tanda de pares de fechas de una ruta contra el bot y guarda las observaciones (`runSweep`). |

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
- Handlers: `src/lib/jobs/handlers/flights-sweep-plan.ts` y `flights-sweep.ts`. Lógica de fechas y
  tandas: `src/lib/vuelos-baratos/sweep.ts` (pura, sin red ni DB, para poder testear con dobles).

Depurar: `SELECT id, kind, status, attempts, last_error FROM hub_jobs WHERE kind LIKE 'flights.%' ORDER BY id DESC LIMIT 30;`

## Kill switch y presupuesto

- `system_flags.automation.flights_sweep`: apagado ⇒ tanto `flights.sweep.plan` como `flights.sweep`
  terminan `skipped`, nunca `failed`. Se maneja desde `/automatizacion` (o `/producto/vuelos-baratos`).
- `flights.sweep` también respeta `automation.cotizador_calls` (el kill switch general del bot).
- Presupuesto `cotizador_probe` en `provider_budgets`: **2500 sondas/día**, 50.000/mes. Al agotarse, el job
  en curso corta y termina `skipped` con "presupuesto agotado (N/M pares sondeados)"; el resto queda para
  la noche siguiente (no se pierde, `flights.sweep.plan` lo vuelve a encolar).

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
3. **Sondas/mes**: editable por ruta (`probes_per_month`), es el dial fino del freno look-to-book.
4. **"Barrer ahora"**: encola un `flights.sweep` manual (prioridad de UI, no espera a la ventana nocturna)
   para probar una ruta recién activada sin esperar 24 h. Comparte la clave de dedupe con el plan
   nocturno (ruta + mes + día), así que **después de las 01:00 UTC dedupea contra los jobs de esa noche**:
   devuelve los que ya estaban encolados (`deduped: true`) en vez de duplicar sondas — la ventana no se
   saltea, esos jobs ya van a correr igual.
5. **Alta, edición y borrado** (2026-09-10): "Nuevo destino" elige un perfil de `destination_profiles` que
   todavía no tiene landing (la landing es una extensión 1:1 del perfil) y precarga slug, código TC, IATA y
   distancia; nace sin publicar y con la ruta BUE apagada. "Editar" cambia todo lo demás (slug = URL pública,
   SEO, portada, FAQ, orden). "Nueva ruta" / "Editar" en cada ruta: origen (código de ciudad de TC), estadías,
   días de salida, sondas/mes, meses. "Borrar" pide confirmación: borrar un destino se lleva sus rutas
   (cascade), las sondas ya guardadas quedan con `route_id` en null y el perfil de Producto no se toca.
   API: `GET/POST /api/vuelos-baratos/destinations`, `PATCH/DELETE .../destinations/[code]`,
   `GET/POST /api/vuelos-baratos/routes`, `PATCH/DELETE .../routes/[id]`. Cada cambio invalida el memo
   público y queda en `system_logs` (`vuelos_baratos.*`).

## Cómo escalar con cuidado

El barrido nocturno es tráfico real contra el motor de reservas: hay que cuidar el ratio
look-to-book (sondas vs. reservas de verdad) para no verse como abuso. Alcance actual: **5 rutas × 12
meses × 8 sondas/mes ≈ 480 sondas/noche** (~1,5 h de las 9 h de ventana del lane `cotizador`). La escala
plena planificada es de **~2.000 sondas/noche**. Para llegar ahí: activar rutas de a poco (no todas de
una), mirar `cotizador_probe` en `provider_budgets` y `external_calls` (tasa de error/timeout) antes de
sumar la próxima, y preferir subir `probes_per_month` de rutas que ya andan bien antes que activar rutas
nuevas.

## Cutover del DNS

`vuelos.siviajo.com` hoy apunta a un VPS **distinto** (`181.215.135.113`, Docker), donde corre la app
interna `vuelos-siviajo` — sin acceso SSH desde este repo. El cutover es manual, lo hace Ezequiel:

1. Crear `agentes.siviajo.com` → `181.215.135.113` y mover ahí la app interna: nginx + certbot +
   `ALLOWED_ORIGINS`/`NEXT_PUBLIC_API_URL` en su propio repo (fuera de HUB).
2. Actualizar `VUELOS_URL` en `/opt/hub/.env.local` (VPS de HUB) al host nuevo (`agentes.siviajo.com`) y
   `pm2 restart hub`. **Hoy `VUELOS_URL` no está definida** — mientras tanto, `idea.probe` de la Fase 3
   queda `skipped` (no hay VPS de vuelos internos que sondear). Si no se hace este paso después de mover
   la app, sigue omitido indefinidamente.
3. nginx + certbot en `148.230.72.17` (VPS de HUB) con `ops/nginx/vuelos.siviajo.com.conf` — **ya
   instalado y recargado** (`/etc/nginx/sites-enabled/vuelos.siviajo.com`, HTTP, proxy a :3001, pasa
   `Host`). Falta correr `certbot --nginx -d vuelos.siviajo.com` (pide que el DNS ya apunte acá).
4. Cambiar el A record de `vuelos.siviajo.com` → `148.230.72.17`.
5. Verificar: `curl -I https://vuelos.siviajo.com/vuelos-baratos` (200, certificado válido) y correr el
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

- **Spike Sabre** como estimador de precio (sin pasar por el cotizador): faltan las credenciales
  `SABRE_*`, que viven en `/opt/vuelos/backend/.env` del VPS de vuelos (`181.215.135.113`), no en el de
  HUB. Serviría sólo para **ida** (Sabre no da paquetes ida/vuelta con la misma facilidad).
- **Observaciones de calidad de dato**: hoy sólo hay sondas del cotizador. Falta cruzar con clicks reales
  de la landing (qué precio vio el usuario que después reservó) y con el CRM (conversión real por
  destino/ruta) para saber si el precio mostrado predice bien lo que después se cotiza.
- Verificado en producción: job manual `flights.sweep` #45 → 3 sondas OK (US$ 721 / 814 / 908).
