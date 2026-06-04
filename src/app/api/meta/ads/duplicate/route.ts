import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

/**
 * POST /api/meta/ads/duplicate
 *
 * Replica ads existentes en múltiples ad sets, reusando los creatives originales
 * (Estrategia A: 1 creative → N ads en N ad sets). Es la base del A/B testing
 * por audiencias / campañas paralelas.
 *
 * Input:
 * {
 *   package_id: 49,
 *   source_ad_ids: ["120239...", "120240..."],     // ads existentes a clonar
 *   target_adset_ids: ["120150...", "120151..."],  // ad sets destino
 *   status: "ACTIVE" | "PAUSED",                   // estado inicial (default ACTIVE)
 *   ad_account_id?: "act_271148251050653"          // override account (opcional)
 * }
 *
 * Output (SSE stream):
 *   data: {"type":"start","total":6}
 *   data: {"type":"progress","step":1,"total":6,"adset_id":"...","source_ad_id":"...","new_ad_id":"...","ok":true}
 *   data: {"type":"progress","step":2,"total":6,"ok":false,"error":"..."}
 *   ...
 *   data: {"type":"done","success":5,"failed":1,"campaign_ids":["..."]}
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body: {
    package_id: number
    source_ad_ids: string[]
    target_adset_ids: string[]
    status?: 'ACTIVE' | 'PAUSED'
    ad_account_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { package_id, source_ad_ids, target_adset_ids, status = 'ACTIVE', ad_account_id } = body
  if (!package_id || !Array.isArray(source_ad_ids) || !Array.isArray(target_adset_ids)) {
    return NextResponse.json({ error: 'package_id + source_ad_ids[] + target_adset_ids[] requeridos' }, { status: 400 })
  }
  if (source_ad_ids.length === 0 || target_adset_ids.length === 0) {
    return NextResponse.json({ error: 'Listas vacías' }, { status: 400 })
  }

  const db = createAdminClient()

  // Validar package
  const { data: pkg } = await db
    .from('packages')
    .select('id, tc_package_id, title, meta_campaign_ids')
    .eq('id', package_id)
    .maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'package not found' }, { status: 404 })

  const client = getMetaAdsClient(ad_account_id)

  // SSE response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const total = source_ad_ids.length * target_adset_ids.length
      send({ type: 'start', total, package_title: pkg.title })

      let step = 0
      let success = 0
      let failed = 0
      const newCampaignIds = new Set<string>()
      const newAdsetIds = new Set<string>()

      // 1. Pre-cargar creative_id y nombre de cada source ad usando Graph API raw
      // (el client no expone creative_id directamente; lo pedimos como `creative{id}`)
      const token = process.env.META_ACCESS_TOKEN!
      const sourceAds = new Map<string, { creative_id: string; name: string }>()
      for (const sourceAdId of source_ad_ids) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v22.0/${sourceAdId}?fields=id,name,creative{id}&access_token=${token}`,
            { signal: AbortSignal.timeout(15_000) },
          )
          const data = await r.json() as { id?: string; name?: string; creative?: { id: string }; error?: { message: string } }
          if (data.error || !data.creative?.id) {
            send({ type: 'warning', source_ad_id: sourceAdId, message: data.error?.message || 'Ad sin creative_id' })
            continue
          }
          sourceAds.set(sourceAdId, { creative_id: data.creative.id, name: data.name || `ad_${sourceAdId}` })
        } catch (e) {
          send({ type: 'warning', source_ad_id: sourceAdId, message: `getAd falló: ${(e as Error).message}` })
        }
      }

      // Mapas para asignar variant correctamente al clonar:
      //   - sourceAdIdToVariant: usa el variant del SOURCE AD en BD (más confiable,
      //     funciona aún cuando Meta genera nuevo creative_id en otra ad account).
      //   - creativeToVariant: fallback por meta_creative_id (cuando el source ad
      //     no está en BD pero ya hay un ad con ese creative_id).
      const { data: existingForVariantMap } = await db
        .from('meta_ads')
        .select('variant, meta_creative_id, meta_ad_id')
        .eq('package_id', pkg.id)
        .limit(10000)
      const sourceAdIdToVariant = new Map<string, number>()
      const creativeToVariant = new Map<string, number>()
      let maxVariant = 0
      for (const row of existingForVariantMap || []) {
        if (row.meta_ad_id) sourceAdIdToVariant.set(row.meta_ad_id, row.variant)
        if (row.meta_creative_id && !creativeToVariant.has(row.meta_creative_id)) {
          creativeToVariant.set(row.meta_creative_id, row.variant)
        }
        if (row.variant > maxVariant) maxVariant = row.variant
      }
      let nextNewVariant = maxVariant + 1

      // 2. Loop por cada combinación target × source
      for (const targetAdsetId of target_adset_ids) {
        // Resolver campaign_id del adset (para tracking)
        let targetCampaignId: string | null = null
        try {
          const adset = await client.getAdSetById(targetAdsetId)
          if (adset) {
            targetCampaignId = adset.campaign_id
            newAdsetIds.add(targetAdsetId)
            if (targetCampaignId) newCampaignIds.add(targetCampaignId)
          }
        } catch {
          /* no es crítico, seguimos */
        }

        for (const sourceAdId of source_ad_ids) {
          step++
          const src = sourceAds.get(sourceAdId)
          if (!src) {
            failed++
            send({ type: 'progress', step, total, ok: false, source_ad_id: sourceAdId, adset_id: targetAdsetId, error: 'source ad sin creative' })
            continue
          }
          try {
            const newName = `${src.name} (copia ${new Date().toISOString().slice(0, 10)})`
            const newAdId = await client.createAdFromCreative({
              name: newName,
              adsetId: targetAdsetId,
              creativeId: src.creative_id,
              status,
            })
            // Reutilizar variant del SOURCE AD (más confiable) o del creative_id (fallback).
            // Esto asegura que clones cross-account (donde Meta genera nuevos creative_ids)
            // hereden el variant del original en vez de inflar el contador a V6/V7/V8.
            let variantToUse = sourceAdIdToVariant.get(sourceAdId) || creativeToVariant.get(src.creative_id)
            if (variantToUse === undefined) {
              variantToUse = nextNewVariant > 20 ? ((nextNewVariant - 1) % 20) + 1 : nextNewVariant
              nextNewVariant++
              creativeToVariant.set(src.creative_id, variantToUse)
            }
            const { error: insertErr } = await db.from('meta_ads').insert({
              package_id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              variant: variantToUse,
              meta_ad_id: newAdId,
              meta_adset_id: targetAdsetId,
              meta_creative_id: src.creative_id,
              ad_name: newName,
              status: status,
              meta_status: status,
              published_at: new Date().toISOString(),
            })
            if (insertErr) {
              console.error('[duplicate] meta_ads insert error:', insertErr, { newAdId, targetAdsetId, variantToUse })
              send({ type: 'warning', source_ad_id: sourceAdId, new_ad_id: newAdId, message: `Ad creado en Meta pero no guardado en BD: ${insertErr.message}` })
            }
            success++
            send({
              type: 'progress',
              step,
              total,
              ok: true,
              source_ad_id: sourceAdId,
              adset_id: targetAdsetId,
              campaign_id: targetCampaignId,
              new_ad_id: newAdId,
            })
          } catch (e) {
            failed++
            send({
              type: 'progress',
              step,
              total,
              ok: false,
              source_ad_id: sourceAdId,
              adset_id: targetAdsetId,
              error: (e as Error).message,
            })
          }
        }
      }

      // 3. Update package.meta_campaign_ids y meta_adset_ids
      try {
        const existingCampaigns: string[] = pkg.meta_campaign_ids || []
        const mergedCampaigns = Array.from(new Set([...existingCampaigns, ...newCampaignIds]))
        await db
          .from('packages')
          .update({ meta_campaign_ids: mergedCampaigns })
          .eq('id', pkg.id)
      } catch (e) {
        send({ type: 'warning', message: `No pude actualizar meta_campaign_ids: ${(e as Error).message}` })
      }

      send({
        type: 'done',
        success,
        failed,
        campaign_ids: Array.from(newCampaignIds),
        adset_ids: Array.from(newAdsetIds),
      })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
