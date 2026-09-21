import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'

const schema = z.object({
  packageId: z.number().int().positive(),
  track: z.enum(['marketing', 'web', 'manual']),
  note: z.string().max(300).optional(),
  /** Con `pushThemes: true` además manda las temáticas locales a TC (job tc.write verificado). */
  pushThemes: z.boolean().optional(),
})

/**
 * POST /api/marketing/track — decisión humana sobre la vía de un paquete.
 * "Enviar a diseño" lo hace la acción `design` de bulk-action (misma que
 * siempre); acá sólo queda registrada la decisión para que el evaluador no
 * la pise.
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const { packageId, track, note, pushThemes } = parsed.data
    const db = createAdminClient()
    const { data: pkg } = await db.from('packages').select('id, tc_package_id, title, marketing_track, marketing_track_reason, themes_local').eq('id', packageId).maybeSingle()
    if (!pkg) throw API_ERRORS.NOT_FOUND(`El paquete ${packageId}`)
    const now = new Date().toISOString()
    const actor = user?.email ?? 'ui'
    const reason = note ? `${note} (${actor})` : `${track === 'marketing' ? 'A marketing' : track === 'web' ? 'Sólo web' : 'Para decidir'} por ${actor}`
    const { error } = await db.from('packages').update({ marketing_track: track, marketing_track_decided_by: actor, marketing_track_decided_at: now, marketing_track_reason: [reason, pkg.marketing_track_reason].filter(Boolean).join(' · ') }).eq('id', packageId)
    if (error) throw new Error(error.message)
    let themesJob: number | null = null
    if (pushThemes && Array.isArray(pkg.themes_local) && pkg.themes_local.length > 0) {
      const job = await enqueueJob(db, { kind: 'tc.write', payload: { op: 'themes', packageId, tcPackageId: pkg.tc_package_id, themes: pkg.themes_local, reason: 'temáticas editadas en HUB' }, priority: MANUAL_PRIORITY, dedupeKey: `tc.write:themes:${packageId}`, entityType: 'package', entityId: packageId, createdBy: actor })
      themesJob = job.id
    }
    await logEvent(db, { source: 'marketing', action: `marketing.track.${track}`, message: `${pkg.tc_package_id}: vía ${track}${note ? ` (${note})` : ''}${themesJob ? ' · temáticas enviadas a TC' : ''}`, entityType: 'package', entityId: packageId, entityLabel: `${pkg.tc_package_id} · ${pkg.title}`, details: { previous: pkg.marketing_track, track, themesJob } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, track, themesJob })
  } catch (error) {
    return errorResponse(error)
  }
}
