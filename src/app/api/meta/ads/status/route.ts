import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * PATCH /api/meta/ads/status
 * Toggle ad status (ACTIVE/PAUSED)
 */
export async function PATCH(request: NextRequest) {
  const db = getSupabaseClient()

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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error updating ad status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /api/meta/ads/status/bulk
 * Toggle status for all ads of a package
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error updating ads status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
