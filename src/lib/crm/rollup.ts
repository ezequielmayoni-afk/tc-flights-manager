import type { Db } from '@/lib/jobs/types'
import { withCrm } from './pool'
import { adsById, attributionsForContacts, capiForContacts, contactsById, opportunitiesForContacts, sivMessagesInWindow, usersAndTeams, type AttributionRow, type OpportunityRow } from './queries'
import { extractSivCodes } from './siv'

/**
 * Rollup nocturno: por contacto que mandó un código SIV, qué anuncio lo trajo,
 * quién lo atiende, en qué quedó la oportunidad y qué eventos CAPI se
 * reportaron. Se persiste en crm_contact_attributions y se agrega por día,
 * paquete, anuncio, vendedor y equipo en package_performance_daily.
 */

export interface AttributionRecord {
  contact_id: string; tc_package_id: number; siv_first_at: string; siv_messages: number
  ad_id: string | null; ad_name: string | null; adset_name: string | null; campaign_name: string | null; ad_title: string | null; ctwa_click_id: string | null; click_at: string | null; is_first_touch: boolean | null
  attribution_confidence: 'siv' | 'adid' | 'both' | 'none'
  assigned_user_id: string | null; assigned_user_name: string | null; assigned_team_id: string | null; assigned_team_name: string | null; contact_created_at: string | null
  opportunity_id: string | null; opportunity_stage: string | null; opportunity_status: string | null; opportunity_created_at: string | null; won: boolean; lost: boolean; closed_reason: string | null; closed_at: string | null
  quoted_value: number | null; final_value: number | null; profit: number | null; currency: string | null; quotations_count: number; capi_events: string[]
}

const CLICK_LOOKBACK_MS = 14 * 86400000

