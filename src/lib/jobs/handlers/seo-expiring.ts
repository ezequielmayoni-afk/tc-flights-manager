import { gscSiteUrl } from '@/lib/gsc/client'
import { buildExpiringMessage, findExpiring, type ExpiringCandidate } from '@/lib/seo/expiring'
import { ideaIdFromUrl } from '@/lib/seo/page-types'
import { readPageStats } from '@/lib/seo/queries'
import { sumByPage } from '@/lib/seo/summary'
import { sendSlackMessage } from '@/lib/slack/client'
import { addDays } from '@/lib/vuelos-baratos/date-pairs'
import type { HandlerDefinition } from '../types'

/** Avisar con una semana: alcanza para cargar la próxima salida o pasar a sistema. */
const DAYS_AHEAD = 7
/** Menos de esto en 28 días no vale un aviso. */
const MIN_IMPRESSIONS = 20

/**
 * Fichas con tráfico orgánico que vencen (Fase 14), una vez por día.
 *
 * Cruza los paquetes propios activos en TC (tabla `packages`) con las
 * impresiones de Search Console de los últimos 28 días (`gsc_page_stats`,
 * sumadas por ficha), guarda una alerta por (paquete, salida) en
 * `seo_expiring_alerts` y avisa por Slack sólo las nuevas. Las alertas
 * abiertas cuya salida ya se corrió se cierran solas.
 */
export const seoExpiringHandler: HandlerDefinition = {
  kind: 'seo.expiring',
  lane: 'default',
  description: 'SEO: avisa las fichas con tráfico en Google cuya salida vence en 7 días o ya venció (nunca desactivar: es un 404)',
  handler: async ({ db, log }) => {
    const today = new Date().toISOString().slice(0, 10)
    const site = gscSiteUrl()

    const { data: pkgs, error } = await db
      .from('packages')
      .select('id, tc_package_id, title, departure_date, date_range_end, tc_active')
      .eq('tc_active', true)
    if (error) return { ok: false, error: `No se pudieron leer los paquetes: ${error.message}`, retry: true }

    // Impresiones por ficha (una ficha puede aparecer con varios slugs/hosts).
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

    const candidates: ExpiringCandidate[] = ((pkgs ?? []) as Array<Record<string, unknown>>).map(p => {
      const tcId = Number(p.tc_package_id)
      const t = porFicha.get(tcId)
      return {
        tcPackageId: tcId,
        packageId: Number(p.id) || null,
        title: String(p.title ?? ''),
        departureDate: (p.departure_date as string | null) ?? null,
        dateRangeEnd: (p.date_range_end as string | null) ?? null,
        tcActive: p.tc_active === true,
        impressions: t?.impressions ?? 0,
        clicks: t?.clicks ?? 0,
        url: t?.url ?? null,
      }
    })

    const alerts = findExpiring(candidates, { today, daysAhead: DAYS_AHEAD, minImpressions: MIN_IMPRESSIONS })

    // Cerrar las abiertas cuya salida ya no vence (le cargaron otra fecha).
    const vigentes = new Set(alerts.map(a => `${a.tcPackageId}:${a.lastDate}`))
    const { data: abiertas } = await db.from('seo_expiring_alerts').select('id, tc_package_id, departure_date').eq('status', 'open')
    let resueltas = 0
    for (const a of (abiertas ?? []) as Array<{ id: number; tc_package_id: number; departure_date: string }>) {
      if (vigentes.has(`${a.tc_package_id}:${a.departure_date}`)) continue
      await db.from('seo_expiring_alerts').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: 'auto' }).eq('id', a.id)
      resueltas++
    }

    // Guardar las nuevas (la clave única evita repetir el aviso por la misma salida).
    const existentes = new Set(((abiertas ?? []) as Array<{ tc_package_id: number; departure_date: string }>).map(a => `${a.tc_package_id}:${a.departure_date}`))
    const nuevas = alerts.filter(a => !existentes.has(`${a.tcPackageId}:${a.lastDate}`))
    for (const a of nuevas) {
      await db.from('seo_expiring_alerts').upsert(
        { tc_package_id: a.tcPackageId, package_id: a.packageId, title: a.title, url: a.url, departure_date: a.lastDate, impressions_28d: a.impressions, clicks_28d: a.clicks, status: 'open', alerted_at: new Date().toISOString() },
        { onConflict: 'tc_package_id,departure_date', ignoreDuplicates: true }
      )
    }

    let slack = 'sin aviso'
    if (nuevas.length > 0) {
      const { data: s } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url').eq('id', 1).maybeSingle()
      if (s?.slack_enabled && s.slack_webhook_url) {
        const r = await sendSlackMessage(s.slack_webhook_url, { text: buildExpiringMessage(nuevas) })
        slack = r.ok ? 'enviado' : `falló: ${r.error ?? '?'}`
      } else slack = 'Slack apagado'
    }

    const result = { today, candidates: candidates.length, alerts: alerts.length, nuevas: nuevas.length, resueltas, slack, limite: addDays(today, DAYS_AHEAD) }
    await log(`SEO vencimientos: ${alerts.length} fichas con tráfico por vencer o vencidas (${nuevas.length} nuevas, aviso ${slack}), ${resueltas} resueltas`, result, nuevas.length > 0 ? 'warning' : 'info')
    return { ok: true, result }
  },
}
