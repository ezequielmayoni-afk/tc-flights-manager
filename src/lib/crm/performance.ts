import type { Db } from '@/lib/jobs/types'

/** Lectura del tablero: suma package_performance_daily por paquete en un rango, con filtro de vendedor o equipo. */

export interface PackagePerformanceRow {
  tcPackageId: number
  title: string | null
  status: string | null
  family: string | null
  spend: number; impressions: number; clicks: number; conversationsStarted: number
  messagesIn: number; contactsNew: number; opportunitiesCreated: number; quotationsSent: number; won: number; lost: number
  viewContent: number; addToCart: number; initiateCheckout: number; purchase: number; revenueWon: number; profitWon: number
  costPerContact: number | null; costPerConversation: number | null; costPerWon: number | null; roasMargin: number | null
}

interface DailyRow { date: string; tc_package_id: number; ad_id: string; assigned_user_id: string; assigned_team_id: string; spend: string | number; impressions: number; clicks: number; conversations_started: number; messages_in: number; contacts_new: number; opportunities_created: number; quotations_sent: number; won: number; lost: number; view_content: number; add_to_cart: number; initiate_checkout: number; purchase: number; revenue_won: string | number; profit_won: string | number }

const n = (v: string | number | null | undefined) => Number(v ?? 0)
const div = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)

export async function loadPackagePerformance(db: Db, params: { from: string; to: string; userId?: string | null; teamId?: string | null }): Promise<{ rows: PackagePerformanceRow[]; totals: Omit<PackagePerformanceRow, 'tcPackageId' | 'title' | 'status' | 'family'> }> {
  const userDim = params.userId ? params.userId : '*'
  const teamDim = params.teamId ? params.teamId : '*'
  const [{ data: crmRows }, { data: spendRows }] = await Promise.all([
    db.from('package_performance_daily').select('*').eq('ad_id', '*').eq('assigned_user_id', userDim).eq('assigned_team_id', teamDim).gte('date', params.from).lte('date', params.to),
    db.from('package_performance_daily').select('*').neq('ad_id', '*').gte('date', params.from).lte('date', params.to),
  ])
  const agg = new Map<number, PackagePerformanceRow>()
  const get = (id: number) => { const r = agg.get(id) ?? { tcPackageId: id, title: null, status: null, family: null, spend: 0, impressions: 0, clicks: 0, conversationsStarted: 0, messagesIn: 0, contactsNew: 0, opportunitiesCreated: 0, quotationsSent: 0, won: 0, lost: 0, viewContent: 0, addToCart: 0, initiateCheckout: 0, purchase: 0, revenueWon: 0, profitWon: 0, costPerContact: null, costPerConversation: null, costPerWon: null, roasMargin: null }; agg.set(id, r); return r }
  for (const r of (crmRows ?? []) as DailyRow[]) { const a = get(r.tc_package_id); a.messagesIn += n(r.messages_in); a.contactsNew += n(r.contacts_new); a.opportunitiesCreated += n(r.opportunities_created); a.quotationsSent += n(r.quotations_sent); a.won += n(r.won); a.lost += n(r.lost); a.viewContent += n(r.view_content); a.addToCart += n(r.add_to_cart); a.initiateCheckout += n(r.initiate_checkout); a.purchase += n(r.purchase); a.revenueWon += n(r.revenue_won); a.profitWon += n(r.profit_won) }
  // El gasto no se filtra por vendedor: es del anuncio, no de quien atendió.
  for (const r of (spendRows ?? []) as DailyRow[]) { const a = get(r.tc_package_id); a.spend += n(r.spend); a.impressions += n(r.impressions); a.clicks += n(r.clicks); a.conversationsStarted += n(r.conversations_started) }
  const ids = [...agg.keys()]
  if (ids.length) {
    const { data: pk } = await db.from('packages').select('tc_package_id, title, status, marketing_family, destination_profile_code').in('tc_package_id', ids)
    const { data: profiles } = await db.from('destination_profiles').select('code, family')
    const fam = new Map((profiles ?? []).map(p => [p.code, p.family]))
    for (const p of pk ?? []) { const a = agg.get(Number(p.tc_package_id)); if (a) { a.title = p.title; a.status = p.status; a.family = (p.marketing_family as string | null) ?? (p.destination_profile_code ? (fam.get(p.destination_profile_code) as string | null) ?? null : null) } }
  }
  const rows = [...agg.values()].map(a => ({ ...a, spend: Math.round(a.spend * 100) / 100, revenueWon: Math.round(a.revenueWon * 100) / 100, profitWon: Math.round(a.profitWon * 100) / 100, costPerContact: div(a.spend, a.contactsNew), costPerConversation: div(a.spend, a.conversationsStarted), costPerWon: div(a.spend, a.won), roasMargin: div(a.profitWon, a.spend) })).sort((a, b) => b.contactsNew - a.contactsNew || b.spend - a.spend)
  const t = rows.reduce((acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, conversationsStarted: acc.conversationsStarted + r.conversationsStarted, messagesIn: acc.messagesIn + r.messagesIn, contactsNew: acc.contactsNew + r.contactsNew, opportunitiesCreated: acc.opportunitiesCreated + r.opportunitiesCreated, quotationsSent: acc.quotationsSent + r.quotationsSent, won: acc.won + r.won, lost: acc.lost + r.lost, viewContent: acc.viewContent + r.viewContent, addToCart: acc.addToCart + r.addToCart, initiateCheckout: acc.initiateCheckout + r.initiateCheckout, purchase: acc.purchase + r.purchase, revenueWon: acc.revenueWon + r.revenueWon, profitWon: acc.profitWon + r.profitWon }), { spend: 0, impressions: 0, clicks: 0, conversationsStarted: 0, messagesIn: 0, contactsNew: 0, opportunitiesCreated: 0, quotationsSent: 0, won: 0, lost: 0, viewContent: 0, addToCart: 0, initiateCheckout: 0, purchase: 0, revenueWon: 0, profitWon: 0 })
  return { rows, totals: { ...t, spend: Math.round(t.spend * 100) / 100, costPerContact: div(t.spend, t.contactsNew), costPerConversation: div(t.spend, t.conversationsStarted), costPerWon: div(t.spend, t.won), roasMargin: div(t.profitWon, t.spend) } }
}
