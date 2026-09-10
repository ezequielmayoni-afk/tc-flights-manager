import { evaluatePackage, type GuardAd, type GuardDecision, type GuardInsights, type GuardInput, type GuardLink, type GuardPackage, type GuardSettings, type GuardSibling } from './rules'
import { applyDecision } from './apply'
import { loadPackageLinks, type PackageLink } from '@/lib/cupos/links'
import { getIntegrationStatus, setIntegrationStatus } from '@/lib/jobs/integrations'
import { checkMetaHealth } from '@/lib/meta-ads/health'
import { isoWeekLabel } from '@/lib/tendencias/config'
import type { Db } from '@/lib/jobs/types'

/**
 * Corre el guard sobre los paquetes con anuncios activos: arma la entrada de
 * cada uno, aplica las reglas, persiste las decisiones nuevas y, según el
 * modo (`automation_modes.marketing_guard`), las aplica.
 *
 *   shadow → sólo registra "haría X" (se ven en Tareas)
 *   semi   → aplica las deterministas (vencido, no visible, inactivo, cupo
 *            agotado confirmado) con aviso y deshacer; el resto queda propuesto
 *   auto   → aplica todo salvo los avisos de rendimiento, que siempre son avisos
 * Si Meta está caída o degradada, sólo propone.
 */

export interface GuardRunSummary {
  mode: string
  metaHealthy: boolean
  packagesEvaluated: number
  decisionsNew: number
  decisionsDeduped: number
  applied: number
  failed: number
  expired: number
  byRule: Record<string, number>
}

type GuardMode = 'shadow' | 'semi' | 'auto'

function todayArgentina(): string {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
}

async function loadSettings(db: Db): Promise<GuardSettings> {
  const { data } = await db.from('notification_settings').select('price_change_threshold_pct, ctr_threshold_pct, cpl_threshold, auto_hide_in_tc_on_sold_out').eq('id', 1).maybeSingle()
  const s = (data ?? {}) as Partial<{ price_change_threshold_pct: number; ctr_threshold_pct: number; cpl_threshold: number; auto_hide_in_tc_on_sold_out: boolean }>
  return {
    priceChangeThresholdPct: Number(s.price_change_threshold_pct ?? 5),
    ctrThresholdPct: Number(s.ctr_threshold_pct ?? 0.5),
    cplThreshold: Number(s.cpl_threshold ?? 10),
    autoHideInTcOnSoldOut: Boolean(s.auto_hide_in_tc_on_sold_out),
  }
}

async function loadMode(db: Db): Promise<GuardMode> {
  const { data } = await db.from('automation_modes').select('mode').eq('module', 'marketing_guard').maybeSingle()
  const mode = (data as { mode?: string } | null)?.mode
  return mode === 'semi' || mode === 'auto' ? mode : 'shadow'
}

interface PackageRow {
  id: number; tc_package_id: number; title: string; status: string; tc_active: boolean
  departure_date: string | null; date_range_end: string | null; needs_manual_quote: boolean
  current_price_per_pax: number | null; price_at_creative_creation: number | null
  departure_group_id: string | null; departure_index: number | null; write_lock_until: string | null
}

const PACKAGE_SELECT = 'id, tc_package_id, title, status, tc_active, departure_date, date_range_end, needs_manual_quote, current_price_per_pax, price_at_creative_creation, departure_group_id, departure_index, write_lock_until'

function toGuardPackage(p: PackageRow): GuardPackage {
  return {
    id: p.id, tcPackageId: p.tc_package_id, title: p.title, status: p.status, tcActive: p.tc_active,
    departureDate: p.departure_date, dateRangeEnd: p.date_range_end, needsManualQuote: p.needs_manual_quote,
    currentPricePerPax: p.current_price_per_pax === null ? null : Number(p.current_price_per_pax),
    priceAtCreativeCreation: p.price_at_creative_creation === null ? null : Number(p.price_at_creative_creation),
    departureGroupId: p.departure_group_id, writeLockUntil: p.write_lock_until,
  }
}

