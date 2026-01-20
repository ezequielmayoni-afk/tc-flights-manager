import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/adsets?campaign_id=XXX
 * Get ad sets for a specific campaign
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching ad sets' },
      { status: 500 }
    )
  }
}
