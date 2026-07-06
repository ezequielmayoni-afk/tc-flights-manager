---
phase: 01-scraper-api-persistencia-mvp
plan: 03
subsystem: scraper-read-pipeline
tags: [scraper, jsonld, listing, checkout-api, f1]
requires:
  - "p1-scraper/src/config.ts (BROWSER_UA, THROTTLE_MS) — Plan 01"
provides:
  - "extractJsonLd(html) — JSON-LD block extraction"
  - "scrapeListing() — F1 event discovery via paginated CollectionPage JSON-LD"
  - "parseUuids/resolveUuid — EVENT_UUID + CATEGORY_UUID resolution"
  - "getEvent + P1EventData/P1Venue/P1Content/P1Ticket/P1TicketOption/P1BasePackage interfaces — checkout API v2 client"
affects:
  - "normalize.ts (Plan 04) consumes ListingEvent, UuidPair, and P1EventData"
tech-stack:
  added: []
  patterns:
    - "Native fetch with browser UA + Accept header"
    - "Regex-based HTML scraping (no DOM parser)"
    - "Throttle via setTimeout(THROTTLE_MS) between detail/API requests"
    - "Tolerant parsing: malformed JSON-LD skipped, missing checkout link -> null"
key-files:
  created:
    - p1-scraper/src/p1/jsonld.ts
    - p1-scraper/src/p1/listing.ts
    - p1-scraper/src/p1/resolveUuid.ts
    - p1-scraper/src/p1/api.ts
  modified: []
decisions:
  - "F1 filter uses pathname.includes('/motorsports/formula-1/') — matches real canonical URLs which are /es/motorsports/formula-1/<slug> (no /events/ segment in the canonical href)"
  - "res.json() cast to { data: P1EventData } to satisfy TS unknown return type"
metrics:
  duration: ~10m
  completed: 2026-06-09
---

# Phase 1 Plan 03: Read Pipeline (jsonld / listing / resolveUuid / api) Summary

One-liner: Tolerant regex/JSON-LD read pipeline that discovers F1 events, resolves each event's checkout UUID pair, and fetches the full typed event JSON from the p1travel `_TWBP/api/v2` checkout API — verified end-to-end against the live site.

## What was built

- **`jsonld.ts`** — `extractJsonLd(html)` matches all `<script type="application/ld+json">` blocks via global regex and `JSON.parse`s each inside try/catch; malformed blocks log `[jsonld] skipped malformed block` and are skipped, never thrown.
- **`listing.ts`** — `scrapeListing()` paginates `https://www.p1travel.com/es/events/motorsports?page=N` with `BROWSER_UA`, finds the `CollectionPage` JSON-LD, walks `mainEntity.itemListElement[].item` of `@type SportsEvent`, keeps only URLs whose path contains `/motorsports/formula-1/`, dedupes by URL in a Map, and stops after 2 consecutive zero-new-URL pages (`emptyStreak`). Per-page fetch errors `console.warn` and break instead of crashing. Exports `ListingEvent` interface.
- **`resolveUuid.ts`** — `parseUuids(html)` regex-extracts `checkout.p1travel.com/es/<EVENT_UUID>/ticket?category_id=<CATEGORY_UUID>` returning `UuidPair | null`; `resolveUuid(detailUrl)` fetches the detail page and returns the pair (or null + warn when no checkout link), throttling after fetch.
- **`api.ts`** — `getEvent(eventUuid, categoryUuid)` builds the exact `_TWBP/api/v2/events/{uuid}?include=organizer,base_package_ticket_options,content,venue,series&base_ticket_cat_id={cat}&locale=es` URL, throws on non-ok response, and returns `json.data` typed as `P1EventData`. Full interface set exported (`P1Venue`, `P1Content`, `P1TicketOption`, `P1Ticket`, `P1BasePackage`, `P1EventData`) with `prices_compare: Record<string, string> | string`.

## Verification / Acceptance results

- `jsonld ok` — 1 valid + 1 malformed block returns exactly 1 object, no throw. PASS
- `uuid ok` — parseUuids round-trips a checkout link and returns null when absent. PASS
- `npx tsc --noEmit` — clean (after fixing `res.json()` unknown cast). PASS
- Grep acceptance: `formula-1`, `emptyStreak`, `BROWSER_UA`, `THROTTLE_MS` in listing.ts; `_TWBP/api/v2/events`, `base_ticket_cat_id`, `json.data`, `Record<string, string> | string`, `res.ok` in api.ts. PASS
- **Live end-to-end smoke test (real p1travel.com):**
  - `scrapeListing()` discovered 7 unique F1 events (deduped, pagination stopped correctly).
  - `resolveUuid()` on a real detail URL returned `{ eventUuid, categoryUuid }`.
  - `getEvent()` returned full data: `name="Barcelona GP 2026 - Fri/Sat/Sun 2026"`, `venue.name="Circuit de Catalunya"`, `venue.city.name="Barcelona"`, `prices_pp={TICKET_ONLY:"225.00",TICKET_HOTEL:"375.00"}`, `prices_compare` (object shape observed), `tickets=2`, `ticket_options=1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `res.json()` returns `unknown` under TS strict**
- **Found during:** Task 2 typecheck
- **Issue:** `const json = await res.json(); return json.data` failed `tsc` with TS18046 ('json' is of type 'unknown').
- **Fix:** Cast `(await res.json()) as { data: P1EventData }`. `json.data` access preserved (grep acceptance still satisfied).
- **Files modified:** p1-scraper/src/p1/api.ts

### Note on listing URL paths

The plan's listing fetch URL `/es/events/motorsports?page=N` is correct as the request URL, but the canonical event hrefs returned in JSON-LD are `/es/motorsports/formula-1/<slug>` (no `/events/` segment). The F1 filter `pathname.includes('/motorsports/formula-1/')` matches these correctly — verified live (7 events found). No code change needed.

## Self-Check: PASSED

Files created (all confirmed on disk):
- p1-scraper/src/p1/jsonld.ts
- p1-scraper/src/p1/listing.ts
- p1-scraper/src/p1/resolveUuid.ts
- p1-scraper/src/p1/api.ts

No commits made (commit_docs=false, per orchestrator instructions).
