---
phase: 01-scraper-api-persistencia-mvp
plan: 01
subsystem: scraper-foundation
tags: [scaffolding, esm, tsx, supabase, config]
requires: []
provides:
  - "p1-scraper ESM/tsx project shell (package.json, tsconfig, env.example, gitignore, README)"
  - "config.ts: validated env loading from ../.env.local + scraper constants"
  - "supabase.ts: service-role Supabase client"
affects:
  - "All downstream plans import ./config.js and ./supabase.js"
tech-stack:
  added:
    - "@supabase/supabase-js ^2.45.0"
    - "dotenv ^16.4.0"
    - "tsx ^4.19.0"
    - "typescript ^5.5.0"
    - "@types/node ^22.0.0"
  patterns:
    - "ESM + tsx microservice (mirrors SEO_HOTEL / cotizador-bot)"
    - "Service-role Supabase client (mirrors hub/src/lib/supabase/admin.ts)"
    - "Credentials inherited from ../.env.local via dotenv (no secrets in folder)"
key-files:
  created:
    - "p1-scraper/package.json"
    - "p1-scraper/tsconfig.json"
    - "p1-scraper/.env.example"
    - "p1-scraper/.gitignore"
    - "p1-scraper/README.md"
    - "p1-scraper/src/config.ts"
    - "p1-scraper/src/supabase.ts"
  modified: []
decisions:
  - "ESM .js import specifiers (./config.js) for tsx/ESM resolution"
  - "dotenv path resolved from import.meta.url → ../../.env.local = hub/.env.local"
metrics:
  duration: "~3 min"
  completed: "2026-06-09"
  tasks: 2
  files: 7
---

# Phase 1 Plan 01: p1-scraper Foundation Scaffold Summary

Scaffolded the independent `p1-scraper/` ESM/tsx microservice and built the two foundation modules every downstream plan imports: `config.ts` (loads + validates Supabase credentials from `../.env.local`, exposes `THROTTLE_MS`/`BROWSER_UA`) and `supabase.ts` (service-role client with `persistSession: false`).

## What Was Built

### Task 1 — ESM/tsx project shell
- `package.json`: `"type": "module"`, scripts `scrape` (`npx tsx src/run-scrape.ts`) and `scrape:dry` (`--dry`), deps `@supabase/supabase-js`, `dotenv`; devDeps `tsx`, `typescript`, `@types/node`.
- `tsconfig.json`: `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, `strict: true`, `esModuleInterop`, `skipLibCheck`, `types: [node]`, `include: src/**/*.ts`.
- `.env.example`: documents inherited `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (empty — real values in `../.env.local`).
- `.gitignore`: `node_modules`, `.env`, `.env.local`, `dist`, `*.log`.
- `README.md`: what the service does, how to run, credential inheritance from `../.env.local`, manual migration note.
- Ran `npm install` — 16 packages added, 0 vulnerabilities; `node_modules/.bin/tsx` present.

### Task 2 — config.ts + supabase.ts
- `src/config.ts`: resolves `../../.env.local` via `fileURLToPath(import.meta.url)` + `path.resolve`, loads with dotenv, validates both credentials (fail-fast `throw`), exports `config = { supabaseUrl, supabaseServiceRoleKey }`, `THROTTLE_MS = 400`, `BROWSER_UA`.
- `src/supabase.ts`: `import { config } from './config.js'`, exports `supabase = createClient(..., { auth: { autoRefreshToken: false, persistSession: false } })`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `node -e` package.json type+scripts | `ok` |
| `npx tsx import('./src/config.ts')` | `config ok` (../.env.local loaded, validation passed) |
| `npx tsx import('./src/supabase.ts')` | `supabase ok` (client constructs, `.from` is a function) |
| grep: package.json `"type": "module"` + both scripts | OK |
| grep: tsconfig `module: ESNext` + `strict: true` | OK |
| grep: .env.example both vars empty | OK |
| grep: .gitignore node_modules + .env.local | OK |
| grep: config.ts `.env.local` + THROTTLE_MS + BROWSER_UA | OK |
| grep: supabase.ts imports `./config` + `persistSession: false` | OK |

## Notes for Downstream Plans

- Import foundation via ESM `.js` specifiers: `import { config, THROTTLE_MS, BROWSER_UA } from './config.js'` and `import { supabase } from './supabase.js'`.
- `node_modules` is installed (tsx, @supabase/supabase-js, dotenv) — later waves can run immediately.
- `src/run-scrape.ts` (entrypoint referenced by scripts) does not yet exist; a later plan must create it.

## Self-Check: PASSED

All 7 created files exist on disk; both runtime imports succeed. No git commits made (commit_docs=false, p1-scraper untracked — per orchestrator instructions).
