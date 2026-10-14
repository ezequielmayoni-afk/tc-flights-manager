import { NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadFamilies, familyKeyForPackage } from '@/lib/marketing/families'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { findFlightsForPackages } from '@/lib/packages/flight-match'

export const dynamic = 'force-dynamic'

export interface LaunchCandidate {
  id: number
  tcPackageId: number
  title: string
  marketingStatus: string | null
  launchedAt: string | null
  launchError: string | null
  adsetId: string | null
  adsCount: number
  creativesCount: number
  copiesCount: number
  designCompletedAt: string | null
  familyKey: string | null
  familyName: string | null
  familyConfigured: boolean
  familyOverride: string | null
  lastJob: { id: number; kind: string; status: string; error: string | null; finishedAt: string | null } | null
}

/**
 * GET /api/marketing/launch/candidates — paquetes con diseño terminado que
 * todavía no tienen anuncios, o que HUB lanzó y esperan activación.
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('packages')
      .select('id, tc_package_id, title, themes, themes_local, destination_profile_code, marketing_family, marketing_status, launched_at, launch_error, meta_launch_adset_id, ads_created_count, design_completed, design_completed_at, send_to_marketing, send_to_design, needs_manual_quote')
      .eq('tc_active', true).not('status', 'in', '("expired","not_visible")')
      .or('design_completed.eq.true,send_to_marketing.eq.true,marketing_status.in.(launching,launched)')
      .order('design_completed_at', { ascending: false, nullsFirst: false })
    if (error) throw new Error(error.message)
    const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(r => r.marketing_status !== 'active' || Number(r.ads_created_count ?? 0) === 0)
    const ids = rows.map(r => Number(r.id))
    if (ids.length === 0) return NextResponse.json({ candidates: [] })
    const [families, { data: creatives }, { data: copies }, { data: profiles }, cupoIds, { data: jobs }] = await Promise.all([
      loadFamilies(db),
      db.from('meta_creatives').select('package_id').in('package_id', ids).eq('upload_status', 'uploaded'),
      db.from('meta_ad_copies').select('package_id').in('package_id', ids),
      db.from('destination_profiles').select('code, family'),
      getCupoPackageIds(db, ids),
      db.from('hub_jobs').select('id, kind, status, last_error, finished_at, entity_id').in('kind', ['marketing.launch', 'marketing.activate']).in('entity_id', ids).order('id', { ascending: false }).limit(200),
    ])
    const matched = cupoIds.size ? await findFlightsForPackages(db, [...cupoIds]) : new Map()
    const count = (list: Array<{ package_id: number }> | null) => { const m = new Map<number, number>(); for (const r of list ?? []) m.set(r.package_id, (m.get(r.package_id) ?? 0) + 1); return m }
    const creativesBy = count(creatives as Array<{ package_id: number }> | null)
    const copiesBy = count(copies as Array<{ package_id: number }> | null)
    const familyByCode = new Map(((profiles ?? []) as Array<{ code: string; family: string | null }>).map(p => [p.code, p.family]))
    const lastJob = new Map<number, LaunchCandidate['lastJob']>()
    for (const j of (jobs ?? []) as Array<{ id: number; kind: string; status: string; last_error: string | null; finished_at: string | null; entity_id: number }>) if (!lastJob.has(j.entity_id)) lastJob.set(j.entity_id, { id: j.id, kind: j.kind, status: j.status, error: j.last_error, finishedAt: j.finished_at })
    const candidates: LaunchCandidate[] = rows.map(r => {
      const id = Number(r.id)
      const profileFamily = r.destination_profile_code ? familyByCode.get(String(r.destination_profile_code)) ?? null : null
      const operatorDeparture = cupoIds.has(id) && (matched.get(id) ?? []).length === 0
      const key = familyKeyForPackage({ title: String(r.title), themes: (r.themes_local as string[] | null) ?? (r.themes as string[] | null), profileFamily, operatorDeparture, override: (r.marketing_family as string | null) ?? null })
      const fam = key ? families.find(f => f.key === key) ?? null : null
      return {
        id, tcPackageId: Number(r.tc_package_id), title: String(r.title), marketingStatus: (r.marketing_status as string | null) ?? null, launchedAt: (r.launched_at as string | null) ?? null, launchError: (r.launch_error as string | null) ?? null,
        adsetId: (r.meta_launch_adset_id as string | null) ?? null, adsCount: Number(r.ads_created_count ?? 0), creativesCount: creativesBy.get(id) ?? 0, copiesCount: copiesBy.get(id) ?? 0, designCompletedAt: (r.design_completed_at as string | null) ?? null,
        familyKey: key, familyName: fam?.name ?? null, familyConfigured: Boolean(fam?.metaCampaignId && fam?.templateAdsetId), familyOverride: (r.marketing_family as string | null) ?? null, lastJob: lastJob.get(id) ?? null,
      }
    })
    return NextResponse.json({ candidates, families: families.map(f => ({ key: f.key, name: f.name, configured: Boolean(f.metaCampaignId && f.templateAdsetId), autoLaunch: f.autoLaunch })) })
  } catch (error) {
    return errorResponse(error)
  }
}
