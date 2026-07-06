---
phase: 02-imagenes-scheduling-deploy
plan: 02
subsystem: scheduling-deploy
tags: [cron, pm2, deploy, rsync, vps, node-cron]
requires:
  - "Phase 1 scrape pipeline (src/run-scrape.ts) with image mirroring (Plan 01)"
  - "src/config.ts portable env loading"
provides:
  - "Daily autonomous scrape via node-cron (OPS-01)"
  - "PM2 app definition ecosystem.config.cjs for the cron worker"
  - "Reproducible rsync + npm ci + PM2 deploy to the VPS (OPS-02)"
affects:
  - "VPS /opt/p1-scraper runtime"
tech-stack:
  added:
    - "node-cron ^4.2.1 (daily scheduler)"
    - "@types/node-cron ^3.0.11 (dev)"
  patterns:
    - "Approach B: cron worker SPAWNS the existing run-scrape.ts entrypoint (no refactor of the verified Phase 1 CLI)"
    - "PM2 .cjs config under type:module (CommonJS require by PM2)"
    - "Retry-loop health check on pm2 status + stable restart count (worker, not HTTP)"
key-files:
  created:
    - "p1-scraper/src/cron.ts"
    - "p1-scraper/ecosystem.config.cjs"
    - "p1-scraper/deploy.sh"
  modified:
    - "p1-scraper/package.json (node-cron dep + cron script)"
    - "p1-scraper/.env.example (bucket dependency note)"
    - "p1-scraper/src/config.ts (verified already portable — no change needed this plan)"
decisions:
  - "Chose Approach B (spawn) over Approach A (refactor run-scrape into an export) to keep the verified Phase 1 entrypoint untouched and gain per-run process isolation."
  - "Named the PM2 config .cjs (not .js) because package.json has type:module; a .js file would be parsed as ESM and module.exports would fail under PM2's require()."
  - "Health check uses pm2 jlist status + stable restart_time over a retry loop instead of curl /health, because p1-scraper is a cron worker not an HTTP server."
metrics:
  duration: ~8m
  completed: 2026-06-11
  tasks: 3
  files: 5
---

# Phase 2 Plan 02: Scheduling & VPS Deploy Summary

Made the p1 scraper run autonomously: node-cron daily worker (06:00 Europe/Madrid) running under PM2, plus a reproducible rsync+npm-ci+PM2 deploy script to the VPS. The live `./deploy.sh` run is a human-action checkpoint (touches root@148.230.72.17 over SSH).

## What Was Built

### Task 1 — config.ts portability (verified, no change)
`src/config.ts` was already portable from prior work: it resolves `projectRoot` from `import.meta.url`, tries an `envCandidates` array (`<root>/.env.local` then `<root>/../.env.local`) via `existsSync`, loads the first that exists, and keeps fail-fast validation (throws with the candidate list if Supabase creds are missing). This makes it work both standalone on the VPS (`/opt/p1-scraper/.env.local`) and nested in the hub locally. Verified: `tsc --noEmit` clean, `existsSync` + `envCandidates` present.

### Task 2 — node-cron daily scheduler
- Installed `node-cron` (dependency) + `@types/node-cron` (dev).
- Created `src/cron.ts`: long-lived process that `cron.schedule('0 6 * * *', runScrapeOnce, { timezone: 'Europe/Madrid' })`. `runScrapeOnce` spawns `npx tsx src/run-scrape.ts` (Approach B), with a module-level `running` guard that skips overlapping runs (T-02-07). Logs start/exit. Optional `--now` flag forces an immediate run for deploy verification. No `process.exit` — node-cron keeps the event loop alive for PM2.
- Added `"cron": "npx tsx src/cron.ts"` to package.json scripts.
- Added a bucket-dependency note to `.env.example`.

### Task 3 — PM2 config + deploy script
- `ecosystem.config.cjs`: PM2 app `p1-scraper`, `script: npx`, `args: tsx src/cron.ts`, `cwd: /opt/p1-scraper`, `interpreter: none`, `autorestart`, `max_memory_restart: 500M`, logs at `/var/log/p1-scraper.{err,out}.log`, `time: true`.
- `deploy.sh` (chmod +x): rsync `--delete` over `ssh -i ~/.ssh/deploy_vps` to `root@148.230.72.17:/opt/p1-scraper` (excludes node_modules, .env.local, .git, *.log, *.png, .planning). Remote heredoc: copies needed creds from `/opt/hub/.env.local` into `/opt/p1-scraper/.env.local` if missing (validates Supabase keys present), runs `npm ci` (falls back to `npm install` if no lockfile), `pm2 start ecosystem.config.cjs` (or restart --update-env) + `pm2 save`, then a retry loop (10×2s) requiring `pm2 jlist` status=online AND restart count == baseline (proves not crash-looping). Must be run from inside `p1-scraper/`.

## Verification Performed (local)

- `npx tsc --noEmit` — clean (config.ts + cron.ts).
- `node -e "require('./ecosystem.config.cjs')"` — requires cleanly.
- `bash -n deploy.sh` — syntax valid; `deploy.sh` is executable.
- grep checks: `name: 'p1-scraper'`, `tsx src/cron.ts`, `/var/log/p1-scraper` in ecosystem; `ecosystem.config.cjs`, `/opt/p1-scraper`, `/opt/hub/.env.local`, `rsync`, `npm ci`, `seq 1 10` retry loop, `pm2`, and NO real curl health line in deploy.sh.
- package.json: `cron` script present, `node-cron` in dependencies.

## Deviations from Plan

None — plan executed as written. Task 1 (config.ts portability) was already satisfied by prior work, so it was verified rather than re-implemented (acceptance criteria all pass).

## Deferred / Checkpoint

The live VPS deploy (`./deploy.sh`) is a blocking human-action checkpoint — it requires the operator's SSH key (`~/.ssh/deploy_vps`) and runs against the live VPS + PM2, which the executor cannot self-authenticate. All artifacts are in place and pass local syntax/type checks; awaiting operator to run the deploy and verify.

## Self-Check: PASSED

- FOUND: p1-scraper/src/cron.ts
- FOUND: p1-scraper/ecosystem.config.cjs
- FOUND: p1-scraper/deploy.sh (executable)
- FOUND: cron script + node-cron dep in package.json
- FOUND: config.ts portable (existsSync + envCandidates)
- No commits made (commit_docs=false, executor does not commit this plan).
