import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * POST /api/packages/[id]/link-ad
 *
 * Vincula un Ad ID de Meta a una variante existente del paquete. Útil cuando
 * el mismo creativo está corriendo en otro adset/campaña creado fuera del
 * workflow normal — al linkearlo, futuros "Actualizar creativo" lo impactan.
 *
 * Body: { variant: number, meta_ad_id: string }
 *
 * Lookup en Meta: trae adset_id, campaign_id, creative_id, status, name.
 * Inserta una nueva fila en meta_ads con la variante dada.
 * Si la campaña no estaba en pkg.meta_campaign_ids, se appendea.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const pkgId = parseInt(id)
  if (!pkgId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: { variant?: number; meta_ad_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const variant = body.variant
  const adId = body.meta_ad_id?.trim()
  if (!variant || !adId) {
    return NextResponse.json({ error: 'variant y meta_ad_id requeridos' }, { status: 400 })
  }
  if (!/^\d+$/.test(adId)) {
    return NextResponse.json({ error: 'meta_ad_id debe ser numérico' }, { status: 400 })
  }

  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'META_ACCESS_TOKEN no configurado' }, { status: 500 })

  const db = createAdminClient()
  const { data: pkg } = await db
    .from('packages')
    .select('id, tc_package_id, meta_campaign_ids')
    .eq('id', pkgId)
    .maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'package not found' }, { status: 404 })

  // 1. Traer info del ad desde Meta
  let adInfo: {
    id: string
    name?: string
    status?: string
    effective_status?: string
    creative?: { id: string; thumbnail_url?: string }
    adset?: { id: string; name: string; campaign?: { id: string; name: string } }
    created_time?: string
  }
  try {
    const r = await fetch(
      `https://graph.facebook.com/v22.0/${adId}?fields=id,name,status,effective_status,creative{id,thumbnail_url},adset{id,name,campaign{id,name}},created_time&access_token=${token}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!r.ok) {
      const t = await r.text()
      return NextResponse.json({ error: `Meta ${r.status}: ${t.slice(0, 200)}` }, { status: 404 })
    }
    adInfo = await r.json()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const adsetId = adInfo.adset?.id
  const campaignId = adInfo.adset?.campaign?.id
  if (!adsetId) return NextResponse.json({ error: 'El ad no tiene adset asociado' }, { status: 400 })

  // 2. Si el ad ya existe en BD para este paquete, no duplicar
  const { data: existing } = await db
    .from('meta_ads')
    .select('id, variant, meta_adset_id')
    .eq('package_id', pkgId)
    .eq('meta_ad_id', adId)
    .maybeSingle()
  if (existing) {
    // Si ya está en otra variante, actualizar a la solicitada
    if (existing.variant !== variant) {
      await db.from('meta_ads').update({ variant }).eq('id', existing.id)
    }
    return NextResponse.json({
      ok: true,
      already_existed: true,
      ad_id_in_db: existing.id,
      variant,
      adset_id: adsetId,
      campaign_id: campaignId,
    })
  }

  // 3. Insertar fila en meta_ads
  const { data: inserted, error: insertErr } = await db
    .from('meta_ads')
    .insert({
      package_id: pkg.id,
      tc_package_id: pkg.tc_package_id,
      variant,
      meta_ad_id: adId,
      meta_adset_id: adsetId,
      meta_creative_id: adInfo.creative?.id || null,
      ad_name: adInfo.name || `ad_${adId}`,
      status: adInfo.status || 'ACTIVE',
      meta_status: adInfo.effective_status || adInfo.status || 'ACTIVE',
      thumbnail_url: adInfo.creative?.thumbnail_url || null,
      published_at: adInfo.created_time || new Date().toISOString(),
    })
    .select('id')
    .single()
  if (insertErr) {
    return NextResponse.json({ error: `insert: ${insertErr.message}` }, { status: 500 })
  }

  // 4. Agregar la campaña a meta_campaign_ids si no estaba
  if (campaignId) {
    const existingCampaigns = pkg.meta_campaign_ids || []
    if (!existingCampaigns.includes(campaignId)) {
      await db
        .from('packages')
        .update({ meta_campaign_ids: [...existingCampaigns, campaignId] })
        .eq('id', pkg.id)
    }
  }

  return NextResponse.json({
    ok: true,
    ad_id_in_db: inserted?.id,
    variant,
    adset_id: adsetId,
    adset_name: adInfo.adset?.name,
    campaign_id: campaignId,
    campaign_name: adInfo.adset?.campaign?.name,
    meta_ad_id: adId,
  })
}
