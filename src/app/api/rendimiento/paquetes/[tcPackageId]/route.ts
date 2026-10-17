import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** GET — doble clic en un paquete: sus anuncios (gasto y conversaciones), sus vendedores y los últimos contactos. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tcPackageId: string }> }) {
  const { authorized } = await checkSectionAccess('rendimiento')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const tcPackageId = Number((await params).tcPackageId)
    const sp = request.nextUrl.searchParams
    const from = sp.get('from'); const to = sp.get('to')
    if (!tcPackageId || !from || !to) throw API_ERRORS.BAD_REQUEST('tcPackageId, from y to')
    const db = createAdminClient()
    const [{ data: ads }, { data: users }, { data: contacts }, { data: adNames }] = await Promise.all([
      db.from('package_performance_daily').select('ad_id, spend, impressions, clicks, conversations_started').eq('tc_package_id', tcPackageId).neq('ad_id', '*').gte('date', from).lte('date', to),
      db.from('package_performance_daily').select('assigned_user_id, contacts_new, opportunities_created, quotations_sent, won, lost, revenue_won, profit_won').eq('tc_package_id', tcPackageId).eq('ad_id', '*').neq('assigned_user_id', '*').eq('assigned_team_id', '*').gte('date', from).lte('date', to),
      db.from('crm_contact_attributions').select('contact_id, siv_first_at, ad_name, adset_name, campaign_name, ad_title, assigned_user_name, assigned_team_name, opportunity_stage, won, lost, closed_reason, quoted_value, final_value, profit, quotations_count, capi_events').eq('tc_package_id', tcPackageId).gte('siv_first_at', `${from}T00:00:00Z`).lte('siv_first_at', `${to}T23:59:59Z`).order('siv_first_at', { ascending: false }).limit(100),
      db.from('meta_ads').select('meta_ad_id, ad_name, variant, status').eq('tc_package_id', tcPackageId),
    ])
    const nameBy = new Map((adNames ?? []).map(a => [String(a.meta_ad_id), { name: a.ad_name as string | null, variant: a.variant as number | null, status: a.status as string | null }]))
    const adAgg = new Map<string, { adId: string; name: string | null; variant: number | null; status: string | null; spend: number; impressions: number; clicks: number; conversationsStarted: number }>()
    for (const r of ads ?? []) { const e = adAgg.get(String(r.ad_id)) ?? { adId: String(r.ad_id), name: nameBy.get(String(r.ad_id))?.name ?? null, variant: nameBy.get(String(r.ad_id))?.variant ?? null, status: nameBy.get(String(r.ad_id))?.status ?? null, spend: 0, impressions: 0, clicks: 0, conversationsStarted: 0 }; e.spend += Number(r.spend); e.impressions += Number(r.impressions); e.clicks += Number(r.clicks); e.conversationsStarted += Number(r.conversations_started); adAgg.set(e.adId, e) }
    const userAgg = new Map<string, { userId: string; name: string | null; contacts: number; opportunities: number; quotations: number; won: number; lost: number; revenue: number; profit: number }>()
    const userNames = new Map((contacts ?? []).map(c => [String(c.assigned_user_name), String(c.assigned_user_name)]))
    void userNames
    for (const r of users ?? []) { const e = userAgg.get(String(r.assigned_user_id)) ?? { userId: String(r.assigned_user_id), name: null, contacts: 0, opportunities: 0, quotations: 0, won: 0, lost: 0, revenue: 0, profit: 0 }; e.contacts += Number(r.contacts_new); e.opportunities += Number(r.opportunities_created); e.quotations += Number(r.quotations_sent); e.won += Number(r.won); e.lost += Number(r.lost); e.revenue += Number(r.revenue_won); e.profit += Number(r.profit_won); userAgg.set(e.userId, e) }
    const { data: names } = userAgg.size ? await db.from('crm_contact_attributions').select('assigned_user_id, assigned_user_name').in('assigned_user_id', [...userAgg.keys()]).limit(500) : { data: [] }
    for (const nm of names ?? []) { const e = userAgg.get(String(nm.assigned_user_id)); if (e && !e.name) e.name = nm.assigned_user_name as string | null }
    return NextResponse.json({ ads: [...adAgg.values()].sort((a, b) => b.spend - a.spend), users: [...userAgg.values()].sort((a, b) => b.contacts - a.contacts), contacts: contacts ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}
