---
phase: 01-scraper-api-persistencia-mvp
plan: 05
subsystem: scraper-entrypoint
tags: [orchestration, dry-mode, availability-sweep, cli]
requires:
  - "scrapeListing / resolveUuid / getEvent (Plan 03)"
  - "normalizeEvent (Plan 04)"
  - "persistEvent / dryPrintEvent (Plan 04)"
  - "supabase client (Plan 01)"
  - "p1_events / p1_tickets schema migration (Plan 02) — required only for real runs"
provides:
  - "end-to-end scrape orchestration entrypoint (src/run-scrape.ts)"
  - "--dry mode that prints events/sectors/prices/images writing nothing"
  - "run-level availability sweep deactivating events absent from the latest listing (DATA-04)"
affects:
  - "npm run scrape / npm run scrape:dry"
tech-stack:
  added: []
  patterns:
    - "per-event try/catch tolerance (SCRAPE-06)"
    - "seenUuids set drives run-level sweep; size>0 guard prevents mass deactivation on failed runs"
    - "quoted-UUID PostgREST 'in' filter; never .delete()"
key-files:
  created:
    - "src/run-scrape.ts"
  modified: []
decisions:
  - "Run-level sweep gated by !dry AND seenUuids.size > 0 so a fully-failed run never deactivates all events"
  - "Tickets of deactivated events marked availability='unavailable' via a two-step fetch-ids-then-update (no join), never deleted"
  - "Events counted as 'seen' only after successful normalize, so a fetch/normalize failure does not protect a stale event from the sweep"
metrics:
  duration: ~3m
  completed: 2026-06-09
---

# Phase 1 Plan 05: run-scrape.ts Entrypoint Summary

End-to-end scrape orchestrator wiring listing → resolveUuid → getEvent → normalizeEvent → persist/print, with `--dry` mode (OPS-03), per-event error tolerance (SCRAPE-06), and a run-level availability sweep that deactivates events that vanished entirely from the listing (DATA-04).

## What Was Built

`src/run-scrape.ts`:
- Parses `--dry` from `process.argv`.
- `scrapeListing()` → for each discovered event: `resolveUuid` → `getEvent` → `normalizeEvent` → `dryPrintEvent` (dry) or `persistEvent` (real). Throttling lives inside each module (THROTTLE_MS).
- Per-event `try/catch`: a resolve/fetch/normalize failure logs a warning, increments `skipped`, and continues — never aborts the run.
- `seenUuids` set is populated only after a successful `normalizeEvent`.
- Run-level sweep (real runs only, and only when `seenUuids.size > 0`): builds a quoted-UUID PostgREST `in` filter, sets `active=false` on `p1_events` whose `event_uuid` is NOT in `seenUuids`, then fetches the now-inactive event ids and marks their `p1_tickets` `availability='unavailable'`. No deletes anywhere.
- Fatal errors at `main()` level exit non-zero.

## Verification Performed

1. `npx tsc --noEmit` — clean (TSC_CLEAN).
2. Grep wiring checks — all pass: `--dry` flag, `dryPrintEvent`, `persistEvent`, `seenUuids`, `seenUuids.size > 0` guard, `!dry` gate, `active: false`, `availability: 'unavailable'`, quoted UUIDs (`'"' + u + '"'`), `.not('event_uuid', 'in', ...)`, and confirmed NO `.delete(` present.
3. Live dry run `npm run scrape:dry` (hits p1travel LIVE, writes nothing):
   - Discovered **7 F1 events**, ok=7 skipped=0, log ended with `(no DB writes)`.
   - Each event printed its sectors with price + seatplan (all `yes`) + description length.
   - **Belgian GP 2026 - Fri/Sat/Sun: exactly 14 tickets, prices 225–875 EUR**, all with seatplan images and non-empty descriptions — matches the locked acceptance expectation.
   - Sample events: Barcelona GP (2 tickets, 225), Austrian GP (1 ticket, 475), Austrian GP F1 Experiences (1 ticket, 3500), British GP (3 tickets, 475–700), Belgian GP Hospitality (6 tickets, 550–2350), Belgian GP Ticket+Camping (4 tickets, 850–1050).
   - One benign warning logged (no ticket_option for one Barcelona category → supplement defaulted to 0), as designed in normalize.ts.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred / Pending Verification

The plan is `autonomous: false`. The remaining verification requires LIVE DB writes and the Plan 02 migration applied (not yet confirmed):
- `npm run scrape` (real) populating `p1_events` / `p1_tickets` idempotently.
- Belgian GP showing 14 persisted tickets (225–875 EUR, descriptions, seatplan urls) in Supabase.
- Idempotency: a second `npm run scrape` leaves counts unchanged.
- Run-level sweep (DATA-04): an event/UUID absent from the latest listing flips to `active=false` and its tickets to `availability='unavailable'` (not deleted).

These are surfaced to the user via the checkpoint below.

## Self-Check: PASSED
- FOUND: src/run-scrape.ts
- tsc clean; dry run executed successfully against live source.
- (No commits made — commit_docs is false for this plan.)
