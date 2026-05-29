import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'

/**
 * GET /api/meta/validate-target?campaign_id=X&adset_id=Y
 *
 * Valida que un par (campaign_id, adset_id) existe en Meta y que el adset
 * pertenece a esa campaign. Usado por DuplicateAdsModal antes de replicar.
 *
 * Respuesta:
 *   200 { campaign_name, campaign_status, adset_name, adset_status, warning? }
 *   400 { error } — IDs invÃ¡lidos o adset no pertenece a campaign
 *   404 { error } — no encontrado
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const campaignIdParam = request.nextUrl.searchParams.get('campaign_id')?.trim()
  const adsetId = request.nextUrl.searchParams.get('adset_id')?.trim()

  if (!adsetId) {
    return NextResponse.json({ error: 'adset_id requerido' }, { status: 400 })
  }
  if (!/^\d+$/.test(adsetId)) {
    return NextResponse.json({ error: 'adset_id debe ser numérico' }, { status: 400 })
  }
  if (campaignIdParam && !/^\d+$/.test(campaignIdParam)) {
    return NextResponse.json({ error: 'campaign_id debe ser numérico' }, { status: 400 })
  }

  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'META_ACCESS_TOKEN no configurado' }, { status: 500 })

  try {
    const adsetResp = await fetch(
      `https://graph.facebook.com/v22.0/${adsetId}?fields=name,status,effective_status,campaign{id,name,status}&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) },
    )

    if (!adsetResp.ok) {
      const t = await adsetResp.text()
      return NextResponse.json(
        { error: `Ad Set ${adsetId} no encontrado: ${t.slice(0, 150)}` },
        { status: 404 },
      )
    }

    const adset = await adsetResp.json() as {
      name: string
      status: string
      effective_status?: string
      campaign?: { id: string; name: string; status: string }
    }

    if (!adset.campaign) {
      return NextResponse.json(
        { error: `Ad Set ${adsetId} no tiene campaign asociada` },
        { status: 400 },
      )
    }

    // Si el user pasó campaign_id, verificar que coincida
    if (campaignIdParam && adset.campaign.id !== campaignIdParam) {
      return NextResponse.json(
        {
          error: `El ad set pertenece a "${adset.campaign.name}" (${adset.campaign.id}), no a ${campaignIdParam}`,
        },
        { status: 400 },
      )
    }

    const warnings: string[] = []
    if (adset.campaign.status === 'DELETED' || adset.campaign.status === 'ARCHIVED') {
      warnings.push(`Campaign está ${adset.campaign.status}`)
    }
    if (adset.status === 'DELETED' || adset.status === 'ARCHIVED') {
      warnings.push(`Ad Set está ${adset.status}`)
    }

    return NextResponse.json({
      campaign_id: adset.campaign.id,
      campaign_name: adset.campaign.name,
      campaign_status: adset.campaign.status,
      adset_id: adsetId,
      adset_name: adset.name,
      adset_status: adset.status,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
