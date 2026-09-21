import { NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export interface MarketingCandidate {
  id: number
  tcPackageId: number
  title: string
  track: string
  score: number | null
  reasons: string[]
  details: Record<string, unknown> | null
  decidedBy: string | null
  evaluatedAt: string | null
  departureDate: string | null
  pricePerPax: number | null
  destinations: string[]
  themes: string[]
  themesLocal: string[] | null
  themesPushedAt: string | null
  status: string | null
  sendToDesign: boolean
}

/**
 * GET /api/marketing/candidates — paquetes evaluados que todavía no fueron a
 * diseño ni a marketing, con su vía, score y motivos. Los de marketing y
 * manual son los que esperan una decisión; los web se listan aparte.
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('packages')
      .select('id, tc_package_id, title, status, send_to_design, send_to_marketing, marketing_track, marketing_score, marketing_track_reason, marketing_score_details, marketing_track_decided_by, marketing_evaluated_at, departure_date, flight_departure_date, current_price_per_pax, themes, themes_local, themes_pushed_at, package_destinations(destination_name, sort_order)')
      .eq('tc_active', true).not('status', 'in', '("expired","not_visible","in_marketing")').eq('send_to_marketing', false).eq('send_to_design', false)
      .order('marketing_score', { ascending: false, nullsFirst: false })
    if (error) throw new Error(error.message)
    const { data: themeRows } = await db.from('packages').select('themes').eq('tc_active', true)
    const taxonomy = new Map<string, number>()
    for (const r of (themeRows ?? []) as Array<{ themes: string[] | null }>) for (const t of r.themes ?? []) { const k = t.trim(); if (k) taxonomy.set(k, (taxonomy.get(k) ?? 0) + 1) }
    const candidates: MarketingCandidate[] = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: Number(r.id), tcPackageId: Number(r.tc_package_id), title: String(r.title ?? ''), track: String(r.marketing_track ?? 'undecided'),
      score: r.marketing_score === null ? null : Number(r.marketing_score), reasons: String(r.marketing_track_reason ?? '').split(' · ').filter(Boolean),
      details: (r.marketing_score_details as Record<string, unknown> | null) ?? null, decidedBy: (r.marketing_track_decided_by as string | null) ?? null, evaluatedAt: (r.marketing_evaluated_at as string | null) ?? null,
      departureDate: (r.flight_departure_date as string | null) ?? (r.departure_date as string | null) ?? null, pricePerPax: r.current_price_per_pax === null ? null : Number(r.current_price_per_pax),
      destinations: [...((r.package_destinations as Array<{ destination_name: string | null; sort_order: number | null }> | null) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(d => d.destination_name ?? '').filter(Boolean),
      themes: (r.themes as string[] | null) ?? [], themesLocal: (r.themes_local as string[] | null) ?? null, themesPushedAt: (r.themes_pushed_at as string | null) ?? null,
      status: (r.status as string | null) ?? null, sendToDesign: r.send_to_design === true,
    }))
    return NextResponse.json({ candidates, themeTaxonomy: [...taxonomy.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) })
  } catch (error) {
    return errorResponse(error)
  }
}