/** El click de anuncio que explica el mensaje: el último antes del SIV (hasta 14 días); si no hay, el último que exista. Puro. */
export function pickClick(clicks: AttributionRow[], sivAt: Date): AttributionRow | null {
  const sorted = [...clicks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  const before = sorted.filter(c => c.timestamp.getTime() <= sivAt.getTime() + 60_000 && sivAt.getTime() - c.timestamp.getTime() <= CLICK_LOOKBACK_MS)
  return before.at(-1) ?? sorted.at(-1) ?? null
}

/** La oportunidad que cuenta: la principal; si no, la más reciente. Puro. */
export function pickOpportunity(opps: OpportunityRow[]): OpportunityRow | null {
  return opps.find(o => o.is_primary) ?? opps[0] ?? null
}

export interface DailyRow {
  date: string; tc_package_id: number; ad_id: string; assigned_user_id: string; assigned_team_id: string
  messages_in: number; contacts_new: number; opportunities_created: number; quotations_sent: number; won: number; lost: number
  view_content: number; add_to_cart: number; initiate_checkout: number; purchase: number; revenue_won: number; profit_won: number
}

const CAPI = { view_content: /viewcontent/i, add_to_cart: /addtocart/i, initiate_checkout: /initiatecheckout/i, purchase: /^purchase$/i }

/** Agrega las atribuciones por fecha del primer SIV (cohorte): total, por vendedor y por equipo. Puro. */
export function aggregateDaily(records: AttributionRecord[]): DailyRow[] {
  const map = new Map<string, DailyRow>()
  const bump = (key: { date: string; tc_package_id: number; assigned_user_id: string; assigned_team_id: string }, r: AttributionRecord) => {
    const k = `${key.date}|${key.tc_package_id}|*|${key.assigned_user_id}|${key.assigned_team_id}`
    const row = map.get(k) ?? { ...key, ad_id: '*', messages_in: 0, contacts_new: 0, opportunities_created: 0, quotations_sent: 0, won: 0, lost: 0, view_content: 0, add_to_cart: 0, initiate_checkout: 0, purchase: 0, revenue_won: 0, profit_won: 0 }
    row.messages_in += r.siv_messages; row.contacts_new += 1
    if (r.opportunity_id) row.opportunities_created += 1
    if (r.quotations_count > 0) row.quotations_sent += 1
    if (r.won) { row.won += 1; row.revenue_won += r.final_value ?? r.quoted_value ?? 0; row.profit_won += r.profit ?? 0 }
    if (r.lost) row.lost += 1
    for (const ev of r.capi_events) { if (CAPI.view_content.test(ev)) row.view_content++; if (CAPI.add_to_cart.test(ev)) row.add_to_cart++; if (CAPI.initiate_checkout.test(ev)) row.initiate_checkout++; if (CAPI.purchase.test(ev)) row.purchase++ }
    map.set(k, row)
  }
  for (const r of records) {
    const date = r.siv_first_at.slice(0, 10)
    bump({ date, tc_package_id: r.tc_package_id, assigned_user_id: '*', assigned_team_id: '*' }, r)
    if (r.assigned_user_id) bump({ date, tc_package_id: r.tc_package_id, assigned_user_id: r.assigned_user_id, assigned_team_id: '*' }, r)
    if (r.assigned_team_id) bump({ date, tc_package_id: r.tc_package_id, assigned_user_id: '*', assigned_team_id: r.assigned_team_id }, r)
  }
  return [...map.values()].map(r => ({ ...r, revenue_won: Math.round(r.revenue_won * 100) / 100, profit_won: Math.round(r.profit_won * 100) / 100 }))
}

export interface RollupResult { from: string; to: string; sivMessages: number; contacts: number; records: number; withAd: number; dailyRows: number; spendRows: number; durationMs: number }

/** Lee el CRM para la ventana y escribe atribuciones y agregados en HUB. `days` = cuántos días hacia atrás (reprocesa toda la ventana). */
export async function runCrmRollup(db: Db, options: { days?: number; to?: Date; log?: (m: string) => Promise<void> | void } = {}): Promise<RollupResult> {
  const started = Date.now()
  const log = options.log ?? (() => {})
  const to = options.to ?? new Date()
  const from = new Date(to.getTime() - (options.days ?? 7) * 86400000)
  const records: AttributionRecord[] = []
  let sivMessagesCount = 0
  let contactsCount = 0

  await withCrm(async (c, tenant) => {
    const msgs = await sivMessagesInWindow(c, tenant, from, to)
    sivMessagesCount = msgs.length
    // Primer mensaje con cada código por contacto, y cuántos mandó.
    const firstByKey = new Map<string, { contact_id: string; tc_package_id: number; at: Date; count: number }>()
    for (const m of msgs) {
      for (const code of extractSivCodes(m.searchable_text)) {
        const k = `${m.contact_id}|${code}`
        const e = firstByKey.get(k)
        if (!e) firstByKey.set(k, { contact_id: m.contact_id, tc_package_id: code, at: m.created_at, count: 1 })
        else e.count++
      }
    }
    const contactIds = [...new Set([...firstByKey.values()].map(x => x.contact_id))]
    contactsCount = contactIds.length
    await log(`CRM: ${msgs.length} mensajes con SIV de ${contactIds.length} contactos (${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)})`)
    if (contactIds.length === 0) return
    // Secuencial a propósito: una sola conexión del CRM no admite consultas en paralelo.
    const clicks = await attributionsForContacts(c, tenant, contactIds, new Date(from.getTime() - CLICK_LOOKBACK_MS))
    const contacts = await contactsById(c, tenant, contactIds)
    const opps = await opportunitiesForContacts(c, tenant, contactIds)
    const capi = await capiForContacts(c, tenant, contactIds, new Date(from.getTime() - 30 * 86400000))
    const { users, teams } = await usersAndTeams(c, tenant)
    const clicksBy = new Map<string, AttributionRow[]>(); for (const r of clicks) clicksBy.set(r.contact_id, [...(clicksBy.get(r.contact_id) ?? []), r])
    const contactBy = new Map(contacts.map(x => [x.id, x]))
    const oppsBy = new Map<string, OpportunityRow[]>(); for (const o of opps) oppsBy.set(o.contact_id, [...(oppsBy.get(o.contact_id) ?? []), o])
    const capiBy = new Map<string, string[]>(); for (const e of capi) capiBy.set(e.contact_id, [...(capiBy.get(e.contact_id) ?? []), e.event_name])
    const userBy = new Map(users.map(u => [u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || u.id]))
    const teamBy = new Map(teams.map(t => [t.id, t.name]))
    const adIds = [...new Set([...clicksBy.values()].flat().map(x => String(x.metadata?.adId ?? '')).filter(Boolean))]
    const ads = new Map((await adsById(c, tenant, adIds)).map(a => [a.id, a]))
    for (const e of firstByKey.values()) {
      const click = pickClick(clicksBy.get(e.contact_id) ?? [], e.at)
      const meta = (click?.metadata ?? {}) as Record<string, unknown>
      const adId = meta.adId ? String(meta.adId) : null
      const ad = adId ? ads.get(adId) : undefined
      const contact = contactBy.get(e.contact_id)
      const opp = pickOpportunity(oppsBy.get(e.contact_id) ?? [])
      const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v))
      records.push({
        contact_id: e.contact_id, tc_package_id: e.tc_package_id, siv_first_at: e.at.toISOString(), siv_messages: e.count,
        ad_id: adId, ad_name: ad?.name ?? null, adset_name: ad?.adset_name ?? null, campaign_name: ad?.campaign_name ?? null, ad_title: meta.adTitle ? String(meta.adTitle) : null, ctwa_click_id: meta.ctwaClickId ? String(meta.ctwaClickId) : null,
        click_at: click ? click.timestamp.toISOString() : null, is_first_touch: typeof meta.isFirstTouch === 'boolean' ? meta.isFirstTouch : null, attribution_confidence: adId ? 'both' : 'siv',
        assigned_user_id: contact?.assigned_user_id ?? contact?.owner_id ?? null, assigned_user_name: contact?.assigned_user_id ? userBy.get(contact.assigned_user_id) ?? null : contact?.owner_id ? userBy.get(contact.owner_id) ?? null : null,
        assigned_team_id: contact?.assigned_team_id ?? null, assigned_team_name: contact?.assigned_team_id ? teamBy.get(contact.assigned_team_id) ?? null : null, contact_created_at: contact?.created_at ? contact.created_at.toISOString() : null,
        opportunity_id: opp?.id ?? null, opportunity_stage: opp?.stage ?? null, opportunity_status: opp?.status ?? null, opportunity_created_at: opp?.created_at ? opp.created_at.toISOString() : null,
        won: opp?.stage === 'won' || opp?.status === 'won', lost: opp?.stage === 'lost' || opp?.status === 'lost', closed_reason: opp?.closed_reason ?? null, closed_at: opp?.closed_at ? opp.closed_at.toISOString() : null,
        quoted_value: num(opp?.quoted_value), final_value: num(opp?.final_value), profit: num(opp?.profit), currency: opp?.currency ?? null, quotations_count: Number(opp?.quotation_count ?? 0), capi_events: [...new Set(capiBy.get(e.contact_id) ?? [])],
      })
    }
  })

  // HUB: atribuciones (upsert) y agregados de la ventana (se reescriben los días de la ventana).
  const now = new Date().toISOString()
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await db.from('crm_contact_attributions').upsert(records.slice(i, i + 500).map(r => ({ ...r, updated_at: now })), { onConflict: 'contact_id,tc_package_id' })
    if (error) throw new Error(`crm_contact_attributions: ${error.message}`)
  }
  // Para agregar por cohorte hay que mirar TODAS las atribuciones con siv_first_at en la ventana, no sólo las de esta corrida.
  const { data: windowRecords } = await db.from('crm_contact_attributions').select('*').gte('siv_first_at', from.toISOString()).lt('siv_first_at', to.toISOString())
  const daily = aggregateDaily(((windowRecords ?? []) as unknown as AttributionRecord[]))
  const fromDay = from.toISOString().slice(0, 10), toDay = to.toISOString().slice(0, 10)
  await db.from('package_performance_daily').delete().eq('ad_id', '*').gte('date', fromDay).lte('date', toDay)
  for (let i = 0; i < daily.length; i += 500) {
    const { error } = await db.from('package_performance_daily').upsert(daily.slice(i, i + 500).map(r => ({ ...r, updated_at: now })), { onConflict: 'date,tc_package_id,ad_id,assigned_user_id,assigned_team_id' })
    if (error) throw new Error(`package_performance_daily: ${error.message}`)
  }
  const spendRows = await rollupSpend(db, fromDay, toDay)
  await db.from('crm_rollup_watermarks').upsert({ key: 'crm.rollup', value: { from: from.toISOString(), to: to.toISOString(), records: records.length, at: now }, updated_at: now }, { onConflict: 'key' })
  return { from: fromDay, to: toDay, sivMessages: sivMessagesCount, contacts: contactsCount, records: records.length, withAd: records.filter(r => r.ad_id).length, dailyRows: daily.length, spendRows, durationMs: Date.now() - started }
}

