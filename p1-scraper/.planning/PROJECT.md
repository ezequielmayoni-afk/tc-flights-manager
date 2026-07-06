# P1 Travel F1 Scraper

## What This Is

Microservicio TypeScript independiente (carpeta `hub/p1-scraper/`) que scrapea las entradas de **Fórmula 1** publicadas por P1 Travel (`p1travel.com`), persiste todo en Supabase 1×/día (los precios son dinámicos), y carga los productos a TravelCompositor (TC) como **tickets contratados** para revenderlos en la web de SiViajo.

## Core Value

**Que cada Gran Premio de F1 de P1 Travel, con todos sus sectores/tribunas (nombre, descripción, imagen del sector, precio actualizado), quede disponible en la BD de SiViajo y se pueda cargar a TravelCompositor para reventa.**

## Context

- SiViajo ya opera sobre `hub` (Next.js + Supabase + TravelCompositor). Este scraper es un componente aparte, deployado al VPS (148.230.72.17) con PM2 + cron, patrón `cotizador-bot`/`SEO_HOTEL`.
- Precios **dinámicos** → corrida diaria + histórico de precios.
- Credenciales heredadas de `hub/.env.local` (Supabase service role, TC: `TC_USERNAME=HUBSIVIAJO`, `TC_MICROSITE_ID=siviajo`, `TC_SUPPLIER_ID=18259`).

## Reverse-engineering (verificado en vivo)

P1Travel corre Next.js, pero el checkout expone una **API REST JSON** (`_TWBP/api/v2`) — **no se necesita browser en producción**. Tres fuentes:

1. **Listado** `https://www.p1travel.com/es/events/motorsports?page=N` → JSON-LD `CollectionPage` en HTML crudo: eventos (`name`, `url` detalle, fechas, location, precio "desde"). Filtrar F1 por path `/motorsports/formula-1/`. Dedupe por URL; parar cuando 2 páginas consecutivas no aportan URLs nuevas.
2. **Detalle (HTML crudo)** → extraer `EVENT_UUID` del link "Reservar ahora" (`checkout.p1travel.com/es/{EVENT_UUID}/ticket?category_id={CAT}`) y categorías del `dataLayer`.
3. **API checkout (fuente principal)**: `GET checkout.p1travel.com/_TWBP/api/v2/events/{EVENT_UUID}?include=organizer,base_package_ticket_options,content,venue,series&base_ticket_cat_id={CAT}&locale=es` → evento (`name`, `date_time`, `date_time_end`, `status`, `venue` geo/ciudad/país/timezone, `content.main_image`), precios (`base_package.prices_pp` = `{TICKET_ONLY, TICKET_HOTEL}` + `prices_compare`), `tickets[]` (cada sector: `name`, `description` completa, `seatplan_image`, `category_id`, `supplement_pp`), `category_properties` (features). Precio ticket = `TICKET_ONLY` + `supplement_pp`. Bonus: `/events/{UUID}/accommodations`.

TC **sí** crea productos contratados (`createTransport`/`syncTransport`/`createModality` en `src/lib/travelcompositor/client.ts`); el "contract ticket" es el producto Ticket de TC con endpoint análogo (a confirmar con `probe.ts`).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Scrapear el listado de F1 de p1travel.com paginando hasta el final (dedupe, stop-on-no-new)
- [ ] Resolver el EVENT_UUID de cada evento desde la página de detalle
- [ ] Traer de la API `_TWBP/api/v2` el evento completo: metadata, venue, precios, todos los sectores
- [ ] Capturar por cada sector: nombre, descripción completa, imagen del sector, precio (base+supplement), features
- [ ] Persistir en Supabase de forma idempotente (eventos por UUID, tickets por evento+categoría)
- [ ] Guardar snapshot diario de precios (histórico, precios dinámicos)
- [ ] Descargar imágenes (main_image + seatplan) a Supabase Storage
- [ ] Correr automáticamente 1×/día (cron + PM2 en VPS)
- [ ] Deploy reproducible al VPS (deploy.sh)
- [ ] Push de eventos+sectores desde la BD a TravelCompositor como ticket-contracts

### Out of Scope

- Otros deportes (fútbol, tenis, conciertos, MotoGP) — v1 es solo F1
- Browser automation en producción — la API REST hace innecesario Playwright
- Hoteles/accommodations — disponibles en la API pero fuera del MVP
- Checkout/compra real en p1travel — solo lectura de catálogo

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| API REST `_TWBP/api/v2` en vez de scrapear DOM | Devuelve JSON completo y estable (descripción, imágenes, precios, features); sin browser | — Pending |
| Carga a TC vía ticket-contract, siempre bajando a BD primero | TC no crea ideas/paquetes por API, pero sí productos contratados (patrón transport ya existe) | — Pending |
| Carpeta independiente TS + PM2 + cron en VPS | Consistente con cotizador-bot/SEO_HOTEL; aislado de hub | — Pending |
| Solo F1 en v1 | Acotar alcance; el mismo parser escala a otras categorías después | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-09 after initialization*
