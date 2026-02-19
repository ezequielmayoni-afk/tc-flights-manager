import { NextResponse } from 'next/server'
import { checkAndSendManualQuoteNotifications } from '@/lib/notifications/manual-quote'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * POST /api/notifications/check-manual-quotes
 * Check for packages with requote_status = 'needs_manual' and send notifications
 * for those that haven't been notified yet
 */
export async function POST() {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { count, error } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('requote_status', 'needs_manual')
      .not('requote_price', 'is', null)

    if (error) {
      return errorResponse(error)
    }

    return NextResponse.json({
      pendingCount: count || 0,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
