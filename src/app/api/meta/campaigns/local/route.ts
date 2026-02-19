import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/meta/campaigns/local
 * Get campaigns and adsets from database only (no Meta API call)
 * Used for displaying options in the UI without triggering expensive API syncs
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    // Get all active campaigns from database
    const { data: campaigns, error: campaignsError } = await db
      .from('meta_campaigns')
      .select('id, meta_campaign_id, name, status, objective')
      .eq('status', 'ACTIVE')
      .order('name', { ascending: true })

    if (campaignsError) {
      throw campaignsError
    }

    // Get all active adsets from database
    const { data: adsets, error: adsetsError } = await db
      .from('meta_adsets')
      .select('id, meta_adset_id, meta_campaign_id, name, status, optimization_goal')
      .eq('status', 'ACTIVE')
      .order('name', { ascending: true })

    if (adsetsError) {
      throw adsetsError
    }

    // Group adsets by campaign_id
    const adsetsByCampaign = (adsets || []).reduce((acc, adset) => {
      const campaignId = adset.meta_campaign_id
      if (!acc[campaignId]) acc[campaignId] = []
      acc[campaignId].push(adset)
      return acc
    }, {} as Record<string, typeof adsets>)

    // Attach adsets to each campaign
    const campaignsWithAdsets = (campaigns || []).map(campaign => ({
      ...campaign,
      adsets: adsetsByCampaign[campaign.meta_campaign_id] || []
    }))

    return NextResponse.json({
      campaigns: campaignsWithAdsets,
      total_campaigns: campaigns?.length || 0,
      total_adsets: adsets?.length || 0,
    })
  } catch (error) {
    console.error('[Meta Campaigns Local] Error:', error)
    return errorResponse(error)
  }
}
