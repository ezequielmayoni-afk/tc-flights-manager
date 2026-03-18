import { NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/meta/campaigns
 * OPTIMIZED: Sync campaigns and ad sets from Meta using account-level endpoints
 * This makes 2-3 API calls instead of 100+ calls
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

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
      // Ensure all referenced campaigns exist (some adsets may reference campaigns not in the fetched list)
      const syncedCampaignIds = new Set(campaignRecords.map(c => c.meta_campaign_id))
      const missingCampaignIds = new Set<string>()
      for (const adset of adsetRecords) {
        if (adset.meta_campaign_id && !syncedCampaignIds.has(adset.meta_campaign_id)) {
          missingCampaignIds.add(adset.meta_campaign_id)
        }
      }

      if (missingCampaignIds.size > 0) {
        console.log(`[Meta Campaigns] Inserting ${missingCampaignIds.size} missing campaign stubs for FK integrity...`)
        const missingCampaignRecords = Array.from(missingCampaignIds).map(id => ({
          meta_campaign_id: id,
          name: `Campaign ${id}`,
          status: 'UNKNOWN',
          last_sync_at: syncedAt,
        }))
        const { error: stubError } = await db
          .from('meta_campaigns')
          .upsert(missingCampaignRecords, { onConflict: 'meta_campaign_id', ignoreDuplicates: true })
        if (stubError) {
          console.error('[Meta Campaigns] Error inserting campaign stubs:', stubError)
        }
      }

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
    return errorResponse(error)
  }
}
