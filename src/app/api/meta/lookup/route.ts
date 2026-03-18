import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

/**
 * GET /api/meta/lookup?type=campaign&id=XXX
 * GET /api/meta/lookup?type=adset&id=XXX
 * Lookup campaign or adset details by ID from local DB (meta_campaigns / meta_adsets)
 * Falls back to Meta API if not found locally, and saves the result for future use
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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
    const db = createAdminClient()

    if (type === 'campaign') {
      // Try Supabase first
      const { data: campaign } = await db
        .from('meta_campaigns')
        .select('meta_campaign_id, name, status, objective')
        .eq('meta_campaign_id', id)
        .maybeSingle()

      if (campaign) {
        return NextResponse.json({
          found: true,
          type: 'campaign',
          id: campaign.meta_campaign_id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
        })
      }

      // Fallback: fetch from Meta API
      try {
        const metaClient = getMetaAdsClient()
        const result = await metaClient.getCampaignById(id)
        if (result) {
          // Save to Supabase for future lookups
          await db
            .from('meta_campaigns')
            .upsert({
              meta_campaign_id: result.id,
              name: result.name,
              status: result.status,
              objective: result.objective,
              last_sync_at: new Date().toISOString(),
            }, { onConflict: 'meta_campaign_id' })

          return NextResponse.json({
            found: true,
            type: 'campaign',
            id: result.id,
            name: result.name,
            status: result.status,
            objective: result.objective,
          })
        }
      } catch (metaError) {
        console.error('[Meta Lookup] Meta API fallback error for campaign:', metaError)
      }

      return NextResponse.json({ error: 'Campaign not found', found: false }, { status: 404 })
    } else {
      // Try Supabase first
      const { data: adset } = await db
        .from('meta_adsets')
        .select('meta_adset_id, meta_campaign_id, name, status')
        .eq('meta_adset_id', id)
        .maybeSingle()

      if (adset) {
        return NextResponse.json({
          found: true,
          type: 'adset',
          id: adset.meta_adset_id,
          name: adset.name,
          status: adset.status,
          campaign_id: adset.meta_campaign_id,
        })
      }

      // Fallback: fetch from Meta API
      try {
        const metaClient = getMetaAdsClient()
        const result = await metaClient.getAdSetById(id)
        if (result) {
          // Ensure the referenced campaign exists
          if (result.campaign_id) {
            const { data: existingCampaign } = await db
              .from('meta_campaigns')
              .select('meta_campaign_id')
              .eq('meta_campaign_id', result.campaign_id)
              .maybeSingle()

            if (!existingCampaign) {
              // Fetch and save the campaign too
              const campaignResult = await metaClient.getCampaignById(result.campaign_id).catch(() => null)
              await db
                .from('meta_campaigns')
                .upsert({
                  meta_campaign_id: result.campaign_id,
                  name: campaignResult?.name || `Campaign ${result.campaign_id}`,
                  status: campaignResult?.status || 'UNKNOWN',
                  objective: campaignResult?.objective || null,
                  last_sync_at: new Date().toISOString(),
                }, { onConflict: 'meta_campaign_id' })
            }
          }

          // Save adset to Supabase
          await db
            .from('meta_adsets')
            .upsert({
              meta_adset_id: result.id,
              meta_campaign_id: result.campaign_id,
              name: result.name,
              status: result.status,
              last_sync_at: new Date().toISOString(),
            }, { onConflict: 'meta_adset_id' })

          return NextResponse.json({
            found: true,
            type: 'adset',
            id: result.id,
            name: result.name,
            status: result.status,
            campaign_id: result.campaign_id,
          })
        }
      } catch (metaError) {
        console.error('[Meta Lookup] Meta API fallback error for adset:', metaError)
      }

      return NextResponse.json({ error: 'AdSet not found', found: false }, { status: 404 })
    }
  } catch (error) {
    console.error('[Meta Lookup] Error:', error)
    return errorResponse(error)
  }
}
