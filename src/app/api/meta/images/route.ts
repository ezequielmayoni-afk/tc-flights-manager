import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

const META_API_VERSION = 'v21.0'
const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * GET /api/meta/images
 * List all images uploaded to the Meta Ad Account
 */
export async function GET() {
  const accessToken = process.env.META_ACCESS_TOKEN!
  const adAccountId = process.env.META_AD_ACCOUNT_ID!

  // Ensure ad account ID has 'act_' prefix
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

  try {
    const url = `${META_API_BASE_URL}/${accountId}/adimages?fields=hash,name,url,created_time&limit=50&access_token=${accessToken}`

    const response = await fetch(url)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'Error fetching images')
    }

    const data = await response.json()

    return NextResponse.json({
      images: data.data || [],
      account_id: accountId,
    })
  } catch (error) {
    console.error('[Meta Images] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching images' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/meta/images
 * Get image URLs from Meta by their hashes and/or video thumbnails by their IDs
 *
 * Body: { hashes?: string[], videoIds?: string[] }
 * Returns: { urls: Record<string, string>, videoUrls: Record<string, string> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hashes, videoIds } = body as { hashes?: string[]; videoIds?: string[] }

    if ((!hashes || hashes.length === 0) && (!videoIds || videoIds.length === 0)) {
      return NextResponse.json({ error: 'hashes or videoIds array is required' }, { status: 400 })
    }

    const metaClient = getMetaAdsClient()

    // Fetch image URLs and video thumbnails in parallel
    const [urls, videoUrls] = await Promise.all([
      hashes && hashes.length > 0 ? metaClient.getImageUrls(hashes) : {},
      videoIds && videoIds.length > 0 ? metaClient.getVideoThumbnails(videoIds) : {},
    ])

    return NextResponse.json({ urls, videoUrls })
  } catch (error) {
    console.error('[Meta Images POST] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching media URLs' },
      { status: 500 }
    )
  }
}
