import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkAndSendManualQuoteNotifications } from '@/lib/notifications/manual-quote'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/notifications/check-manual-quotes
 * Check for packages with requote_status = 'needs_manual' and send notifications
 * for those that haven't been notified yet
 */
export async function POST() {
  const result = await checkAndSendManualQuoteNotifications()

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result)
}

/**
 * GET /api/notifications/check-manual-quotes
 * Get count of packages that need notification
 */
export async function GET() {
  const db = getSupabaseClient()

  try {
    const { count, error } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('requote_status', 'needs_manual')
      .not('requote_price', 'is', null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      pendingCount: count || 0,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
