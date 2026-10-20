import { gscSiteUrl } from '@/lib/gsc/client'
import { ideaIdFromUrl } from '@/lib/seo/page-types'
import { readPageStats } from '@/lib/seo/queries'
import { sumByPage } from '@/lib/seo/summary'
import { buildDriftMessage, findTitleDrift, type DriftCandidate } from '@/lib/seo/title-drift'
import { sendSlackMessage } from '@/lib/slack/client'
import { getPackageInfo, updatePackageTitle } from '@/lib/travelcompositor/client'
import { FLAGS, loadFlags } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Títulos con la temporada desfasada (Fase 14), una vez por día.
 *
 * Para cada paquete propio activo lee en TC la salida cargada hoy, el título y los
 * meta tags, y compara la etiqueta del título ("– Temporada baja 2026") con la que
 * corresponde a esa salida según la regla por destino. Guarda cada desfasaje en
 * `seo_title_drift` (una fila por paquete y título propuesto), aplica título y H1 por
 * API si `automation.seo_title_autoapply` está prendido (los meta tags sólo se cambian
 * por el backoffice) y avisa por Slack los nuevos. Las filas abiertas cuya ficha ya
 * tiene el título correcto se cierran solas.
 */
export const seoTitleDriftHandler: HandlerDefinition = {
  kind: 'seo.title_drift',
  lane: 'tc',
  description: 'SEO: detecta fichas cuyo título dice una temporada distinta de la salida cargada en TC y propone/aplica el título nuevo',
  handler: async ({ db, heartbeat, log }) => {
    const site = gscSiteUrl()
    const { data: pkgs, error } = await db.from('packages').select('tc_package_id').eq('tc_active', true)
    if (error) return { ok: false, error: `No se pudieron leer los paquetes: ${error.message}`, retry: true }
    const ids = Array.from(new Set(((pkgs ?? []) as Array<{ tc_package_id: number | null }>).map(p => Number(p.tc_package_id)).filter(n => Number.isFinite(n) && n > 0)))

    const porFicha = new Map<number, { impressions: number; clicks: number; url: string }>()
    for (const p of sumByPage(await readPageStats(db, site, 28))) {
      const id = ideaIdFromUrl(p.page)
      if (!id) continue
      const acc = porFicha.get(id) ?? { impressions: 0, clicks: 0, url: p.page }
      acc.impressions += p.impressions
      acc.clicks += p.clicks
      if (p.impressions > 0 && p.page.startsWith('https://www.')) acc.url = p.page
      porFicha.set(id, acc)
    }

    const candidates: DriftCandidate[] = []
    let leidos = 0
    let errores = 0
    for (const id of ids) {
      try {
        const info = await getPackageInfo(id)
        const extra = info as unknown as { metaTitle?: string | null; metaDescription?: string | null }
        const stats = porFicha.get(id)
        candidates.push({
          tcPackageId: id,
          title: String(info.title ?? ''),
          metaTitle: extra.metaTitle ?? null,
          metaDescription: extra.metaDescription ?? null,
          departureDate: info.departureDate ?? null,
          dateRangeEnd: info.dateSettings?.availRange?.end ?? null,
          destinations: (info.destinations ?? []).map(d => String((d as { name?: string }).name ?? '')).filter(Boolean),
          nights: Number(info.counters?.hotelNights ?? 7) || 7,
          impressions: stats?.impressions ?? 0,
          clicks: stats?.clicks ?? 0,
          url: stats?.url ?? null,
        })
      } catch {
        errores++
      }
      leidos++
      if (leidos % 10 === 0) await heartbeat()
    }

    const drifts = findTitleDrift(candidates)

    // Cerrar las abiertas cuya ficha ya no está desfasada (le cambiaron el título o la fecha).
    const vigentes = new Set(drifts.map(d => `${d.tcPackageId}:${d.expectedTitle}`))
    const { data: abiertas } = await db.from('seo_title_drift').select('id, tc_package_id, title_expected, status').in('status', ['pending', 'title_applied'])
    let resueltas = 0
    for (const a of (abiertas ?? []) as Array<{ id: number; tc_package_id: number; title_expected: string; status: string }>) {
      if (vigentes.has(`${a.tc_package_id}:${a.title_expected}`)) continue
      await db.from('seo_title_drift').update({ status: 'done', resolved_at: new Date().toISOString(), resolved_by: 'auto' }).eq('id', a.id)
      resueltas++
    }
    const existentes = new Set(((abiertas ?? []) as Array<{ tc_package_id: number; title_expected: string }>).map(a => `${a.tc_package_id}:${a.title_expected}`))
    const nuevas = drifts.filter(d => !existentes.has(`${d.tcPackageId}:${d.expectedTitle}`))

    const flags = await loadFlags(db)
    const autoapply = (flags.get(FLAGS.seoTitleAutoapply)?.enabled ?? false) && (flags.get(FLAGS.tcWrites)?.enabled ?? true)
    const applied = new Set<number>()
    for (const d of nuevas) {
      await db.from('seo_title_drift').upsert(
        {
          tc_package_id: d.tcPackageId, url: d.url, grupo: d.grupo, departure_date: d.departureDate, date_range_end: d.dateRangeEnd ?? null,
          title_before: d.title, title_expected: d.expectedTitle, meta_title_before: d.metaTitle ?? null, meta_title_expected: d.expectedMetaTitle,
          meta_desc_before: d.metaDescription ?? null, meta_desc_expected: d.expectedMetaDescription, impressions_28d: d.impressions, clicks_28d: d.clicks,
          status: 'pending', detected_at: new Date().toISOString(),
        },
        { onConflict: 'tc_package_id,title_expected', ignoreDuplicates: true }
      )
      if (!autoapply) continue
      const r = await updatePackageTitle(d.tcPackageId, d.expectedTitle)
      if (r.success) {
        applied.add(d.tcPackageId)
        await db.from('seo_title_drift').update({ status: 'title_applied', title_applied_at: new Date().toISOString() }).eq('tc_package_id', d.tcPackageId).eq('title_expected', d.expectedTitle)
      } else {
        await log(`seo.title_drift: no se pudo aplicar el título de ${d.tcPackageId}: ${r.error ?? '?'}`, { id: d.tcPackageId }, 'warning')
      }
    }

    let slack = 'sin aviso'
    if (nuevas.length > 0) {
      const { data: s } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url').eq('id', 1).maybeSingle()
      if (s?.slack_enabled && s.slack_webhook_url) {
        const r = await sendSlackMessage(s.slack_webhook_url, { text: buildDriftMessage(nuevas, applied) })
        slack = r.ok ? 'enviado' : `falló: ${r.error ?? '?'}`
      } else slack = 'Slack apagado'
    }

    const result = { paquetes: ids.length, leidos, errores, desfasados: drifts.length, nuevos: nuevas.length, aplicados: applied.size, resueltas, autoapply, slack }
    await log(`SEO temporadas: ${drifts.length} fichas con el título desfasado (${nuevas.length} nuevas, ${applied.size} aplicadas, ${resueltas} resueltas, aviso ${slack})`, result, nuevas.length > 0 ? 'warning' : 'info')
    return { ok: true, result }
  },
}
