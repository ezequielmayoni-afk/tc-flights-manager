import { getMetaAdsClient } from '@/lib/meta-ads/client'
import type { DatePreset, MetaAPIInsight } from '@/lib/meta-ads/types'
import type { Db } from '@/lib/jobs/types'
import { setIntegrationStatus } from '@/lib/jobs/integrations'

/**
 * Sincronización de campañas, conjuntos, anuncios e insights desde Meta.
 *
 * Es la lógica que tenía POST /api/meta/insights/sync, extraída para que la
 * corra el job `insights.sync` cada hora (hasta ahora se sincronizaba a mano
 * y los datos quedaron congelados desde junio). La ruta sigue existiendo y
 * llama a esta función.
 */

export interface InsightsSyncResult {
  synced: number
  errors: number
  totalAds: number
  totalInsights: number
  campaignsSynced: number
  adsetsSynced: number
  adsStatusUpdated: number
  packagesTouched: number
}

const CHUNK = 500

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


export async function syncMetaInsights(
  db: Db,
  options: { datePreset?: DatePreset; log?: (message: string, details?: Record<string, unknown>) => Promise<void> } = {}
): Promise<InsightsSyncResult> {
  const datePreset = options.datePreset ?? 'last_7d'
  const log = options.log ?? (async () => {})
  const metaClient = getMetaAdsClient()
  const now = new Date().toISOString()

  let allAds: Awaited<ReturnType<typeof metaClient.getAllAds>>
  try {
    allAds = await metaClient.getAllAds()
  } catch (err) {
    await setIntegrationStatus(db, 'meta', { status: 'down', details: { error: err instanceof Error ? err.message : String(err), at: 'getAllAds' } })
    throw err
  }
  if (allAds.length === 0) {
    return { synced: 0, errors: 0, totalAds: 0, totalInsights: 0, campaignsSynced: 0, adsetsSynced: 0, adsStatusUpdated: 0, packagesTouched: 0 }
  }

  // Campañas y conjuntos (referencia)
  const campaigns = await metaClient.getCampaigns()
  if (campaigns.length > 0) {
    await db.from('meta_campaigns').upsert(campaigns.map(c => ({ meta_campaign_id: c.id, name: c.name, status: c.status, objective: c.objective, last_sync_at: now })), { onConflict: 'meta_campaign_id' })
  }
  const allAdSets = await metaClient.getAllAdSets()
  const adsetRecords = allAdSets.map(a => ({ meta_adset_id: a.id, meta_campaign_id: a.campaign_id, name: a.name, status: a.status, last_sync_at: now }))
  for (let i = 0; i < adsetRecords.length; i += CHUNK) {
    await db.from('meta_adsets').upsert(adsetRecords.slice(i, i + CHUNK), { onConflict: 'meta_adset_id' })
  }

  // Insights (una o dos llamadas a nivel cuenta)
  const insights = await metaClient.getAllAdInsightsOptimized(datePreset)
  let synced = 0
  let errors = 0
  const insightRecords = insights.map(insight => ({
    meta_ad_id: insight.ad_id,
    date_start: insight.date_start,
    date_stop: insight.date_stop,
    ...parseFullInsight(insight),
    synced_at: now,
  }))
  for (let i = 0; i < insightRecords.length; i += CHUNK) {
    const batch = insightRecords.slice(i, i + CHUNK)
    const { error } = await db.from('meta_ad_insights').upsert(batch, { onConflict: 'meta_ad_id,date_start,date_stop' })
    if (error) {
      console.error('[insights-sync] error en lote:', error.message)
      errors += batch.length
    } else {
      synced += batch.length
    }
  }

  // Metadata de anuncios (lookup) + estado real de los anuncios que HUB conoce
  const lookup = allAds.map(ad => ({ meta_ad_id: ad.id, name: ad.name, status: ad.status, meta_adset_id: ad.adset_id, meta_campaign_id: ad.campaign_id, created_time: ad.created_time, last_sync_at: now }))
  for (let i = 0; i < lookup.length; i += CHUNK) {
    await db.from('meta_ads_lookup').upsert(lookup.slice(i, i + CHUNK), { onConflict: 'meta_ad_id' })
  }

  let adsStatusUpdated = 0
  const { data: known } = await db.from('meta_ads').select('id, meta_ad_id, meta_status, package_id')
  const statusById = new Map(allAds.map(ad => [ad.id, ad.status]))
  const packagesWithInsights = new Set<number>()
  const insightAdIds = new Set(insights.map(i => i.ad_id))
  for (const row of (known ?? []) as Array<{ id: number; meta_ad_id: string; meta_status: string | null; package_id: number | null }>) {
    const metaStatus = statusById.get(row.meta_ad_id)
    if (metaStatus && metaStatus !== row.meta_status) {
      const { error } = await db.from('meta_ads').update({ meta_status: metaStatus, last_synced_at: now }).eq('id', row.id)
      if (!error) adsStatusUpdated++
    } else if (metaStatus) {
      await db.from('meta_ads').update({ last_synced_at: now }).eq('id', row.id)
    }
    if (row.package_id && insightAdIds.has(row.meta_ad_id)) packagesWithInsights.add(row.package_id)
  }
  if (packagesWithInsights.size > 0) {
    await db.from('packages').update({ insights_fresh_at: now }).in('id', [...packagesWithInsights])
  }

  await setIntegrationStatus(db, 'meta', { status: 'ok', details: { lastSync: now, datePreset, totalAds: allAds.length, totalInsights: insights.length } })
  const result = { synced, errors, totalAds: allAds.length, totalInsights: insights.length, campaignsSynced: campaigns.length, adsetsSynced: allAdSets.length, adsStatusUpdated, packagesTouched: packagesWithInsights.size }
  await log(`Insights de Meta (${datePreset}): ${synced} filas, ${allAds.length} anuncios, ${adsStatusUpdated} estados actualizados`, { ...result })
  return result
}
