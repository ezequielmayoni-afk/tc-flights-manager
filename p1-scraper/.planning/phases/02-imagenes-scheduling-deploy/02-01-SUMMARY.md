---
phase: 02-imagenes-scheduling-deploy
plan: 01
subsystem: infra
tags: [supabase-storage, image-mirroring, scraper, typescript, esm]

# Dependency graph
requires:
  - phase: 01-scraper-foundation
    provides: p1_events/p1_tickets/p1_price_history tables, NormalizedEvent model, persistEvent pipeline, service-role supabase client
provides:
  - src/images.ts mirroring event/ticket images into the public Supabase Storage bucket p1-images with deterministic, idempotent paths
  - storage_path columns populated on real runs (seatplan images), original *_url columns preserved
  - mirrorEventImages wired into run-scrape.ts non-dry branch only
  - npm run images alias for the mirroring-inclusive scrape
  - DATA-03 price snapshot confirmed and annotated
affects: [travelcompositor, phase-03, image-serving]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-image try/catch tolerance: any single fetch/upload/update failure warns and continues, never aborts the run"
    - "Deterministic Storage paths + upsert:true for idempotent re-runs"
    - "Module-level once-guard for bucket provisioning per process"

key-files:
  created:
    - p1-scraper/src/images.ts
  modified:
    - p1-scraper/src/run-scrape.ts
    - p1-scraper/package.json
    - p1-scraper/src/persist.ts

key-decisions:
  - "ensureBucket() treats already-exists/409/Duplicate as success and never throws, so manual dashboard bucket creation is also supported"
  - "Throttle moved to finally block in uploadImage so it applies on every code path (success, http error, exception)"
  - "Event main images currently absent from the p1 API envelope (content.main_image null for all 6 events) — code mirrors them correctly when present; nothing to upload now"

patterns-established:
  - "Image mirroring as a post-persist step inside the non-dry branch, keeping --dry write-free"

requirements-completed: [IMG-01, IMG-02, DATA-03]

# Metrics
duration: ~10min
completed: 2026-06-11
---

# Phase 2 Plan 01: Image Mirroring to Supabase Storage Summary

**Mirrors event main images and ticket seatplan images into the public Supabase Storage bucket `p1-images` with deterministic idempotent paths, records storage paths in the DB while preserving original URLs, and wires it into the non-dry scrape pipeline.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 3
- **Files created:** 1
- **Files modified:** 3

## Accomplishments
- `src/images.ts` created: `ensureBucket()` (once-guarded, public bucket, tolerant of already-exists), `uploadImage()` (fetch → arrayBuffer → upsert upload → public path, throttled, fully try/catch-wrapped), and `mirrorEventImages()` (resolves event id, mirrors main image + every seatplan image, updates both `*_storage_path` columns).
- Wired `mirrorEventImages(normalized)` into `run-scrape.ts` after `persistEvent` inside the non-dry branch only; `--dry` still performs zero downloads/writes.
- Added `npm run images` script (runs the mirroring-inclusive non-dry pipeline, per ROADMAP success criterion).
- Confirmed and annotated DATA-03: persist.ts inserts one `p1_price_history` row per ticket per run (no behavior change).
- Real run verified: bucket auto-created via service role; 30 ticket seatplan paths populated; 6 `tickets/` subfolders present in Storage; 90 `p1_price_history` rows.

## Task Commits

commit_docs is false for this plan — no commits were made (per instructions). All changes are in the working tree.

1. **Task 1: Create src/images.ts** — uncommitted (feat)
2. **Task 2: Wire mirrorEventImages into run-scrape.ts + add images script** — uncommitted (feat)
3. **Task 3: Confirm + annotate DATA-03 price snapshot** — uncommitted (docs)

## Files Created/Modified
- `p1-scraper/src/images.ts` - Created. Image mirroring into Supabase Storage bucket p1-images + storage_path column updates.
- `p1-scraper/src/run-scrape.ts` - Added `mirrorEventImages` import and call after `persistEvent` in the non-dry branch.
- `p1-scraper/package.json` - Added `"images"` script.
- `p1-scraper/src/persist.ts` - Added DATA-03 contract comment above the historyRows map (no behavioral change).

## Decisions Made
- `ensureBucket()` swallows already-exists/409/Duplicate as success and never throws — supports both service-role auto-creation and manual dashboard creation.
- Throttle (`THROTTLE_MS`) placed in `finally` of `uploadImage` so it applies on every exit path.
- Bucket auto-created successfully by the service role during the real run; no manual dashboard step was required.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Event main images not present in source data.** After the real run, `p1_events.main_image_url` is null for all 6 active events (`content.main_image` is absent from the p1 API envelope for these F1 events), so `main_image_storage_path` and the `events/` Storage folder are empty. This is a data-source reality, not a code defect: `mirrorEventImages` correctly guards on `if (ev.main_image_url)` and would mirror the main image whenever the source provides one. Ticket seatplan mirroring works fully (30 paths, 6 subfolders). The must-have "single failing image logs a warning and continues" and "*_storage_path holds the storage path while *_url is preserved" are both satisfied on the seatplan path.

## Verification Results
- `npx tsc --noEmit -p tsconfig.json` → clean (exit 0).
- `npm run images`/`npm run scrape` → 6 events persisted + mirrored, run-level sweep ran, no fatal errors.
- DB: `p1_tickets.seatplan_image_storage_path` non-null count = 30; `p1_price_history` total = 90.
- Storage: `tickets/` has 6 subfolders; `events/` empty (no source main images — see Issues).

## Next Phase Readiness
- Stable, owned image URLs are available for ticket seatplans for TravelCompositor (Phase 3).
- Open item for a future phase/data check: if/when the p1 API exposes `content.main_image`, event main images will be mirrored automatically with no code change.

## Self-Check: PASSED

- FOUND: p1-scraper/src/images.ts
- FOUND: mirrorEventImages call in run-scrape.ts (non-dry branch)
- FOUND: "images" script in package.json
- FOUND: DATA-03 annotation in persist.ts
- tsc --noEmit clean
- Storage objects present (tickets/, 6 subfolders); 30 seatplan storage paths in DB

---
*Phase: 02-imagenes-scheduling-deploy*
*Completed: 2026-06-11*
