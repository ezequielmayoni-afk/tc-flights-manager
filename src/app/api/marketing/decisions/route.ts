import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marketing/decisions?status=proposed|applied|all&limit=
 * Decisiones del guard con el paquete y el anuncio.
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const status = request.nextUrl.searchParams.get('status') ?? 'open'
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 100), 300)
    let query = db.from('ad_decisions').select('*, packages(id, tc_package_id, title, status, tc_active, departure_date, date_range_end, marketing_status)').order('proposed_at', { ascending: false }).limit(limit)
    if (status === 'open') query = query.in('status', ['proposed', 'approved'])
    else if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw new Error(error.message)

    const adIds = [...new Set(((data ?? []) as Array<{ meta_ad_id: string }>).map(d => d.meta_ad_id).filter(id => id !== 'package'))]
    const ads = adIds.length ? ((await db.from('meta_ads').select('meta_ad_id, ad_name, variant, status, thumbnail_url').in('meta_ad_id', adIds)).data ?? []) : []
    const adById = new Map((ads as Array<{ meta_ad_id: string }>).map(a => [a.meta_ad_id, a]))
    const decisions = ((data ?? []) as Array<Record<string, unknown>>).map(d => ({ ...d, ad: adById.get(d.meta_ad_id as string) ?? null }))

    const { data: modeRow } = await db.from('automation_modes').select('mode, since').eq('module', 'marketing_guard').maybeSingle()
    return NextResponse.json({ decisions, mode: modeRow ?? { mode: 'shadow' } })
  } catch (error) {
    return errorResponse(error)
  }
}

/** POST /api/marketing/decisions { action: 'run', packageIds?: number[] } — corre el guard ahora. */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const body = await request.json().catch(() => ({})) as { action?: string; packageIds?: number[] }
    if (body.action !== 'run') return NextResponse.json({ error: 'action debe ser "run"' }, { status: 400 })
    const db = createAdminClient()
    const job = await enqueueJob(db, {
      kind: 'marketing.guard',
      payload: { trigger: 'manual', packageIds: body.packageIds },
      priority: MANUAL_PRIORITY,
      dedupeKey: body.packageIds?.length ? `marketing.guard:manual:${body.packageIds.join(',')}` : 'marketing.guard:all',
      createdBy: user?.email ?? 'ui',
    })
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    return errorResponse(error)
  }
}
