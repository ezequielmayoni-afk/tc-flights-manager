---
phase: 01-scraper-api-persistencia-mvp
plan: 04
subsystem: scraper-transform-persist
tags: [normalize, persist, supabase, upsert, availability-sweep, price-math]
requires:
  - "p1-scraper/src/p1/api.ts (P1EventData / P1Ticket types — Plan 03)"
  - "p1-scraper/src/supabase.ts (service-role client — Plan 01)"
  - "supabase/migrations/20260609_add_p1_scraper_tables.sql (table shape — Plan 02)"
provides:
  - "normalizeEvent: P1EventData → NormalizedEvent internal model + per-ticket price math"
  - "persistEvent: idempotent upsert of events + tickets + price history + availability sweep"
  - "dryPrintEvent: no-DB dry-mode printer for the entrypoint --dry path"
affects:
  - "p1-scraper/src/run-scrape.ts (Plan 05 entrypoint consumes both exports)"
tech-stack:
  added: []
  patterns:
    - "Defensive num() parse + try/catch → null on top-level failure (SCRAPE-06 tolerance)"
    - "PostgREST upsert onConflict for idempotency; .not('category_id','in', quotedList) sweep"
key-files:
  created:
    - p1-scraper/src/p1/normalize.ts
    - p1-scraper/src/persist.ts
  modified: []
decisions:
  - "price per ticket = parseFloat(prices_pp.TICKET_ONLY) + parseFloat(matching ticket_options[].supplement_pp by category_id); missing option → supplement 0 + warning"
  - "prices_compare parsed defensively for both string and Record<string,string> shapes (typeof === 'string' ? pc : pc?.TICKET_ONLY)"
  - "features stored as the whole category_properties map (per-ticket mapping unavailable in the API envelope)"
  - "p1_price_history row inserted per ticket per run (one history point), using the id/price returned from the ticket upsert"
  - "availability sweep is per-event, update-only (never delete), guarded by currentCategoryIds.length > 0, with quoted-UUID in-list"
metrics:
  duration: ~6m
  completed: 2026-06-09
---

# Phase 1 Plan 04: normalize.ts + persist.ts Summary

normalizeEvent maps the locked P1 API `P1EventData` envelope into the internal `NormalizedEvent` model — computing each ticket price as `TICKET_ONLY + matching ticket_options.supplement_pp`, extracting full descriptions, seatplan URLs and `category_properties` features, and tolerating every missing/malformed field (returns null + warns, never throws). persistEvent writes that model to Supabase idempotently (events by `event_uuid`, tickets by `event_id,category_id`), appends a `p1_price_history` row per ticket, and runs a per-event availability sweep that marks absent tickets `unavailable` without ever deleting.

## What Was Built

### Task 1 — `src/p1/normalize.ts` (TDD)
- Exports `NormalizedTicket`, `NormalizedEvent` interfaces and `normalizeEvent(data, ctx)`.
- Price math: builds a `Map<category_id, supplement_pp>` from `base_package.ticket_options`, then per ticket `price = (price_ticket_only ?? 0) + supplement`. A category with no matching option defaults supplement to 0 and warns.
- `prices_compare` parsed defensively for both string and object-map shapes.
- `num()` helper returns null on non-finite values; whole body wrapped in try/catch → `console.warn` + `return null` on top-level failure (SCRAPE-06).
- features = `data.category_properties ?? {}` stored as-is per ticket.

### Task 2 — `src/persist.ts`
- Exports `persistEvent(ev)` and `dryPrintEvent(ev)`.
- Event upsert `onConflict: 'event_uuid'` with `.select('id').single()` to recover the event id; on error warns and returns (per-event tolerance).
- Ticket upsert `onConflict: 'event_id,category_id'` with `availability: 'available'`; on success inserts one `p1_price_history` row per upserted ticket.
- Per-event availability sweep: `in` filter built as `'(' + ids.map(id => '"'+id+'"').join(',') + ')'`, applied via `.eq('event_id', id).not('category_id','in', inList)` only when `currentCategoryIds.length > 0`. No `.delete()` anywhere.
- `dryPrintEvent` prints the event + a ticket table (name, price, seatplan present?, description length) with no DB writes.

## Acceptance Results

| Check | Result |
| ----- | ------ |
| normalize verify (price 875, compare 999 string + object, null on broken input) | PASS — prints `normalize ok` |
| persist exports verify | PASS — prints `persist exports ok` |
| `npx tsc --noEmit` | PASS — exit 0, clean |
| grep normalize: category_id / supplement_pp / return null / console.warn | PASS (7 / 3 / 1 / 3) |
| grep persist: onConflict 'event_uuid' / 'event_id,category_id' / quoted-UUID list / currentCategoryIds.length | PASS (1 / 1 / 1 / 1) |
| grep persist: no `.delete(` | PASS (0 occurrences) |

## Deferred Live Check

The live persist write-path check is **deferred to the Plan 01-05 live-verify checkpoint**. The Supabase tables `p1_events` / `p1_tickets` / `p1_price_history` (migration `20260609_add_p1_scraper_tables.sql`) are not yet applied — a table existence probe returned `Could not find the table 'public.p1_events' in the schema cache`. Per the plan instructions this is **not** a plan failure: compile + pure-transform logic verification all pass, and persistEvent's DB interaction is verified by code review + grep against the locked schema. Once the migration is applied (Plan 05), the live upsert/sweep/price-history round-trip should be exercised.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] p1_price_history insertion**
- **Found during:** Task 2
- **Issue:** The plan `<action>` body for persist.ts did not spell out the `p1_price_history` insert, but the locked contract (critical_paths) requires "insert a p1_price_history row per ticket". Omitting it would leave DATA price-history tracking unimplemented.
- **Fix:** After the ticket upsert returns `id, price`, insert one history row per ticket (ticket_id, price, currency, recorded_at). Wrapped in its own warn-and-continue error guard.
- **Files modified:** p1-scraper/src/persist.ts
- **Commit:** n/a (commit_docs false — no git commit performed)

## Self-Check: PASSED

- FOUND: p1-scraper/src/p1/normalize.ts
- FOUND: p1-scraper/src/persist.ts
- tsc --noEmit clean (exit 0)
- normalize + persist verify scripts pass
- No commits expected (commit_docs false)
