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
  themes: z.array(z.string().trim().min(1).max(80)).max(20),
  /** true = además mandarlas a TC (job tc.write verificado con GET). */
  push: z.boolean().optional(),
})

/**
 * PUT /api/packages/[id]/themes — temáticas editadas en HUB (`themes_local`).
 * `themes` sigue siendo lo que TC tiene; se iguala cuando el job las escribe
 * y el refresh diario las relee.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const packageId = Number(id)
    if (!Number.isInteger(packageId) || packageId <= 0) throw API_ERRORS.BAD_REQUEST('id inválido')
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const themes = [...new Set(parsed.data.themes.map(t => t.trim()).filter(Boolean))]
    const db = createAdminClient()
    const { data: pkg } = await db.from('packages').select('id, tc_package_id, title, themes').eq('id', packageId).maybeSingle()
    if (!pkg) throw API_ERRORS.NOT_FOUND(`El paquete ${packageId}`)
    const { error } = await db.from('packages').update({ themes_local: themes }).eq('id', packageId)
    if (error) throw new Error(error.message)
    const actor = user?.email ?? 'ui'
    let jobId: number | null = null
    let deduped = false
    if (parsed.data.push) {
      const job = await enqueueJob(db, { kind: 'tc.write', payload: { op: 'themes', packageId, tcPackageId: pkg.tc_package_id, themes, reason: 'temáticas editadas en HUB' }, priority: MANUAL_PRIORITY, dedupeKey: `tc.write:themes:${packageId}:${themes.join('|').slice(0, 120)}`, entityType: 'package', entityId: packageId, createdBy: actor })
      jobId = job.id; deduped = job.deduped
    }
    await logEvent(db, { source: 'marketing', action: parsed.data.push ? 'package.themes_pushed' : 'package.themes_edited', message: `${pkg.tc_package_id}: temáticas ${parsed.data.push ? 'enviadas a TC' : 'editadas'} (${themes.join(', ') || 'ninguna'})`, entityType: 'package', entityId: packageId, entityLabel: `${pkg.tc_package_id} · ${pkg.title}`, details: { before: pkg.themes, themes, jobId } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, themes, jobId, deduped })
  } catch (error) {
    return errorResponse(error)
  }
}
