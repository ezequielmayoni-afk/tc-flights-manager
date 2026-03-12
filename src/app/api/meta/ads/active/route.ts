import { NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/meta/ads/active
 * Fetch all ACTIVE ads with delivery in the last 7 days from Meta
 * Cross-references with local DB to show which are linked to a package
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const metaClient = getMetaAdsClient()
    const db = createAdminClient()

    // Fetch all active ads from Meta ad account with insights from last 7 days
    const ads = await metaClient.getActiveAdsWithInsights()

    // Get all meta_ad_ids we have in our DB to cross-reference
    const metaAdIds = ads.map(ad => ad.id)
    const { data: linkedAds } = await db
      .from('meta_ads')
      .select('meta_ad_id, package_id, packages:package_id(id, tc_package_id, title)')
      .in('meta_ad_id', metaAdIds.length > 0 ? metaAdIds : ['__none__'])

    // Build a lookup map
    const linkedMap: Record<string, { package_id: number; tc_package_id: number; title: string }> = {}
    for (const ad of linkedAds || []) {
      const pkg = ad.packages as unknown as { id: number; tc_package_id: number; title: string } | null
      if (pkg) {
        linkedMap[ad.meta_ad_id] = {
          package_id: pkg.id,
          tc_package_id: pkg.tc_package_id,
          title: pkg.title,
        }
      }
    }

    // Combine Meta data with local linkage
    const result = ads.map(ad => ({
      meta_ad_id: ad.id,
      ad_name: ad.name,
      status: ad.effective_status,
      campaign_name: ad.campaign_name,
      adset_name: ad.adset_name,
      spend: ad.spend,
      impressions: ad.impressions,
      clicks: ad.clicks,
      thumbnail_url: ad.thumbnail_url,
      linked: !!linkedMap[ad.id],
      package_id: linkedMap[ad.id]?.package_id || null,
      tc_package_id: linkedMap[ad.id]?.tc_package_id || null,
      package_title: linkedMap[ad.id]?.title || null,
    }))

    return NextResponse.json({
      ads: result,
      total: result.length,
      linked_count: result.filter(a => a.linked).length,
      unlinked_count: result.filter(a => !a.linked).length,
    })
  } catch (error) {
    console.error('[Active Ads] Error:', error)
    return errorResponse(error)
  }
}
