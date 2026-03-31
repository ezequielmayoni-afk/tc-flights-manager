import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * POST /api/packages/[id]/dismiss-update
 * Dismiss the creative update request for a package.
 * Sets creative_update_needed = false and clears the reason.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const packageId = parseInt(id, 10)
  if (isNaN(packageId)) {
    return NextResponse.json({ error: 'Invalid package ID' }, { status: 400 })
  }

  const db = createAdminClient()

  const { error } = await db
    .from('packages')
    .update({
      creative_update_needed: false,
      creative_update_reason: null,
    })
    .eq('id', packageId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
