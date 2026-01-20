import { createClient } from '@supabase/supabase-js'

/**
 * Supabase Admin Client
 * Uses the service role key for admin operations like creating users
 * ONLY use this on the server side (API routes)
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase admin credentials. Make sure SUPABASE_SERVICE_ROLE_KEY is set.')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
