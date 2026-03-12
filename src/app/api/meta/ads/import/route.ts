import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * POST /api/meta/ads/import
 * Import existing Meta ads manually and link them to a package
 *
 * Body: {
 *   package_id: number,
 *   meta_adset_id: string,
 *   meta_ad_ids: string[]   // Array of Meta ad IDs to import
 * }
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const body = await request.json()
    const { package_id, meta_adset_id, meta_ad_ids } = body as {
      package_id: number
      meta_adset_id: string
      meta_ad_ids: string[]
    }

    if (!package_id || !meta_adset_id || !meta_ad_ids?.length) {
      return NextResponse.json(
        { error: 'package_id, meta_adset_id, and meta_ad_ids are required' },
        { status: 400 }
      )
    }

    // Get package info
    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('id, tc_package_id')
      .eq('id', package_id)
      .single()

    if (pkgError || !pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    const metaClient = getMetaAdsClient()
    const imported: Array<{
      meta_ad_id: string
      ad_name: string
      status: string
      thumbnail_url: string | null
    }> = []
    const errors: Array<{ meta_ad_id: string; error: string }> = []

    for (const metaAdId of meta_ad_ids) {
      try {
        // Fetch ad details from Meta (include creative for thumbnail)
        const adData = await metaClient.getAdWithCreative(metaAdId)

        if (!adData) {
          errors.push({ meta_ad_id: metaAdId, error: 'Ad not found in Meta' })
          continue
        }

        const thumbnailUrl = adData.thumbnail_url

        // Check if ad already exists in our DB
        const { data: existing } = await db
          .from('meta_ads')
          .select('id')
          .eq('meta_ad_id', metaAdId)
          .maybeSingle()

        if (existing) {
          // Update existing record to link to this package
          await db
            .from('meta_ads')
            .update({
              package_id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              meta_adset_id: meta_adset_id,
              status: adData.effective_status || adData.status,
              ad_name: adData.name,
              thumbnail_url: thumbnailUrl,
            })
            .eq('id', existing.id)
        } else {
          // Determine variant number (auto-increment based on existing ads)
          const { count: existingCount } = await db
            .from('meta_ads')
            .select('*', { count: 'exact', head: true })
            .eq('package_id', pkg.id)

          const variant = (existingCount || 0) + 1

          await db
            .from('meta_ads')
            .insert({
              package_id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              variant,
              meta_ad_id: metaAdId,
              meta_adset_id: meta_adset_id,
              ad_name: adData.name,
              status: adData.effective_status || adData.status,
              thumbnail_url: thumbnailUrl,
              published_at: new Date().toISOString(),
            })
        }

        imported.push({
          meta_ad_id: metaAdId,
          ad_name: adData.name,
          status: adData.effective_status || adData.status,
          thumbnail_url: thumbnailUrl,
        })
      } catch (error) {
        console.error(`[Ad Import] Error importing ad ${metaAdId}:`, error)
        errors.push({
          meta_ad_id: metaAdId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Update package counts
    const { count: totalCount } = await db
      .from('meta_ads')
      .select('*', { count: 'exact', head: true })
      .eq('package_id', pkg.id)
      .neq('status', 'DELETED')

    const { count: activeCount } = await db
      .from('meta_ads')
      .select('*', { count: 'exact', head: true })
      .eq('package_id', pkg.id)
      .eq('status', 'ACTIVE')

    await db
      .from('packages')
      .update({
        ads_created_count: totalCount || 0,
        ads_active_count: activeCount || 0,
        marketing_status: (activeCount || 0) > 0 ? 'active' : 'paused',
      })
      .eq('id', pkg.id)

    return NextResponse.json({
      success: true,
      imported,
      errors,
      ads_created_count: totalCount || 0,
      ads_active_count: activeCount || 0,
    })
  } catch (error) {
    console.error('[Ad Import] Error:', error)
    return errorResponse(error)
  }
}
