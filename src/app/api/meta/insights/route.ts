import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/insights
 * Get insights from database with optional filters
 * Uses meta_ads_lookup for ad names (synced from Meta account)
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const searchParams = request.nextUrl.searchParams

  const datePreset = searchParams.get('date_preset') || 'last_7d'
  const campaignId = searchParams.get('campaign_id')
  const adsetId = searchParams.get('adset_id')
  const onlyActive = searchParams.get('only_active') === 'true'
  const limit = parseInt(searchParams.get('limit') || '500')

  try {
    // Calculate date range based on preset
    const now = new Date()
    let startDate: Date

    switch (datePreset) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0))
        break
      case 'yesterday':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 1)
        startDate.setHours(0, 0, 0, 0)
        break
      case 'last_7d':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 7)
        break
      case 'last_14d':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 14)
        break
      case 'last_30d':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 30)
        break
      default:
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 7)
    }

    const startDateStr = startDate.toISOString().split('T')[0]

    // Get insights
    const { data: insights, error } = await db
      .from('meta_ad_insights')
      .select('*')
      .gte('date_start', startDateStr)
      .order('spend', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Insights GET] Query error:', error)
      throw error
    }

    // Get ad lookup data
    const adIds = [...new Set(insights?.map(i => i.meta_ad_id) || [])]

    const { data: adsLookup } = await db
      .from('meta_ads_lookup')
      .select('*')
      .in('meta_ad_id', adIds)

    const adMap = new Map(adsLookup?.map(a => [a.meta_ad_id, a]) || [])

    // Get campaign and adset names
    const { data: campaigns } = await db
      .from('meta_campaigns')
      .select('meta_campaign_id, name, status')

    const { data: adsets } = await db
      .from('meta_adsets')
      .select('meta_adset_id, name, meta_campaign_id')

    const campaignMap = new Map(campaigns?.map(c => [c.meta_campaign_id, c]) || [])
    const adsetMap = new Map(adsets?.map(a => [a.meta_adset_id, a]) || [])

    // Transform and filter - include ALL metrics for AI analysis
    let transformedInsights = (insights || []).map((insight) => {
      const adLookup = adMap.get(insight.meta_ad_id)
      const campaign = adLookup?.meta_campaign_id ? campaignMap.get(adLookup.meta_campaign_id) : null
      const adset = adLookup?.meta_adset_id ? adsetMap.get(adLookup.meta_adset_id) : null

      return {
        // Identifiers
        id: insight.id,
        meta_ad_id: insight.meta_ad_id,
        date_start: insight.date_start,
        date_stop: insight.date_stop,

        // Core metrics
        impressions: insight.impressions || 0,
        reach: insight.reach || 0,
        frequency: insight.frequency,
        spend: insight.spend || 0,

        // Click metrics
        clicks: insight.clicks || 0,
        unique_clicks: insight.unique_clicks,
        cpc: insight.cpc,
        cpm: insight.cpm,
        ctr: insight.ctr,
        unique_ctr: insight.unique_ctr,
        cost_per_unique_click: insight.cost_per_unique_click,
        link_clicks: insight.link_clicks || 0,
        inline_link_clicks: insight.inline_link_clicks,
        inline_link_click_ctr: insight.inline_link_click_ctr,
        outbound_clicks: insight.outbound_clicks,
        cost_per_outbound_click: insight.cost_per_outbound_click,

        // Video metrics
        video_p25_watched: insight.video_p25_watched,
        video_p50_watched: insight.video_p50_watched,
        video_p75_watched: insight.video_p75_watched,
        video_p100_watched: insight.video_p100_watched,
        video_avg_time_watched: insight.video_avg_time_watched,
        video_plays: insight.video_plays,
        thruplays: insight.thruplays,
        cost_per_thruplay: insight.cost_per_thruplay,

        // Quality metrics
        quality_ranking: insight.quality_ranking,
        engagement_rate_ranking: insight.engagement_rate_ranking,
        conversion_rate_ranking: insight.conversion_rate_ranking,

        // Conversion metrics
        leads: insight.leads || 0,
        cpl: insight.cpl,
        conversions: insight.conversions,
        conversion_values: insight.conversion_values,
        cost_per_conversion: insight.cost_per_conversion,
        purchase: insight.purchase,
        purchase_value: insight.purchase_value,
        add_to_cart: insight.add_to_cart,
        initiate_checkout: insight.initiate_checkout,

        // Messaging metrics
        messages: insight.messages || 0,
        messaging_first_reply: insight.messaging_first_reply || 0,
        messaging_conversations_started: insight.messaging_conversations_started,
        messaging_replies: insight.messaging_replies,
        cost_per_messaging_reply: insight.cost_per_messaging_reply,

        // Social metrics
        social_spend: insight.social_spend,
        post_engagement: insight.post_engagement,
        page_engagement: insight.page_engagement,
        post_reactions: insight.post_reactions,
        post_comments: insight.post_comments,
        post_shares: insight.post_shares,
        post_saves: insight.post_saves,
        photo_views: insight.photo_views,

        // Results
        results: insight.results,
        result_type: insight.result_type,
        cost_per_result: insight.cost_per_result,

        // Raw data for AI
        actions_raw: insight.actions_raw,
        cost_per_action_raw: insight.cost_per_action_raw,

        // Metadata
        synced_at: insight.synced_at,

        // Ad info from lookup
        ad_name: adLookup?.name || `Ad ${insight.meta_ad_id}`,
        ad_status: adLookup?.status,

        // Campaign info
        campaign_id: adLookup?.meta_campaign_id,
        campaign_name: campaign?.name,
        campaign_status: campaign?.status,

        // Adset info
        adset_id: adLookup?.meta_adset_id,
        adset_name: adset?.name,
      }
    })

    // Apply filters
    if (campaignId) {
      transformedInsights = transformedInsights.filter(i => i.campaign_id === campaignId)
    }

    if (adsetId) {
      transformedInsights = transformedInsights.filter(i => i.adset_id === adsetId)
    }

    if (onlyActive) {
      transformedInsights = transformedInsights.filter(i =>
        i.ad_status === 'ACTIVE' && i.campaign_status === 'ACTIVE'
      )
    }

    return NextResponse.json({
      insights: transformedInsights,
      count: transformedInsights.length,
      date_range: {
        start: startDateStr,
        end: new Date().toISOString().split('T')[0],
      },
    })
  } catch (error) {
    console.error('[Insights GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching insights' },
      { status: 500 }
    )
  }
}
