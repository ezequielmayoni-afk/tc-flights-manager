import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

/**
 * GET /api/meta/lookup?type=campaign&id=XXX
 * GET /api/meta/lookup?type=adset&id=XXX
 * Lookup campaign or adset details by ID from Meta API
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const id = request.nextUrl.searchParams.get('id')

  if (!type || !id) {
    return NextResponse.json(
      { error: 'type and id are required' },
      { status: 400 }
    )
  }

  if (type !== 'campaign' && type !== 'adset') {
    return NextResponse.json(
      { error: 'type must be "campaign" or "adset"' },
      { status: 400 }
    )
  }

  try {
    const metaClient = getMetaAdsClient()

    if (type === 'campaign') {
      const campaign = await metaClient.getCampaignById(id)
      if (!campaign) {
        return NextResponse.json(
          { error: 'Campaign not found', found: false },
          { status: 404 }
        )
      }
      return NextResponse.json({
        found: true,
        type: 'campaign',
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
      })
    } else {
      const adset = await metaClient.getAdSetById(id)
      if (!adset) {
        return NextResponse.json(
          { error: 'AdSet not found', found: false },
          { status: 404 }
        )
      }
      return NextResponse.json({
        found: true,
        type: 'adset',
        id: adset.id,
        name: adset.name,
        status: adset.status,
        campaign_id: adset.campaign_id,
      })
    }
  } catch (error) {
    console.error('[Meta Lookup] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error looking up', found: false },
      { status: 500 }
    )
  }
}
