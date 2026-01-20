import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface SyncedAd {
  id: number
  variant: number
  meta_ad_id: string
  meta_adset_id: string
  ad_name: string
  status: string
  meta_status: string | null  // Status from Meta API (ACTIVE, PAUSED, DELETED, etc.)
  exists_in_meta: boolean
  last_synced_at: string
}

/**
 * POST /api/meta/ads/sync
 * Sync ads from Meta to verify which ones still exist
 *
 * Body: { package_id: number } or { adset_id: string }
 *
 * Returns:
 * - synced_ads: Array of ads with their real status from Meta
 * - deleted_count: Number of ads that were deleted in Meta
 * - active_count: Number of ads that still exist in Meta
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { package_id, adset_id } = body as {
      package_id?: number
      adset_id?: string
    }

    if (!package_id && !adset_id) {
      return new Response(JSON.stringify({ error: 'package_id or adset_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const metaClient = getMetaAdsClient()

    // Get ads from our database
    let query = db
      .from('meta_ads')
      .select('*')
      .order('variant', { ascending: true })

    if (package_id) {
      query = query.eq('package_id', package_id)
    }
    if (adset_id) {
      query = query.eq('meta_adset_id', adset_id)
    }

    const { data: dbAds, error: dbError } = await query

    if (dbError) {
      console.error('[Ads Sync] Database error:', dbError)
      throw dbError
    }

    if (!dbAds || dbAds.length === 0) {
      return new Response(JSON.stringify({
        synced_ads: [],
        deleted_count: 0,
        active_count: 0,
        message: 'No ads found in database'
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[Ads Sync] Found ${dbAds.length} ads in database, checking Meta status...`)

    const syncedAds: SyncedAd[] = []
    let deletedCount = 0
    let activeCount = 0
    const now = new Date().toISOString()

    // Check each ad in Meta
    for (const dbAd of dbAds) {
      const metaAd = await metaClient.getAdById(dbAd.meta_ad_id)

      const syncedAd: SyncedAd = {
        id: dbAd.id,
        variant: dbAd.variant,
        meta_ad_id: dbAd.meta_ad_id,
        meta_adset_id: dbAd.meta_adset_id,
        ad_name: dbAd.ad_name,
        status: dbAd.status,
        meta_status: metaAd ? metaAd.effective_status : 'DELETED',
        exists_in_meta: !!metaAd,
        last_synced_at: now,
      }

      if (metaAd) {
        activeCount++
        // Update database with real status from Meta
        await db
          .from('meta_ads')
          .update({
            status: metaAd.effective_status,
            meta_status: metaAd.effective_status,
            last_synced_at: now,
          })
          .eq('id', dbAd.id)
      } else {
        deletedCount++
        // Mark as deleted in database
        await db
          .from('meta_ads')
          .update({
            status: 'DELETED',
            meta_status: 'DELETED',
            last_synced_at: now,
          })
          .eq('id', dbAd.id)
      }

      syncedAds.push(syncedAd)
    }

    console.log(`[Ads Sync] Sync complete: ${activeCount} active, ${deletedCount} deleted`)

    // Update ads_created_count in packages table (count only non-deleted ads)
    if (package_id) {
      const { count } = await db
        .from('meta_ads')
        .select('*', { count: 'exact', head: true })
        .eq('package_id', package_id)
        .neq('status', 'DELETED')

      await db
        .from('packages')
        .update({
          ads_created_count: count || 0,
          ads_active_count: activeCount,
        })
        .eq('id', package_id)

      console.log(`[Ads Sync] Updated package ${package_id}: ads_created_count=${count || 0}, ads_active_count=${activeCount}`)
    }

    return new Response(JSON.stringify({
      synced_ads: syncedAds,
      deleted_count: deletedCount,
      active_count: activeCount,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Ads Sync] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error syncing ads' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
