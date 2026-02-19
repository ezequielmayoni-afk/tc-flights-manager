import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/meta/adsets?campaign_id=XXX
 * Get ad sets for a specific campaign
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()
  const campaignId = request.nextUrl.searchParams.get('campaign_id')

  try {
    let query = db
      .from('meta_adsets')
      .select('*')
      .order('status') // Active first
      .order('name')

    if (campaignId) {
      query = query.eq('meta_campaign_id', campaignId)
    }

    const { data: adsets, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ adsets })
  } catch (error) {
    console.error('[Meta AdSets] Error:', error)
    return errorResponse(error)
  }
}
