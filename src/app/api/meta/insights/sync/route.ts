import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import type { DatePreset, MetaAPIInsight } from '@/lib/meta-ads/types'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Parse all insight data from Meta API response for comprehensive AI analysis
 */
function parseFullInsight(insight: MetaAPIInsight) {
  const actions = insight.actions || []
  const costPerAction = insight.cost_per_action_type || []

  // Helper to find action value
  const getAction = (type: string): number => {
    const action = actions.find(a => a.action_type === type)
    return action ? parseInt(action.value, 10) || 0 : 0
  }

  // Helper to find cost per action
  const getCostPerAction = (type: string): number | null => {
    const cost = costPerAction.find(c => c.action_type === type)
    return cost ? parseFloat(cost.value) : null
  }

  // Helper to get video metric (sum all action types)
  const getVideoMetric = (arr?: Array<{ action_type: string; value: string }>): number => {
    if (!arr || arr.length === 0) return 0
    return arr.reduce((sum, item) => sum + (parseInt(item.value, 10) || 0), 0)
  }

  // Helper to get outbound clicks
  const getOutboundClicks = (): number => {
    if (!insight.outbound_clicks || insight.outbound_clicks.length === 0) return 0
    return insight.outbound_clicks.reduce((sum, item) => sum + (parseInt(item.value, 10) || 0), 0)
  }

  return {
    // Core metrics
    impressions: parseInt(insight.impressions || '0', 10),
    reach: parseInt(insight.reach || '0', 10),
    frequency: insight.frequency ? parseFloat(insight.frequency) : null,
    spend: parseFloat(insight.spend || '0'),

    // Click metrics
    clicks: parseInt(insight.clicks || '0', 10),
    unique_clicks: insight.unique_clicks ? parseInt(insight.unique_clicks, 10) : null,
    cpc: insight.cpc ? parseFloat(insight.cpc) : null,
    cpm: insight.cpm ? parseFloat(insight.cpm) : null,
    ctr: insight.ctr ? parseFloat(insight.ctr) : null,
    unique_ctr: insight.unique_ctr ? parseFloat(insight.unique_ctr) : null,
    cost_per_unique_click: insight.cost_per_unique_click ? parseFloat(insight.cost_per_unique_click) : null,
    inline_link_clicks: insight.inline_link_clicks ? parseInt(insight.inline_link_clicks, 10) : null,
    inline_link_click_ctr: insight.inline_link_click_ctr ? parseFloat(insight.inline_link_click_ctr) : null,
    outbound_clicks: getOutboundClicks(),
    cost_per_outbound_click: getCostPerAction('outbound_click'),
    link_clicks: getAction('link_click'),

    // Video metrics
    video_p25_watched: getVideoMetric(insight.video_p25_watched_actions),
    video_p50_watched: getVideoMetric(insight.video_p50_watched_actions),
    video_p75_watched: getVideoMetric(insight.video_p75_watched_actions),
    video_p100_watched: getVideoMetric(insight.video_p100_watched_actions),
    video_avg_time_watched: getVideoMetric(insight.video_avg_time_watched_actions),
    video_plays: getVideoMetric(insight.video_play_actions),
    thruplays: getAction('video_view') || getAction('thruplay'),
    cost_per_thruplay: getCostPerAction('video_view') || getCostPerAction('thruplay'),

    // Quality metrics
    quality_ranking: insight.quality_ranking,
    engagement_rate_ranking: insight.engagement_rate_ranking,
    conversion_rate_ranking: insight.conversion_rate_ranking,

    // Conversion metrics
    leads: getAction('lead'),
    cpl: getCostPerAction('lead'),
    conversions: insight.conversions ? parseInt(insight.conversions, 10) : null,
    conversion_values: insight.conversion_values ? parseFloat(insight.conversion_values) : null,
    cost_per_conversion: insight.cost_per_conversion ? parseFloat(insight.cost_per_conversion) : null,
    purchase: getAction('purchase') || getAction('omni_purchase'),
    purchase_value: getAction('purchase_value') || getAction('omni_purchase_value'),
    add_to_cart: getAction('add_to_cart') || getAction('omni_add_to_cart'),
    initiate_checkout: getAction('initiate_checkout') || getAction('omni_initiated_checkout'),

    // Messaging metrics
    messages: getAction('onsite_conversion.messaging_conversation_started_7d'),
    messaging_first_reply: getAction('onsite_conversion.messaging_first_reply'),
    messaging_conversations_started: getAction('onsite_conversion.messaging_conversation_started_7d'),
    messaging_replies: getAction('onsite_conversion.messaging_first_reply'),
    cost_per_messaging_reply: getCostPerAction('onsite_conversion.messaging_first_reply'),

    // Social engagement metrics
    social_spend: insight.social_spend ? parseFloat(insight.social_spend) : null,
    post_engagement: getAction('post_engagement'),
    page_engagement: getAction('page_engagement'),
    post_reactions: getAction('post_reaction'),
    post_comments: getAction('comment'),
    post_shares: getAction('post'),
    post_saves: getAction('onsite_conversion.post_save'),
    photo_views: getAction('photo_view'),

    // Results (generic)
    results: getAction('result') || getAction('lead') || getAction('onsite_conversion.messaging_conversation_started_7d'),
    cost_per_result: getCostPerAction('result') || getCostPerAction('lead') || getCostPerAction('onsite_conversion.messaging_conversation_started_7d'),

    // Raw data for complete AI analysis
    actions_raw: insight.actions || null,
    cost_per_action_raw: insight.cost_per_action_type || null,
  }
}