function linkLabel(l: PackageLink): string {
  const f = l.flight
  return f ? `${f.baseId ?? f.name ?? `vuelo ${l.flightId}`} (${f.startDate})` : `vuelo ${l.flightId}`
}

function toGuardLinks(links: PackageLink[] | undefined): GuardLink[] {
  return (links ?? []).map(l => ({
    flightId: l.flightId,
    flightLabel: linkLabel(l),
    confidence: l.confidence,
    confirmed: l.confirmed,
    remainingSeats: l.cupos?.remaining ?? null,
    totalSeats: l.cupos?.total ?? null,
    keptVisible: l.keptVisible,
  }))
}

/**
 * Moneda de la cuenta publicitaria (la guarda health.check) y, si no es USD,
 * el dólar minorista del BCRA que ya recolecta demand.signals. Sin eso, el
 * costo por conversación no se compara con el umbral (que está en USD).
 */
async function loadFx(db: Db, meta: Awaited<ReturnType<typeof getIntegrationStatus>>): Promise<{ currency: string; rate: number | null }> {
  let currency = (meta?.details as { account?: { currency?: string } } | null)?.account?.currency ?? process.env.META_ACCOUNT_CURRENCY ?? null
  if (!currency) {
    // Nadie guardó la moneda todavía: una llamada a Meta y queda persistida.
    const health = await checkMetaHealth()
    if (health.account?.currency) {
      currency = health.account.currency
      await setIntegrationStatus(db, 'meta', { status: health.status, tokenExpiresAt: health.expiresAt, details: { account: health.account, tokenType: health.tokenType, missingScopes: health.missingScopes } })
    }
  }
  if (!currency) return { currency: 'desconocida', rate: null }
  currency = currency.toUpperCase()
  if (currency === 'USD') return { currency, rate: 1 }
  if (currency !== 'ARS') return { currency, rate: null }
  const { data } = await db.from('demand_signals_weekly').select('metadata').eq('source', 'bcra_fx').eq('destination_code', '*').order('week_label', { ascending: false }).limit(1).maybeSingle()
  const last = (data as { metadata?: { minorista?: { last?: number | null } } } | null)?.metadata?.minorista?.last
  return { currency, rate: typeof last === 'number' && last > 0 ? last : null }
}

/** Insights de los últimos 7 días agregados por paquete (todos sus anuncios), en USD. */
async function loadInsights(db: Db, adsByPackage: Map<number, GuardAd[]>, fx: { currency: string; rate: number | null }): Promise<Map<number, GuardInsights>> {
  const allAdIds = [...adsByPackage.values()].flat().map(a => a.metaAdId)
  const result = new Map<number, GuardInsights>()
  if (allAdIds.length === 0) return result
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await db
    .from('meta_ad_insights')
    .select('meta_ad_id, date_start, date_stop, spend, impressions, clicks, messaging_conversations_started, messages')
    .in('meta_ad_id', allAdIds)
    .gte('date_start', since)
  const rows = (data ?? []) as Array<{ meta_ad_id: string; date_start: string; date_stop: string; spend: number | null; impressions: number | null; clicks: number | null; messaging_conversations_started: number | null; messages: number | null }>
  const packageOfAd = new Map<string, number>()
  for (const [pkgId, ads] of adsByPackage) for (const a of ads) packageOfAd.set(a.metaAdId, pkgId)

  const acc = new Map<number, { spend: number; impressions: number; clicks: number; conversations: number; days: Set<string> }>()
  for (const r of rows) {
    const pkgId = packageOfAd.get(r.meta_ad_id)
    if (pkgId === undefined) continue
    // Un preset como last_7d guarda una sola fila que cubre el rango; una diaria, una por día.
    const span = Math.max(1, Math.round((new Date(r.date_stop).getTime() - new Date(r.date_start).getTime()) / 86_400_000) + 1)
    const a = acc.get(pkgId) ?? { spend: 0, impressions: 0, clicks: 0, conversations: 0, days: new Set<string>() }
    a.spend += Number(r.spend ?? 0)
    a.impressions += Number(r.impressions ?? 0)
    a.clicks += Number(r.clicks ?? 0)
    a.conversations += Number(r.messaging_conversations_started ?? r.messages ?? 0)
    for (let i = 0; i < span; i++) a.days.add(new Date(new Date(r.date_start).getTime() + i * 86_400_000).toISOString().slice(0, 10))
    acc.set(pkgId, a)
  }
  for (const [pkgId, a] of acc) {
    const spendUsd = fx.rate ? a.spend / fx.rate : null
    result.set(pkgId, {
      days: a.days.size,
      spend: spendUsd === null ? 0 : Math.round(spendUsd * 100) / 100,
      spendLocal: Math.round(a.spend * 100) / 100,
      currency: fx.currency,
      fxRate: fx.rate,
      impressions: a.impressions,
      clicks: a.clicks,
      conversations: a.conversations,
      ctrPct: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : null,
      costPerConversation: spendUsd !== null && a.conversations > 0 ? Math.round((spendUsd / a.conversations) * 100) / 100 : null,
    })
  }
  return result
}

