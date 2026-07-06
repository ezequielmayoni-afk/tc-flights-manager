# Requirements — P1 Travel F1 Scraper (v1)

## v1 Requirements

### Scraping (SCRAPE)
- [ ] **SCRAPE-01**: Paginar `p1travel.com/es/events/motorsports` y extraer eventos de F1 desde el JSON-LD, dedupe por URL, parando cuando 2 páginas consecutivas no aportan URLs nuevas
- [ ] **SCRAPE-02**: Filtrar solo eventos de F1 (path `/motorsports/formula-1/`)
- [ ] **SCRAPE-03**: Resolver el `EVENT_UUID` de cada evento desde el HTML de la página de detalle (link checkout + dataLayer)
- [ ] **SCRAPE-04**: Consumir la API `_TWBP/api/v2/events/{UUID}` y obtener evento completo + venue + precios + sectores
- [ ] **SCRAPE-05**: Por cada sector capturar nombre, descripción completa, imagen del sector (`seatplan_image`), precio (`TICKET_ONLY` + `supplement_pp`), features y `category_id`
- [ ] **SCRAPE-06**: Tolerar cambios de schema/campos faltantes sin romper la corrida completa (loguear y continuar)

### Persistencia (DATA)
- [ ] **DATA-01**: Crear tablas `p1_events`, `p1_tickets`, `p1_price_history` en Supabase (migración)
- [ ] **DATA-02**: Upsert idempotente de eventos (por `event_uuid`) y tickets (por `event_id`+`category_id`)
- [ ] **DATA-03**: Guardar snapshot diario de precio por ticket en `p1_price_history`
- [ ] **DATA-04**: Marcar como no disponibles (sin borrar) los tickets ausentes en la última corrida

### Imágenes (IMG)
- [ ] **IMG-01**: Descargar `main_image` del evento y `seatplan_image` de cada sector a Supabase Storage (bucket `p1-images`)
- [ ] **IMG-02**: Guardar tanto la URL original como el storage path en la BD

### Scheduling / Deploy (OPS)
- [ ] **OPS-01**: Ejecutar el scraper automáticamente 1×/día (node-cron en proceso PM2)
- [ ] **OPS-02**: Deploy reproducible al VPS (148.230.72.17) vía `deploy.sh` (rsync + npm ci + PM2)
- [ ] **OPS-03**: Modo `:dry` que imprime resultados sin escribir en BD

### TravelCompositor (TC)
- [ ] **TC-01**: Confirmar el endpoint de creación de tickets de TC (`probe.ts`) con las credenciales del microsite
- [ ] **TC-02**: Mapear evento+sectores de la BD → producto Ticket de TC (precio, descripción, imagen, fechas)
- [ ] **TC-03**: Push a TC leyendo solo de la BD, con modo `:dry` que imprime el payload sin pushear

## v2 Requirements (deferred)
- Otras categorías (MotoGP, fútbol, tenis, conciertos)
- Accommodations/hoteles de la API de p1
- Panel en hub para revisar/seleccionar qué eventos pushear a TC

## Out of Scope
- Browser automation en producción — la API REST lo hace innecesario
- Compra/checkout real en p1travel — solo lectura de catálogo

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCRAPE-01 | Phase 1 | Pending |
| SCRAPE-02 | Phase 1 | Pending |
| SCRAPE-03 | Phase 1 | Pending |
| SCRAPE-04 | Phase 1 | Pending |
| SCRAPE-05 | Phase 1 | Pending |
| SCRAPE-06 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| OPS-03 | Phase 1 | Pending |
| IMG-01 | Phase 2 | Pending |
| IMG-02 | Phase 2 | Pending |
| OPS-01 | Phase 2 | Pending |
| OPS-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| TC-01 | Phase 3 | Pending |
| TC-02 | Phase 3 | Pending |
| TC-03 | Phase 3 | Pending |
