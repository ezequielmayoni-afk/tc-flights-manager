import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * GET /api/packages/[id]/meta-ads
 *
 * Lista los ads activos del package agrupados por campaign + adset.
 * Útil para:
 *   - Mostrar "Este paquete está en 3 campañas" en /packages/marketing
 *   - El modal de "Replicar" para elegir cuáles ads source replicar
 *
 * Output:
 * {
 *   package_id: 49,
 *   total_ads: 6,
 *   campaigns: [
 *     {
 *       campaign_id: "120239...",
 *       campaign_name: "Caribe Test 2026",
 *       adsets: [
 *         { adset_id, ads: [{ ad_id, name, status, creative_id, thumbnail_url }] }
 *       ]
 *     }
 *   ]
 * }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const pkgId = parseInt(id)
  if (!pkgId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const db = createAdminClient()
  const { data: ads } = await db
    .from('meta_ads')
    .select('meta_ad_id, ad_name, meta_adset_id, meta_creative_id, status, meta_status, thumbnail_url, published_at')
    .eq('package_id', pkgId)
    .neq('status', 'DELETED')
    .order('published_at', { ascending: false })

  if (!ads || ads.length === 0) {
    return NextResponse.json({ package_id: pkgId, total_ads: 0, campaigns: [] })
  }

  // Enriquecer con campaign_id/name desde Meta (cached). Por ahora hacemos llamadas raw
  // para evitar dependencia en client + budget de quota; cacheo via Meta-side TTL.
  const token = process.env.META_ACCESS_TOKEN!
  const adsetCache = new Map<string, { campaign_id: string; campaign_name: string; adset_name: string }>()

  for (const ad of ads) {
    if (!ad.meta_adset_id || adsetCache.has(ad.meta_adset_id)) continue
    try {
      const r = await fetch(
        `https://graph.facebook.com/v22.0/${ad.meta_adset_id}?fields=name,campaign{id,name}&access_token=${token}`,
        { signal: AbortSignal.timeout(8000) },
      )
      const data = await r.json() as { name?: string; campaign?: { id: string; name: string } }
      if (data.campaign) {
        adsetCache.set(ad.meta_adset_id, {
          campaign_id: data.campaign.id,
          campaign_name: data.campaign.name,
          adset_name: data.name || ad.meta_adset_id,
        })
      }
    } catch { /* ignorar */ }
  }

  // Agrupar
  type CampaignGroup = {
    campaign_id: string
    campaign_name: string
    adsets: Map<string, { adset_id: string; adset_name: string; ads: Array<{ ad_id: string; name: string; status: string; creative_id: string | null; thumbnail_url: string | null }> }>
  }
  const byCampaign = new Map<string, CampaignGroup>()

  for (const ad of ads) {
    const adsetMeta = ad.meta_adset_id ? adsetCache.get(ad.meta_adset_id) : null
    const campaignId = adsetMeta?.campaign_id || 'unknown'
    const campaignName = adsetMeta?.campaign_name || '(campaña no encontrada)'
    const adsetName = adsetMeta?.adset_name || ad.meta_adset_id || '(adset desconocido)'

    if (!byCampaign.has(campaignId)) {
      byCampaign.set(campaignId, { campaign_id: campaignId, campaign_name: campaignName, adsets: new Map() })
    }
    const grp = byCampaign.get(campaignId)!
    if (!grp.adsets.has(ad.meta_adset_id || 'unknown')) {
      grp.adsets.set(ad.meta_adset_id || 'unknown', { adset_id: ad.meta_adset_id || '', adset_name: adsetName, ads: [] })
    }
    grp.adsets.get(ad.meta_adset_id || 'unknown')!.ads.push({
      ad_id: ad.meta_ad_id,
      name: ad.ad_name || '',
      status: ad.meta_status || ad.status || '',
      creative_id: ad.meta_creative_id,
      thumbnail_url: ad.thumbnail_url,
    })
  }

  return NextResponse.json({
    package_id: pkgId,
    total_ads: ads.length,
    campaigns: Array.from(byCampaign.values()).map((g) => ({
      campaign_id: g.campaign_id,
      campaign_name: g.campaign_name,
      adsets: Array.from(g.adsets.values()),
    })),
  })
}
