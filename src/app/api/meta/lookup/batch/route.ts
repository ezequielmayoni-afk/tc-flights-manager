import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

/**
 * POST /api/meta/lookup/batch
 * Batch lookup campaign and adset names from local DB
 * Falls back to Meta API for IDs not found locally, and saves them for future use
 * Body: { campaignIds: string[], adsetIds: string[] }
 * Returns: { campaigns: Record<id, {name, status}>, adsets: Record<id, {name, status, campaign_id}>, needsSync: boolean }
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const body = await request.json()
    const campaignIds: string[] = (body.campaignIds || []).filter(Boolean)
    const adsetIds: string[] = (body.adsetIds || []).filter(Boolean)
    const forceRefresh: boolean = body.force_refresh === true

    const db = createAdminClient()

    const campaigns: Record<string, { name: string; status: string; objective?: string }> = {}
    const adsets: Record<string, { name: string; status: string; campaign_id: string }> = {}

    // Si force_refresh, saltamos el caché local — vamos directo a Meta API
    if (!forceRefresh) {
      // Batch fetch campaigns from Supabase
      if (campaignIds.length > 0) {
        const { data } = await db
          .from('meta_campaigns')
          .select('meta_campaign_id, name, status, objective')
          .in('meta_campaign_id', campaignIds)

        for (const c of data || []) {
          campaigns[c.meta_campaign_id] = {
            name: c.name,
            status: c.status,
            objective: c.objective,
          }
        }
      }

      // Batch fetch adsets from Supabase
      if (adsetIds.length > 0) {
        const { data } = await db
          .from('meta_adsets')
          .select('meta_adset_id, meta_campaign_id, name, status')
          .in('meta_adset_id', adsetIds)

        for (const a of data || []) {
          adsets[a.meta_adset_id] = {
            name: a.name,
            status: a.status,
            campaign_id: a.meta_campaign_id,
          }
        }
      }
    }

    // En force_refresh todos cuentan como missing → todos van a Meta API y sobreescriben caché
    const missingCampaignIds = forceRefresh ? campaignIds : campaignIds.filter(id => !campaigns[id])
    const missingAdsetIds = forceRefresh ? adsetIds : adsetIds.filter(id => !adsets[id])

    if (missingCampaignIds.length > 0 || missingAdsetIds.length > 0) {
      try {
        const metaClient = getMetaAdsClient()
        const syncedAt = new Date().toISOString()

        // Fetch missing campaigns from Meta API
        // - sin forceRefresh: capped a 20 (no inundar Meta en hot path)
        // - con forceRefresh: el user lo pidió explícitamente, traer todos
        const campaignsToFetch = forceRefresh ? missingCampaignIds : missingCampaignIds.slice(0, 20)
        const campaignPromises = campaignsToFetch.map(id =>
          metaClient.getCampaignById(id).catch(() => null)
        )
        const campaignResults = await Promise.all(campaignPromises)

        const campaignRecordsToSave = []
        for (let i = 0; i < campaignsToFetch.length; i++) {
          const result = campaignResults[i]
          if (result) {
            campaigns[result.id] = {
              name: result.name,
              status: result.status,
              objective: result.objective,
            }
            campaignRecordsToSave.push({
              meta_campaign_id: result.id,
              name: result.name,
              status: result.status,
              objective: result.objective,
              last_sync_at: syncedAt,
            })
          }
        }

        // Save fetched campaigns to Supabase
        if (campaignRecordsToSave.length > 0) {
          await db
            .from('meta_campaigns')
            .upsert(campaignRecordsToSave, { onConflict: 'meta_campaign_id' })
            .then(({ error }) => {
              if (error) console.error('[Meta Lookup Batch] Error saving campaigns:', error)
            })
        }

        // Fetch missing adsets from Meta API (capped salvo forceRefresh)
        const adsetsToFetch = forceRefresh ? missingAdsetIds : missingAdsetIds.slice(0, 20)
        const adsetPromises = adsetsToFetch.map(id =>
          metaClient.getAdSetById(id).catch(() => null)
        )
        const adsetResults = await Promise.all(adsetPromises)

        const adsetRecordsToSave = []
        const extraCampaignIds = new Set<string>()
        for (let i = 0; i < adsetsToFetch.length; i++) {
          const result = adsetResults[i]
          if (result) {
            adsets[result.id] = {
              name: result.name,
              status: result.status,
              campaign_id: result.campaign_id,
            }
            // Ensure the referenced campaign exists before saving adset
            if (result.campaign_id && !campaigns[result.campaign_id]) {
              extraCampaignIds.add(result.campaign_id)
            }
            adsetRecordsToSave.push({
              meta_adset_id: result.id,
              meta_campaign_id: result.campaign_id,
              name: result.name,
              status: result.status,
              last_sync_at: syncedAt,
            })
          }
        }

        // Fetch any extra campaigns referenced by adsets
        if (extraCampaignIds.size > 0) {
          const extraPromises = Array.from(extraCampaignIds).slice(0, 20).map(id =>
            metaClient.getCampaignById(id).catch(() => null)
          )
          const extraResults = await Promise.all(extraPromises)
          const extraRecords = []
          for (const result of extraResults) {
            if (result) {
              campaigns[result.id] = {
                name: result.name,
                status: result.status,
                objective: result.objective,
              }
              extraRecords.push({
                meta_campaign_id: result.id,
                name: result.name,
                status: result.status,
                objective: result.objective,
                last_sync_at: syncedAt,
              })
            }
          }
          if (extraRecords.length > 0) {
            await db
              .from('meta_campaigns')
              .upsert(extraRecords, { onConflict: 'meta_campaign_id' })
              .then(({ error }) => {
                if (error) console.error('[Meta Lookup Batch] Error saving extra campaigns:', error)
              })
          }
        }

        // Save fetched adsets to Supabase
        if (adsetRecordsToSave.length > 0) {
          await db
            .from('meta_adsets')
            .upsert(adsetRecordsToSave, { onConflict: 'meta_adset_id' })
            .then(({ error }) => {
              if (error) console.error('[Meta Lookup Batch] Error saving adsets:', error)
            })
        }

        console.log(`[Meta Lookup Batch] Fetched ${campaignRecordsToSave.length} campaigns and ${adsetRecordsToSave.length} adsets from Meta API`)
      } catch (metaError) {
        console.error('[Meta Lookup Batch] Meta API fallback error:', metaError)
        // Don't fail the whole request, just return what we have from Supabase
      }
    }

    // Check if we need a full sync (last sync > 24h ago)
    let needsSync = false
    const { data: lastSynced } = await db
      .from('meta_campaigns')
      .select('last_sync_at')
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastSynced?.last_sync_at) {
      needsSync = true
    } else {
      const lastSyncTime = new Date(lastSynced.last_sync_at).getTime()
      const hoursSinceSync = (Date.now() - lastSyncTime) / (1000 * 60 * 60)
      needsSync = hoursSinceSync > 24
    }

    return NextResponse.json({ campaigns, adsets, needsSync })
  } catch (error) {
    console.error('[Meta Lookup Batch] Error:', error)
    return errorResponse(error)
  }
}