/**
 * POST /api/meta/insights/sync
 * Sync ALL ads and their insights from Meta account
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { date_preset = 'last_7d' } = body as {
      date_preset?: DatePreset
    }

    const metaClient = getMetaAdsClient()

    // Step 1: Get ALL ads from the Meta account
    console.log('[Insights Sync] Fetching all ads from Meta account...')
    const allAds = await metaClient.getAllAds()
    console.log(`[Insights Sync] Found ${allAds.length} ads in the account`)

    if (allAds.length === 0) {
      return NextResponse.json({
        synced: 0,
        errors: 0,
        message: 'No ads found in the Meta account',
      })
    }

    // Step 2: Sync ad sets and campaigns first (for reference)
    console.log('[Insights Sync] Syncing campaigns and ad sets...')
    const campaigns = await metaClient.getCampaigns()

    // Batch upsert campaigns
    const campaignRecords = campaigns.map(campaign => ({
      meta_campaign_id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective: campaign.objective,
      last_sync_at: new Date().toISOString(),
    }))

    if (campaignRecords.length > 0) {
      await db.from('meta_campaigns').upsert(campaignRecords, { onConflict: 'meta_campaign_id' })
    }

    // Get all ad sets using optimized account-level endpoint (1-2 API calls)
    console.log('[Insights Sync] Fetching all ad sets from Meta...')
    const allAdSets = await metaClient.getAllAdSets()
    console.log(`[Insights Sync] Found ${allAdSets.length} ad sets`)

    // Batch upsert ad sets
    const adsetRecords = allAdSets.map(adset => ({
      meta_adset_id: adset.id,
      meta_campaign_id: adset.campaign_id,
      name: adset.name,
      status: adset.status,
      last_sync_at: new Date().toISOString(),
    }))

    // Batch in chunks of 500
    for (let i = 0; i < adsetRecords.length; i += 500) {
      const batch = adsetRecords.slice(i, i + 500)
      await db.from('meta_adsets').upsert(batch, { onConflict: 'meta_adset_id' })
    }

    // Step 3: Fetch insights using OPTIMIZED account-level endpoint
    // This makes 1-2 API calls instead of 74+ calls for 3700 ads
    console.log(`[Insights Sync] Fetching insights using optimized endpoint (${date_preset})...`)

    const insights = await metaClient.getAllAdInsightsOptimized(date_preset)
    console.log(`[Insights Sync] Got ${insights.length} insight records`)

    let synced = 0
    let errors = 0

    // Step 4: Prepare and batch upsert insights to database
    console.log('[Insights Sync] Preparing insights records for batch upsert...')
    const insightRecords = insights.map(insight => {
      const parsed = parseFullInsight(insight)
      return {
        meta_ad_id: insight.ad_id,
        date_start: insight.date_start,
        date_stop: insight.date_stop,
        // Core metrics
        impressions: parsed.impressions,
        reach: parsed.reach,
        frequency: parsed.frequency,
        spend: parsed.spend,
        // Click metrics
        clicks: parsed.clicks,
        unique_clicks: parsed.unique_clicks,
        cpc: parsed.cpc,
        cpm: parsed.cpm,
        ctr: parsed.ctr,
        unique_ctr: parsed.unique_ctr,
        cost_per_unique_click: parsed.cost_per_unique_click,
        link_clicks: parsed.link_clicks,
        inline_link_clicks: parsed.inline_link_clicks,
        inline_link_click_ctr: parsed.inline_link_click_ctr,
        outbound_clicks: parsed.outbound_clicks,
        cost_per_outbound_click: parsed.cost_per_outbound_click,
        // Video metrics
        video_p25_watched: parsed.video_p25_watched,
        video_p50_watched: parsed.video_p50_watched,
        video_p75_watched: parsed.video_p75_watched,
        video_p100_watched: parsed.video_p100_watched,
        video_avg_time_watched: parsed.video_avg_time_watched,
        video_plays: parsed.video_plays,
        thruplays: parsed.thruplays,
        cost_per_thruplay: parsed.cost_per_thruplay,
        // Quality ranking
        quality_ranking: parsed.quality_ranking,
        engagement_rate_ranking: parsed.engagement_rate_ranking,
        conversion_rate_ranking: parsed.conversion_rate_ranking,
        // Conversion metrics
        leads: parsed.leads,
        cpl: parsed.cpl,
        conversions: parsed.conversions,
        conversion_values: parsed.conversion_values,
        cost_per_conversion: parsed.cost_per_conversion,
        purchase: parsed.purchase,
        purchase_value: parsed.purchase_value,
        add_to_cart: parsed.add_to_cart,
        initiate_checkout: parsed.initiate_checkout,
        // Messaging metrics
        messages: parsed.messages,
        messaging_first_reply: parsed.messaging_first_reply,
        messaging_conversations_started: parsed.messaging_conversations_started,
        messaging_replies: parsed.messaging_replies,
        cost_per_messaging_reply: parsed.cost_per_messaging_reply,
        // Social metrics
        social_spend: parsed.social_spend,
        post_engagement: parsed.post_engagement,
        page_engagement: parsed.page_engagement,
        post_reactions: parsed.post_reactions,
        post_comments: parsed.post_comments,
        post_shares: parsed.post_shares,
        post_saves: parsed.post_saves,
        photo_views: parsed.photo_views,
        // Results
        results: parsed.results,
        cost_per_result: parsed.cost_per_result,
        // Raw data for AI
        actions_raw: parsed.actions_raw,
        cost_per_action_raw: parsed.cost_per_action_raw,
        // Metadata
        synced_at: new Date().toISOString(),
      }
    })

    // Batch upsert insights in chunks of 500
    console.log(`[Insights Sync] Batch upserting ${insightRecords.length} insight records...`)
    for (let i = 0; i < insightRecords.length; i += 500) {
      const batch = insightRecords.slice(i, i + 500)
      try {
        const { error: batchError } = await db
          .from('meta_ad_insights')
          .upsert(batch, { onConflict: 'meta_ad_id,date_start,date_stop' })

        if (batchError) {
          console.error(`[Insights Sync] Error upserting batch ${i / 500 + 1}:`, batchError)
          errors += batch.length
        } else {
          synced += batch.length
        }
      } catch (error) {
        console.error(`[Insights Sync] Error upserting batch ${i / 500 + 1}:`, error)
        errors += batch.length
      }
    }

    // Step 5: Batch save ad metadata to lookup table
    console.log('[Insights Sync] Batch saving ad metadata to lookup table...')
    const adMetadataRecords = allAds.map(ad => ({
      meta_ad_id: ad.id,
      name: ad.name,
      status: ad.status,
      meta_adset_id: ad.adset_id,
      meta_campaign_id: ad.campaign_id,
      created_time: ad.created_time,
      last_sync_at: new Date().toISOString(),
    }))

    // Batch upsert in chunks of 500
    for (let i = 0; i < adMetadataRecords.length; i += 500) {
      const batch = adMetadataRecords.slice(i, i + 500)
      await db.from('meta_ads_lookup').upsert(batch, { onConflict: 'meta_ad_id' })
    }
    console.log(`[Insights Sync] Saved metadata for ${allAds.length} ads`)

    return NextResponse.json({
      synced,
      errors,
      total_ads: allAds.length,
      total_insights: insights.length,
      campaigns_synced: campaigns.length,
      adsets_synced: allAdSets.length,
    })
  } catch (error) {
    console.error('[Insights Sync] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error syncing insights' },
      { status: 500 }
    )
  }
}
