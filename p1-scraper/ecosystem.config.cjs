// PM2 config for the p1-scraper cron worker on the VPS.
// Uso: pm2 start ecosystem.config.cjs
//
// NOTE: .cjs (NOT .js) on purpose — package.json has "type": "module", so a .js
// file would be parsed as ESM and `module.exports` would fail. The .cjs extension
// forces CommonJS, which is what PM2's require() expects.
module.exports = {
  apps: [{
    name: 'p1-scraper',
    script: 'npx',
    args: 'tsx src/cron.ts',
    cwd: '/opt/p1-scraper',
    interpreter: 'none',
    // Plain HTTP scraper (no Playwright/browser) — 500M is ample.
    max_memory_restart: '500M',
    autorestart: true,
    watch: false,
    error_file: '/var/log/p1-scraper.err.log',
    out_file: '/var/log/p1-scraper.out.log',
    time: true,
  }]
}
