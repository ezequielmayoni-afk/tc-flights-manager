import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/campaigns
 * OPTIMIZED: Sync campaigns and ad sets from Meta using account-level endpoints
 * This makes 2-3 API calls instead of 100+ calls
 */
export async function GET() {
  const db = getSupabaseClient()

  try {
    const metaClient = getMetaAdsClient()
    const syncedAt = new Date().toISOString()

    // Fetch campaigns from Meta (1 API call with pagination)
    console.log('[Meta Campaigns] Fetching campaigns from Meta...')
    const metaCampaigns = await metaClient.getCampaigns()
    console.log(`[Meta Campaigns] Found ${metaCampaigns.length} campaigns`)

    // Fetch ALL ad sets in one call (1-2 API calls with pagination)
    console.log('[Meta Campaigns] Fetching ALL ad sets from Meta...')
    const metaAdSets = await metaClient.getAllAdSets()
    console.log(`[Meta Campaigns] Found ${metaAdSets.length} ad sets`)

    // Batch upsert campaigns (much faster than one-by-one)
    const campaignRecords = metaCampaigns.map(campaign => ({
      meta_campaign_id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective: campaign.objective,
      daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
      lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
      currency: campaign.account_currency || 'USD',
      last_sync_at: syncedAt,
    }))

    if (campaignRecords.length > 0) {
      const { error: campaignError } = await db
        .from('meta_campaigns')
        .upsert(campaignRecords, { onConflict: 'meta_campaign_id' })

      if (campaignError) {
        console.error('[Meta Campaigns] Error upserting campaigns:', campaignError)
      }
    }

    // Batch upsert ad sets (much faster than one-by-one)
    const adsetRecords = metaAdSets.map(adset => ({
      meta_adset_id: adset.id,
      meta_campaign_id: adset.campaign_id,
      name: adset.name,
      status: adset.status,
      targeting: adset.targeting || {},
      daily_budget: adset.daily_budget ? parseFloat(adset.daily_budget) / 100 : null,
      bid_amount: adset.bid_amount ? parseFloat(adset.bid_amount) / 100 : null,
      optimization_goal: adset.optimization_goal,
      last_sync_at: syncedAt,
    }))

    if (adsetRecords.length > 0) {
      // Batch in chunks of 500 to avoid payload limits
      for (let i = 0; i < adsetRecords.length; i += 500) {
        const batch = adsetRecords.slice(i, i + 500)
        const { error: adsetError } = await db
          .from('meta_adsets')
          .upsert(batch, { onConflict: 'meta_adset_id' })

        if (adsetError) {
          console.error('[Meta Campaigns] Error upserting adsets batch:', adsetError)
        }
      }
    }

    // Fetch campaigns from database (separate query - no FK dependency)
    const { data: campaigns, error: campaignsError } = await db
      .from('meta_campaigns')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('name')

    if (campaignsError) {
      throw campaignsError
    }

    // Fetch all adsets from database (separate query)
    const { data: adsets, error: adsetsError } = await db
      .from('meta_adsets')
      .select('*')
      .order('status')
      .order('name')

    if (adsetsError) {
      console.error('[Meta Campaigns] Error fetching adsets:', adsetsError)
    }

    // Group adsets by campaign_id in JavaScript (no FK needed)
    const adsetsByCampaign = (adsets || []).reduce((acc, adset) => {
      const campaignId = adset.meta_campaign_id
      if (!acc[campaignId]) {
        acc[campaignId] = []
      }
      acc[campaignId].push(adset)
      return acc
    }, {} as Record<string, typeof adsets>)

    // Format response with nested adsets
    const formattedCampaigns = campaigns?.map((campaign) => ({
      ...campaign,
      meta_adsets: adsetsByCampaign[campaign.meta_campaign_id] || [],
      adsets: adsetsByCampaign[campaign.meta_campaign_id] || [],
      adsets_count: (adsetsByCampaign[campaign.meta_campaign_id] || []).length,
    }))

    return NextResponse.json({
      campaigns: formattedCampaigns,
      synced_at: syncedAt,
      stats: {
        campaigns_synced: metaCampaigns.length,
        adsets_synced: metaAdSets.length,
      }
    })
  } catch (error) {
    console.error('[Meta Campaigns] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error syncing campaigns' },
      { status: 500 }
    )
  }
}
