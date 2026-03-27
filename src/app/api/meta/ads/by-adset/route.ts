import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

/**
 * GET /api/meta/ads/by-adset?adset_id=XXX&package_id=YYY
 * Fetch all ads from Meta for a given adset and compare with our DB
 * Returns each ad with in_db flag, thumbnail, and copy preview
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const adsetId = request.nextUrl.searchParams.get('adset_id')
  const packageId = request.nextUrl.searchParams.get('package_id')

  if (!adsetId) {
    return NextResponse.json({ error: 'adset_id is required' }, { status: 400 })
  }

  try {
    const metaClient = getMetaAdsClient()
    const db = createAdminClient()

    // Fetch all ads from Meta for this adset (includes creative details)
    const metaAds = await metaClient.getAdsByAdSet(adsetId)

    // Fetch all ads in our DB (optionally filtered by package)
    let dbQuery = db
      .from('meta_ads')
      .select('meta_ad_id, package_id, status, ad_name, variant')

    if (packageId) {
      dbQuery = dbQuery.or(`package_id.eq.${packageId},meta_adset_id.eq.${adsetId}`)
    } else {
      dbQuery = dbQuery.eq('meta_adset_id', adsetId)
    }

    const { data: dbAds } = await dbQuery

    const dbAdIds = new Set((dbAds || []).map(a => a.meta_ad_id))
    const dbAdMap = new Map((dbAds || []).map(a => [a.meta_ad_id, a]))

    // Combine: mark each Meta ad with in_db flag + creative info
    const ads = metaAds.map(ad => {
      const dbRecord = dbAdMap.get(ad.id)
      return {
        meta_ad_id: ad.id,
        name: ad.name,
        status: ad.effective_status || ad.status,
        created_time: ad.created_time,
        in_db: dbAdIds.has(ad.id),
        db_package_id: dbRecord?.package_id || null,
        db_variant: dbRecord?.variant || null,
        thumbnail_url: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
        preview_text: ad.preview_text || null,
      }
    })

    return NextResponse.json({
      adset_id: adsetId,
      total_in_meta: metaAds.length,
      total_in_db: ads.filter(a => a.in_db).length,
      total_not_in_db: ads.filter(a => !a.in_db).length,
      ads,
    })
  } catch (error) {
    console.error('[Meta Ads By AdSet] Error:', error)
    return errorResponse(error)
  }
}
