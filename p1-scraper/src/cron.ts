// Long-lived cron worker (OPS-01): schedules the Phase 1 scrape pipeline to run
// once per day at 06:00 Europe/Madrid. Runs under PM2 as the `p1-scraper` app.
//
// Approach B (see plan §interfaces): instead of refactoring the verified
// run-scrape.ts entrypoint, we SPAWN it as a child process (`npx tsx
// src/run-scrape.ts`). This keeps the Phase 1 CLI entrypoint untouched and gives
// us clean process isolation per run. A module-level `running` guard (T-02-07)
// prevents overlapping runs from piling up.

import cron from 'node-cron'
import { spawn } from 'node:child_process'

let running = false

function runScrapeOnce(): void {
  if (running) {
    console.log('[cron] previous run still in progress — skipping')
    return
  }
  running = true
  console.log('[cron] starting scrape run ' + new Date().toISOString())

  const child = spawn('npx', ['tsx', 'src/run-scrape.ts'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  child.on('exit', (code) => {
    running = false
    console.log('[cron] scrape run exited code=' + code)
  })

  child.on('error', (err) => {
    running = false
    console.error('[cron] failed to spawn scrape run: ' + String(err))
  })
}

// OPS-01: once per day at 06:00, in the catalog's locale (Europe/Madrid).
cron.schedule('0 6 * * *', runScrapeOnce, { timezone: 'Europe/Madrid' })

console.log('[cron] p1-scraper scheduler started — daily at 06:00 Europe/Madrid')

// Optional manual trigger for deploy verification: `tsx src/cron.ts --now`
if (process.argv.includes('--now')) {
  console.log('[cron] --now flag detected — forcing an immediate run')
  runScrapeOnce()
}

// No process.exit: node-cron keeps the event loop alive so PM2 keeps it running.
