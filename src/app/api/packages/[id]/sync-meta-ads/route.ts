import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * POST /api/packages/[id]/sync-meta-ads
 *
 * Backfill: para cada campaign en pkg.meta_campaign_ids, lee los adsets + ads desde
 * Meta API y los inserta en la tabla meta_ads (si no existen ya).
 *
 * Útil para "rescatar" ads creados en Meta pero que no quedaron registrados en BD
 * (típicamente por bugs viejos en el endpoint duplicate).
 *
 * Output:
 * {
 *   synced: 5,                    // ads insertados
 *   skipped_existing: 3,          // ya estaban en BD
 *   campaigns_scanned: 4,
 *   errors: [{ campaign_id, error }]
 * }
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const pkgId = parseInt(id)
  if (!pkgId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const db = createAdminClient()
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'META_ACCESS_TOKEN no configurado' }, { status: 500 })

  const { data: pkg } = await db
    .from('packages')
    .select('id, tc_package_id, title, meta_campaign_ids')
    .eq('id', pkgId)
    .maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'package not found' }, { status: 404 })

  const campaignIds: string[] = (pkg.meta_campaign_ids || []).filter(Boolean)
  if (campaignIds.length === 0) {
    return NextResponse.json({ synced: 0, skipped_existing: 0, campaigns_scanned: 0, errors: [], message: 'Sin campañas en meta_campaign_ids' })
  }

  // Cargar TODOS los ads del package para:
  //   - evitar insertar duplicados por meta_ad_id
  //   - mapear meta_creative_id → variant (cloned ads comparten variante con el original)
  const { data: existingAdsRaw } = await db
    .from('meta_ads')
    .select('id, meta_ad_id, meta_creative_id, variant, meta_adset_id')
    .eq('package_id', pkgId)
    .limit(10000)
  const existingAds = existingAdsRaw || []

  // BACKFILL: si hay filas con meta_ad_id pero sin meta_creative_id, traerlo de Meta.
  // Sin esto, el dedup no puede emparejar originales (sin creative_id) con clones.
  const adsToBackfill = existingAds.filter((a) => a.meta_ad_id && !a.meta_creative_id)
  let backfilled = 0
  if (adsToBackfill.length > 0) {
    const batchSize = 10
    for (let i = 0; i < adsToBackfill.length; i += batchSize) {
      const batch = adsToBackfill.slice(i, i + batchSize)
      await Promise.all(batch.map(async (row) => {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v22.0/${row.meta_ad_id}?fields=creative{id}&access_token=${token}`,
            { signal: AbortSignal.timeout(8000) },
          )
          if (!r.ok) return
          const data = await r.json() as { creative?: { id: string } }
          if (data.creative?.id) {
            await db.from('meta_ads').update({ meta_creative_id: data.creative.id }).eq('id', row.id)
            row.meta_creative_id = data.creative.id
            backfilled++
          }
        } catch { /* ignore */ }
      }))
    }
  }
  const existingAdIds = new Set(existingAds.map((a) => a.meta_ad_id).filter(Boolean))
  const creativeToVariant = new Map<string, number>()
  let maxVariant = 0
  for (const row of existingAds) {
    if (row.meta_creative_id && !creativeToVariant.has(row.meta_creative_id)) {
      creativeToVariant.set(row.meta_creative_id, row.variant)
    }
    if (row.variant > maxVariant) maxVariant = row.variant
  }
  let nextNewVariant = maxVariant + 1

  // Cleanup: normalizar variantes. Filas que comparten meta_creative_id deben tener
  // el mismo variant (la variante 1..N representa la creatividad, no el ad).
  // Para cada creative_id, encontrar el variant más bajo y actualizar los demás.
  let cleanedDuplicates = 0
  const byCreative = new Map<string, Array<{ id: number; variant: number; meta_adset_id: string }>>()
  for (const row of existingAds) {
    if (!row.meta_creative_id) continue
    if (!byCreative.has(row.meta_creative_id)) byCreative.set(row.meta_creative_id, [])
    byCreative.get(row.meta_creative_id)!.push({ id: row.id, variant: row.variant, meta_adset_id: row.meta_adset_id })
  }
  for (const [, rows] of byCreative) {
    if (rows.length < 2) continue
    rows.sort((a, b) => a.variant - b.variant)
    const target = rows[0].variant
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].variant === target) continue
      const { error: updErr } = await db.from('meta_ads').update({ variant: target }).eq('id', rows[i].id)
      if (!updErr) cleanedDuplicates++
      else console.warn('[sync-meta-ads] variant update conflict', updErr)
    }
  }
  // Refrescar el mapa creativeToVariant después del cleanup
  creativeToVariant.clear()
  for (const row of existingAds) {
    if (row.meta_creative_id && !creativeToVariant.has(row.meta_creative_id)) {
      const updated = byCreative.get(row.meta_creative_id)
      creativeToVariant.set(row.meta_creative_id, updated ? updated[0].variant : row.variant)
    }
  }

  let synced = 0
  let skippedExisting = 0
  const errors: Array<{ campaign_id: string; error: string }> = []

  for (const campaignId of campaignIds) {
    try {
      // 1. Listar adsets de la campaign (activos + pausados)
      const adsetsResp = await fetch(
        `https://graph.facebook.com/v22.0/${campaignId}/adsets?fields=id,name,effective_status&limit=100&access_token=${token}`,
        { signal: AbortSignal.timeout(15_000) },
      )
      if (!adsetsResp.ok) {
        errors.push({ campaign_id: campaignId, error: `adsets ${adsetsResp.status}: ${(await adsetsResp.text()).slice(0, 150)}` })
        continue
      }
      const adsetsData = await adsetsResp.json() as { data: Array<{ id: string; name: string }> }

      for (const adset of adsetsData.data || []) {
        // 2. Listar ads del adset
        const adsResp = await fetch(
          `https://graph.facebook.com/v22.0/${adset.id}/ads?fields=id,name,status,effective_status,creative{id,thumbnail_url},created_time&limit=100&access_token=${token}`,
          { signal: AbortSignal.timeout(15_000) },
        )
        if (!adsResp.ok) continue
        const adsData = await adsResp.json() as {
          data: Array<{
            id: string
            name: string
            status: string
            effective_status?: string
            creative?: { id: string; thumbnail_url?: string }
            created_time?: string
          }>
        }

        for (const ad of adsData.data || []) {
          if (existingAdIds.has(ad.id)) {
            skippedExisting++
            continue
          }
          // Skip deleted/archived
          if (ad.status === 'DELETED' || ad.status === 'ARCHIVED') continue

          // Reusar variante existente si el creative_id ya está en BD
          const metaCreativeId = ad.creative?.id
          let variantToUse: number | undefined = metaCreativeId ? creativeToVariant.get(metaCreativeId) : undefined
          if (variantToUse === undefined) {
            variantToUse = nextNewVariant > 20 ? ((nextNewVariant - 1) % 20) + 1 : nextNewVariant
            nextNewVariant++
            if (metaCreativeId) creativeToVariant.set(metaCreativeId, variantToUse)
          }

          const { error: insertErr } = await db.from('meta_ads').insert({
            package_id: pkg.id,
            tc_package_id: pkg.tc_package_id,
            variant: variantToUse,
            meta_ad_id: ad.id,
            meta_adset_id: adset.id,
            meta_creative_id: ad.creative?.id || null,
            ad_name: ad.name || `ad_${ad.id}`,
            status: ad.status,
            meta_status: ad.effective_status || ad.status,
            thumbnail_url: ad.creative?.thumbnail_url || null,
            published_at: ad.created_time || new Date().toISOString(),
          })
          if (insertErr) {
            errors.push({ campaign_id: campaignId, error: `insert ${ad.id}: ${insertErr.message}` })
          } else {
            synced++
            existingAdIds.add(ad.id)
          }
        }
      }
    } catch (e) {
      errors.push({ campaign_id: campaignId, error: (e as Error).message })
    }
  }

  return NextResponse.json({
    synced,
    skipped_existing: skippedExisting,
    cleaned_duplicates: cleanedDuplicates,
    backfilled_creative_ids: backfilled,
    campaigns_scanned: campaignIds.length,
    errors,
  })
}
