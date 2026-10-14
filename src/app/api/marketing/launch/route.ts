import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { resolveFamilyForPackage } from '@/lib/meta-ads/launch'

export const dynamic = 'force-dynamic'

const schema = z.object({ packageId: z.number().int().positive(), action: z.enum(['launch', 'activate']).default('launch') })

/**
 * POST /api/marketing/launch { packageId, action: 'launch' | 'activate' }
 * Encola el lanzamiento (conjunto + anuncios en pausa) o la activación. Las
 * escrituras en Meta siempre van por job: el tick las corre en menos de un minuto.
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('packageId (número) y action (launch | activate)')
    const { packageId, action } = parsed.data
    const db = createAdminClient()
    const actor = user?.email ?? 'ui'
    const kind = action === 'activate' ? 'marketing.activate' : 'marketing.launch'
    const job = await enqueueJob(db, { kind, payload: { packageId, actor, trigger: 'manual' }, priority: MANUAL_PRIORITY, dedupeKey: `${kind}:${packageId}`, entityType: 'package', entityId: packageId, createdBy: actor })
    if (action === 'launch') await db.from('packages').update({ marketing_status: 'launching', launch_error: null }).eq('id', packageId).not('marketing_status', 'in', '("active","launched")')
    return NextResponse.json({ ok: true, jobId: job.id, deduped: job.deduped })
  } catch (error) {
    return errorResponse(error)
  }
}

/** GET /api/marketing/launch?packageId= — familia resuelta y último job de lanzamiento/activación. */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const packageId = Number(request.nextUrl.searchParams.get('packageId'))
    if (!packageId) throw API_ERRORS.BAD_REQUEST('packageId')
    const db = createAdminClient()
    const { data: pkg } = await db.from('packages').select('id, title, themes, themes_local, destination_profile_code, marketing_family, marketing_status, meta_launch_adset_id, meta_launch_campaign_id, launched_at, launch_error').eq('id', packageId).maybeSingle()
    if (!pkg) throw API_ERRORS.NOT_FOUND(`El paquete ${packageId}`)
    const family = await resolveFamilyForPackage(db, pkg)
    const { data: jobs } = await db.from('hub_jobs').select('id, kind, status, last_error, created_at, finished_at, result').in('kind', ['marketing.launch', 'marketing.activate']).eq('entity_id', packageId).order('id', { ascending: false }).limit(3)
    return NextResponse.json({ package: pkg, family: { key: family.key, name: family.family?.name ?? null, configured: Boolean(family.family?.metaCampaignId && family.family?.templateAdsetId), autoLaunch: family.family?.autoLaunch ?? false, profileFamily: family.profileFamily, operatorDeparture: family.operatorDeparture }, jobs: jobs ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}
