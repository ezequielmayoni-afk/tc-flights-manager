import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { config } from './config.js'

// Node < 22 lacks a native global WebSocket. @supabase/supabase-js (realtime-js)
// requires a WebSocket constructor at client construction time and throws otherwise.
// The VPS runs Node 20, so polyfill it. No-op on Node 22+ where WebSocket is global.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  ;(globalThis as { WebSocket?: unknown }).WebSocket = ws
}

/**
 * Service-role Supabase client for the p1-scraper microservice.
 * Mirrors hub/src/lib/supabase/admin.ts — server-side only.
 */
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
