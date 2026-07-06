import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

// projectRoot = the p1-scraper directory (src/config.ts → src → p1-scraper)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Try candidate .env.local locations in order, load the FIRST that exists.
// This makes the scraper portable across both deployment layouts:
//   1. standalone VPS:  /opt/p1-scraper/.env.local
//   2. nested in hub:   /Users/ezequielmayoni/hub/.env.local
const envCandidates = [
  path.join(projectRoot, '.env.local'),
  path.join(projectRoot, '..', '.env.local'),
]

const envPath = envCandidates.find((p) => existsSync(p))
if (envPath) {
  loadEnv({ path: envPath })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase credentials — ensure one of [' +
      envCandidates.join(', ') +
      '] has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
  )
}

export const config = {
  supabaseUrl,
  supabaseServiceRoleKey,
}

// Scraper constants
export const THROTTLE_MS = 400
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
