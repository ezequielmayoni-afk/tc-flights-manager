import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * POST /api/requote/clear-pending
 * Clear all pending packages (mark as completed) so only newly selected ones are processed
 */
export async function POST() {
  const { authorized } = await checkSectionAccess('requote')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { data, error } = await db
      .from('packages')
      .update({ requote_status: 'completed' })
      .eq('requote_status', 'pending')
      .select('id')

    if (error) {
      return errorResponse(error)
    }

    return NextResponse.json({
      success: true,
      cleared: data?.length || 0,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