export async function runMarketingGuard(
  db: Db,
  options: { packageIds?: number[]; jobId?: number | null; log?: (message: string, details?: Record<string, unknown>, level?: 'info' | 'warning' | 'error') => Promise<void>; actor?: string } = {}
): Promise<GuardRunSummary> {
  const log = options.log ?? (async () => {})
  const actor = options.actor ?? 'guard'
  const [settings, mode, meta] = await Promise.all([loadSettings(db), loadMode(db), getIntegrationStatus(db, 'meta')])
  const metaHealthy = !meta || meta.status === 'ok' || meta.status === 'unknown'
  const today = todayArgentina()
  const weekLabel = isoWeekLabel()

  // Anuncios activos que maneja el sistema, agrupados por paquete
  let adsQuery = db.from('meta_ads').select('meta_ad_id, package_id, status, auto_managed, variant').eq('status', 'ACTIVE').eq('auto_managed', true)
  if (options.packageIds?.length) adsQuery = adsQuery.in('package_id', options.packageIds)
  const { data: adRows } = await adsQuery
  const adsByPackage = new Map<number, GuardAd[]>()
  for (const r of (adRows ?? []) as Array<{ meta_ad_id: string; package_id: number | null; status: string; auto_managed: boolean; variant: number | null }>) {
    if (!r.package_id) continue
    if (!adsByPackage.has(r.package_id)) adsByPackage.set(r.package_id, [])
    adsByPackage.get(r.package_id)!.push({ metaAdId: r.meta_ad_id, status: r.status, autoManaged: r.auto_managed, variant: r.variant })
  }
  const packageIds = [...adsByPackage.keys()]
  const summary: GuardRunSummary = { mode, metaHealthy, packagesEvaluated: packageIds.length, decisionsNew: 0, decisionsDeduped: 0, applied: 0, failed: 0, expired: 0, byRule: {} }
  if (packageIds.length === 0) {
    await log('Guard: no hay anuncios activos que revisar')
    return summary
  }

  const { data: pkgRows } = await db.from('packages').select(PACKAGE_SELECT).in('id', packageIds)
  const packages = (pkgRows ?? []) as PackageRow[]

  // Hermanas: todos los paquetes de los grupos involucrados
  const groupIds = [...new Set(packages.map(p => p.departure_group_id).filter((g): g is string => Boolean(g)))]
  const groupRows = groupIds.length ? ((await db.from('packages').select(PACKAGE_SELECT).in('departure_group_id', groupIds)).data ?? []) as PackageRow[] : []
  const linksById = await loadPackageLinks(db, [...new Set([...packageIds, ...groupRows.map(g => g.id)])])
  const fx = await loadFx(db, meta)
  const insightsByPackage = await loadInsights(db, adsByPackage, fx)

  const siblingsOf = (p: PackageRow): GuardSibling[] => {
    if (!p.departure_group_id) return []
    return groupRows.filter(g => g.departure_group_id === p.departure_group_id && g.id !== p.id).map(g => {
      const links = linksById.get(g.id) ?? []
      const hasSeats = links.length === 0 ? true : links.some(l => (l.cupos?.remaining ?? 1) > 0)
      const end = g.date_range_end ?? g.departure_date
      const sellable = g.tc_active && g.status !== 'expired' && g.status !== 'not_visible' && (!end || end >= today)
      return { packageId: g.id, tcPackageId: g.tc_package_id, departureDate: g.departure_date ?? g.date_range_end, hasSeats, sellable }
    })
  }

  const toApply: number[] = []
  for (const p of packages) {
    const input: GuardInput = {
      package: toGuardPackage(p),
      ads: adsByPackage.get(p.id) ?? [],
      links: toGuardLinks(linksById.get(p.id)),
      siblings: siblingsOf(p),
      insights: insightsByPackage.get(p.id) ?? null,
      settings,
      today,
      weekLabel,
    }
    const decisions = evaluatePackage(input)
    // Propuestas viejas de este paquete que ya no salen de la evaluación (ej. era "pausar" y ahora hay
    // otra salida con lugares → "redirigir"): se vencen para que Tareas muestre sólo lo vigente.
    const currentKeys = decisions.map(d => d.dedupeKey)
    let stale = db.from('ad_decisions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('package_id', p.id).eq('status', 'proposed')
    if (currentKeys.length > 0) stale = stale.not('dedupe_key', 'in', `(${currentKeys.map(k => `"${k}"`).join(',')})`)
    const { data: staleRows } = await stale.select('id')
    summary.expired += staleRows?.length ?? 0
    for (const d of decisions) {
      summary.byRule[d.rule] = (summary.byRule[d.rule] ?? 0) + 1
      const id = await persistDecision(db, p, d, mode, options.jobId ?? null)
      if (id === null) { summary.decisionsDeduped++; continue }
      summary.decisionsNew++
      const applyNow = mode !== 'shadow' && metaHealthy && (d.action === 'alert' || d.deterministic || mode === 'auto')
      if (applyNow) toApply.push(id)
    }
  }

  for (const id of toApply) {
    const r = await applyDecision(db, id, actor)
    if (r.ok) summary.applied++
    else summary.failed++
  }

  // Paquetes que ya no tienen anuncios activos: sus propuestas no tienen sentido.
  if (!options.packageIds?.length) {
    const { data: orphan } = await db.from('ad_decisions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('status', 'proposed').not('package_id', 'in', `(${packageIds.join(',')})`).select('id')
    summary.expired += orphan?.length ?? 0
  }

  // Propuestas viejas que nadie decidió
  const { data: expiredRows } = await db.from('ad_decisions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('status', 'proposed').lt('expires_at', new Date().toISOString()).select('id')
  summary.expired = expiredRows?.length ?? 0

  await log(`Guard (${mode}${metaHealthy ? '' : ', Meta degradada: sólo propone'}): ${summary.packagesEvaluated} paquetes, ${summary.decisionsNew} decisiones nuevas, ${summary.applied} aplicadas, ${summary.failed} fallidas`, { ...summary }, summary.failed ? 'warning' : 'info')
  return summary
}

async function persistDecision(db: Db, p: PackageRow, d: GuardDecision, mode: GuardMode, jobId: number | null): Promise<number | null> {
  const { data, error } = await db.from('ad_decisions').insert({
    meta_ad_id: d.metaAdId ?? 'package',
    package_id: p.id,
    tc_package_id: p.tc_package_id,
    rule: d.rule,
    action: d.action,
    mode,
    status: 'proposed',
    reason: d.reason,
    inputs: { ...d.inputs, severity: d.severity, deterministic: d.deterministic },
    dedupe_key: d.dedupeKey,
    job_id: jobId,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') return null // ya hay una abierta con la misma clave
    console.error('[guard] no se pudo guardar la decisión:', error.message)
    return null
  }
  return (data as { id: number }).id
}
