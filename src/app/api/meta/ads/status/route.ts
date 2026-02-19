import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * PATCH /api/meta/ads/status
 * Toggle ad status (ACTIVE/PAUSED)
 */
export async function PATCH(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const body = await request.json()
    const { meta_ad_id, status } = body as {
      meta_ad_id: string
      status: 'ACTIVE' | 'PAUSED'
    }

    if (!meta_ad_id) {
      return new Response(JSON.stringify({ error: 'meta_ad_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!status || !['ACTIVE', 'PAUSED'].includes(status)) {
      return new Response(JSON.stringify({ error: 'status must be ACTIVE or PAUSED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Update in Meta
    const metaClient = getMetaAdsClient()
    await metaClient.updateAdStatus(meta_ad_id, status)

    // Update in database
    await db
      .from('meta_ads')
      .update({ status })
      .eq('meta_ad_id', meta_ad_id)

    return new Response(JSON.stringify({ success: true, status }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Meta Ads Status PATCH] Error:', error)
    return errorResponse(error)
  }
}

/**
 * POST /api/meta/ads/status/bulk
 * Toggle status for all ads of a package
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const body = await request.json()
    const { package_id, status } = body as {
      package_id: number
      status: 'ACTIVE' | 'PAUSED'
    }

    if (!package_id) {
      return new Response(JSON.stringify({ error: 'package_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!status || !['ACTIVE', 'PAUSED'].includes(status)) {
      return new Response(JSON.stringify({ error: 'status must be ACTIVE or PAUSED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get all ads for this package
    const { data: ads, error: adsError } = await db
      .from('meta_ads')
      .select('meta_ad_id')
      .eq('package_id', package_id)

    if (adsError) {
      throw adsError
    }

    if (!ads || ads.length === 0) {
      return new Response(JSON.stringify({ error: 'No ads found for this package' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Update each ad in Meta
    const metaClient = getMetaAdsClient()
    let successCount = 0
    let errorCount = 0

    for (const ad of ads) {
      try {
        await metaClient.updateAdStatus(ad.meta_ad_id, status)
        successCount++
      } catch (error) {
        console.error(`Error updating ad ${ad.meta_ad_id}:`, error)
        errorCount++
      }
    }

    // Update all in database
    await db
      .from('meta_ads')
      .update({ status })
      .eq('package_id', package_id)

    return new Response(JSON.stringify({
      success: true,
      status,
      updated: successCount,
      errors: errorCount,
      total: ads.length
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Meta Ads Status POST] Error:', error)
    return errorResponse(error)
  }
}
