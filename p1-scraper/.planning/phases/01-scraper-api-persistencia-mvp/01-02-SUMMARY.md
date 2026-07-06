---
phase: 01-scraper-api-persistencia-mvp
plan: 02
subsystem: persistence / database schema
tags: [supabase, postgres, migration, ddl, scraper]
status: awaiting-checkpoint
requires: []
provides:
  - "p1_events table (event_uuid UNIQUE)"
  - "p1_tickets table (UNIQUE event_id, category_id; FK to p1_events)"
  - "p1_price_history table (FK to p1_tickets)"
affects:
  - persist.ts (upserts against this schema)
tech-stack:
  added: []
  patterns:
    - "Idempotent DDL via create table if not exists"
    - "gen_random_uuid() for uuid PKs (Supabase built-in)"
    - "on delete cascade FKs for child rows"
key-files:
  created:
    - supabase/migrations/20260609_add_p1_scraper_tables.sql
  modified: []
decisions:
  - "Used gen_random_uuid() instead of uuid_generate_v4() (not guaranteed in Supabase)"
  - "Defaulted currency to EUR (P1 Travel F1 pricing is EUR)"
  - "on delete cascade so tickets/price-history are removed with parent rows"
metrics:
  duration: ~3m
  completed: 2026-06-09
  tasks_completed: 1
  tasks_total: 2
---

# Phase 1 Plan 02: P1 Scraper Tables Migration Summary

Created the Supabase migration defining the three F1 scraper tables — `p1_events`, `p1_tickets`, `p1_price_history` — with the idempotency constraints (`event_uuid` UNIQUE, `(event_id, category_id)` UNIQUE) and FKs that `persist.ts` upserts against. Applying the DDL to the live Supabase project is a human/CLI checkpoint per project convention.

## What Was Built

`supabase/migrations/20260609_add_p1_scraper_tables.sql` containing:

**p1_events** — one row per F1 event. PK `id uuid` (gen_random_uuid). Idempotency key `event_uuid uuid not null unique`. Columns: source_url, slug, name, series ('formula-1'), status, venue_name, city, country_code, lat (double precision), lng (double precision), time_zone, date_time (timestamptz), date_time_end (timestamptz), main_image_url, main_image_storage_path, marketing_label, description, price_ticket_only (numeric), price_ticket_hotel (numeric), price_compare (numeric), currency ('EUR'), tc_ticket_id (nullable), active (boolean true), first_seen_at, last_seen_at, updated_at.

**p1_tickets** — one row per ticket category. PK `id uuid`. `event_id uuid not null references public.p1_events(id) on delete cascade`. `category_id uuid not null`. Columns: name, description, seatplan_image_url, seatplan_image_storage_path, price (numeric), currency ('EUR'), features (jsonb), delivery_type, availability ('available'), last_seen_at, updated_at. Constraint `unique (event_id, category_id)`.

**p1_price_history** — append-only price snapshots. PK `id uuid`. `ticket_id uuid not null references public.p1_tickets(id) on delete cascade`. Columns: price (numeric), currency ('EUR'), recorded_at.

**Indexes:** `idx_p1_tickets_event_id` on p1_tickets(event_id); `idx_p1_price_history_ticket_id` on p1_price_history(ticket_id).

All tables use `create table if not exists` so the migration is re-runnable.

## Tasks Completed

| Task | Name | Status |
| ---- | ---- | ------ |
| 1 | Write the migration SQL for the three scraper tables | Done |
| 2 | Apply migration to Supabase (checkpoint:human-action) | Awaiting user |

## Verification

- grep count of the three `create table if not exists` statements = **3** (matches acceptance criteria).
- `event_uuid uuid not null unique` present (count 1).
- `unique (event_id, category_id)` present (count 1).
- p1_tickets references `public.p1_events(id)` (count 1); p1_price_history references `public.p1_tickets(id)` (count 1).
- `features jsonb` present (count 1).
- Offline SQL parse: neither `psql` nor `supabase` CLI is installed locally, so no live parse was run. SQL is standard PostgreSQL DDL with balanced syntax confirmed by structural grep; validation completes on apply.

## Deviations from Plan

None — migration written exactly per the locked Modelo de datos. The filename uses the plan-specified convention `20260609_add_p1_scraper_tables.sql` (YYYYMMDD_description.sql).

## Checkpoint

Task 2 is a `checkpoint:human-action` gate. The migration file is written and ready; applying DDL to the live Supabase project requires the dashboard SQL Editor or linked CLI credentials. See the checkpoint message for apply/verify steps.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260609_add_p1_scraper_tables.sql
- All acceptance-criteria greps pass (3 create-table statements, both FKs, both UNIQUE constraints, features jsonb).
- No commits made (commit_docs false; per instructions STATE.md/ROADMAP.md not modified, no git commit performed).