/** Gasto, impresiones, clics y conversaciones por anuncio y día desde los insights de Meta que HUB ya sincroniza (fuente única de gasto). */
export async function rollupSpend(db: Db, fromDay: string, toDay: string): Promise<number> {
  const { data: ads } = await db.from('meta_ads').select('meta_ad_id, tc_package_id').not('meta_ad_id', 'is', null)
  const pkgByAd = new Map((ads ?? []).map(a => [String(a.meta_ad_id), Number(a.tc_package_id)]))
  const { data: ins } = await db.from('meta_ad_insights').select('meta_ad_id, date_start, spend, impressions, clicks, messaging_conversations_started, messages, purchase, add_to_cart, initiate_checkout').gte('date_start', fromDay).lte('date_start', toDay)
  const rows = new Map<string, Record<string, unknown>>()
  for (const r of ins ?? []) {
    const pkg = pkgByAd.get(String(r.meta_ad_id)); if (!pkg) continue
    const key = `${r.date_start}|${pkg}|${r.meta_ad_id}`
    const row = rows.get(key) ?? { date: r.date_start, tc_package_id: pkg, ad_id: String(r.meta_ad_id), assigned_user_id: '*', assigned_team_id: '*', spend: 0, impressions: 0, clicks: 0, conversations_started: 0, updated_at: new Date().toISOString() }
    row.spend = Number(row.spend) + Number(r.spend ?? 0); row.impressions = Number(row.impressions) + Number(r.impressions ?? 0); row.clicks = Number(row.clicks) + Number(r.clicks ?? 0)
    row.conversations_started = Number(row.conversations_started) + Number(r.messaging_conversations_started ?? r.messages ?? 0)
    rows.set(key, row)
  }
  const list = [...rows.values()]
  await db.from('package_performance_daily').delete().neq('ad_id', '*').gte('date', fromDay).lte('date', toDay)
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await db.from('package_performance_daily').upsert(list.slice(i, i + 500), { onConflict: 'date,tc_package_id,ad_id,assigned_user_id,assigned_team_id' })
    if (error) throw new Error(`package_performance_daily (spend): ${error.message}`)
  }
  return list.length
}
