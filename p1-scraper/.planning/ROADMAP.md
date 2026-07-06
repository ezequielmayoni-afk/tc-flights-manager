# Roadmap: P1 Travel F1 Scraper

## Overview

A standalone TypeScript microservice scrapes all Formula 1 events from p1travel.com via its REST API (`_TWBP/api/v2`), persists every event/sector/price/image into Supabase, runs daily on a VPS to track dynamic prices, and pushes the catalog into TravelCompositor as ticket-contracts for resale on SiViajo. The journey: first prove the data pipeline end-to-end (scrape → normalize → persist), then make it autonomous (images + cron + deploy), then wire it into TravelCompositor.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Scraper API + Persistencia (MVP)** - Scrape all F1 events through the checkout API and persist events, sectors, prices to Supabase
- [ ] **Phase 2: Imágenes + Scheduling + Deploy** - Download images to Storage, run daily via cron/PM2 on the VPS, capture price snapshots
- [ ] **Phase 3: Push a TravelCompositor** - Confirm the TC ticket endpoint and push events+sectors from the DB as ticket-contracts

## Phase Details

### Phase 1: Scraper API + Persistencia (MVP)
**Goal**: All F1 Grand Prix events from p1travel.com — with every sector, full description, price and image URL — land in Supabase tables, idempotently, with a dry mode that writes nothing.
**Depends on**: Nothing (first phase)
**Requirements**: SCRAPE-01, SCRAPE-02, SCRAPE-03, SCRAPE-04, SCRAPE-05, SCRAPE-06, DATA-01, DATA-02, DATA-04, OPS-03
**Success Criteria** (what must be TRUE):
  1. `npm run scrape:dry` lists all discovered F1 events with sectors, prices and image URLs and writes nothing to the DB.
  2. After `npm run scrape`, `p1_events` and `p1_tickets` are populated; Bélgica shows 14 tickets with prices in the 225–875 EUR range, non-empty `description` and a present `seatplan_image_url`.
  3. Re-running `npm run scrape` is idempotent (no duplicate rows) — events keyed by `event_uuid`, tickets by (`event_id`,`category_id`).
  4. Tickets absent in the latest run are flagged `availability='unavailable'` (never deleted), and a missing/changed API field logs a warning without aborting the run.
**Plans**: 5 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold ESM/tsx project shell + config.ts + supabase.ts
- [ ] 01-02-PLAN.md — Supabase migration: p1_events, p1_tickets, p1_price_history
- [ ] 01-03-PLAN.md — Read pipeline: jsonld, listing (F1 dedupe/stop), resolveUuid, api v2 client
- [ ] 01-04-PLAN.md — normalize (price math + tolerance) + persist (idempotent upsert + availability sweep)
- [ ] 01-05-PLAN.md — run-scrape.ts entrypoint orchestrating the pipeline + --dry mode

### Phase 2: Imágenes + Scheduling + Deploy
**Goal**: The scraper runs autonomously once per day on the VPS, mirrors every event/sector image into Supabase Storage, and records a daily price snapshot per ticket.
**Depends on**: Phase 1
**Requirements**: IMG-01, IMG-02, OPS-01, OPS-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. `npm run images` downloads `main_image` + each `seatplan_image` into the `p1-images` Storage bucket and populates the `*_storage_path` columns alongside the original URLs.
  2. After `./deploy.sh`, the service is running on the VPS under PM2 and `pm2 logs p1-scraper` shows the scheduled run executing.
  3. The cron job runs once per day and a forced run produces fresh rows — including a new row per ticket in `p1_price_history`.
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Mirror event/seatplan images to Supabase Storage (p1-images) + wire into pipeline + confirm DATA-03 price snapshot
- [ ] 02-02-PLAN.md — node-cron daily scheduler + PM2 ecosystem.config.js + deploy.sh to VPS (deploy checkpoint)

### Phase 3: Push a TravelCompositor
**Goal**: Events and sectors stored in the DB can be pushed to TravelCompositor as ticket-contracts, reading only from the DB, with a dry mode that prints a valid payload without calling TC.
**Depends on**: Phase 2
**Requirements**: TC-01, TC-02, TC-03
**Success Criteria** (what must be TRUE):
  1. `probe.ts` confirms (or rules out) the real TC ticket-creation endpoint using the microsite credentials (`TC_SUPPLIER_ID=18259`).
  2. `npm run push-tc:dry` prints a valid ticket-contract payload (price, description, image, dates) built solely from DB rows, without calling TC.
  3. A real push of one event creates the ticket-contract in TC, verifiable in the TC panel, and nothing is pushed unless it already exists in the DB.
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scraper API + Persistencia (MVP) | 0/5 | Not started | - |
| 2. Imágenes + Scheduling + Deploy | 0/2 | Not started | - |
| 3. Push a TravelCompositor | 0/TBD | Not started | - |
