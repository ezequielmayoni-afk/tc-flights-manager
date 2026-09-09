import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { startIdea } from '@/lib/producto/ideas'
import { logEvent } from '@/lib/logs'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/producto/ideas/[id] — idea + corridas de cotización + sondas. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const ideaId = Number(id)
    const db = createAdminClient()
    const [idea, runs, probes] = await Promise.all([
      db.from('package_ideas').select('*').eq('id', ideaId).maybeSingle(),
      db.from('quote_runs').select('id, status, price_pp, hotel_name, board, stars, airline, direct, departure_date, return_date, warnings, elapsed_seconds, created_at, request').eq('idea_id', ideaId).order('id', { ascending: false }),
      db.from('flight_price_probes').select('departure_date, price_per_pax, direct, duration_minutes, source').eq('idea_id', ideaId).order('departure_date'),
    ])
    if (!idea.data) return NextResponse.json({ error: 'Idea no encontrada' }, { status: 404 })
    return NextResponse.json({ idea: idea.data, runs: runs.data ?? [], probes: probes.data ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * PATCH /api/producto/ideas/[id]
 *   { action: 'start' }                         → sonda + cotización
 *   { action: 'quote' }                         → sólo cotizar (fecha ya elegida)
 *   { action: 'approve' }                       → priced|needs_review → approved (humano, nunca auto)
 *   { action: 'reject', reason }                → rejected
 *   { action: 'saved', tcPackageId }            → la guardó a mano en siviajo.com (hasta la Fase 6)
 *   { action: 'update', fields: {...} }         → editar borrador
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const ideaId = Number(id)
    const body = await request.json().catch(() => ({})) as { action?: string; reason?: string; tcPackageId?: number; fields?: Record<string, unknown> }
    const actor = user?.email ?? 'ui'
    const db = createAdminClient()
    const { data: idea } = await db.from('package_ideas').select('id, status, destination_name').eq('id', ideaId).maybeSingle()
    if (!idea) return NextResponse.json({ error: 'Idea no encontrada' }, { status: 404 })
    const now = new Date().toISOString()

    switch (body.action) {
      case 'start': {
        const r = await startIdea(db, ideaId, actor)
        return NextResponse.json({ ok: true, ...r })
      }
      case 'quote': {
        await db.from('package_ideas').update({ status: 'quoting', error: null, updated_at: now }).eq('id', ideaId)
        const { enqueueJob } = await import('@/lib/jobs/queue')
        const { MANUAL_PRIORITY } = await import('@/lib/jobs/lanes')
        const job = await enqueueJob(db, { kind: 'idea.quote', payload: { ideaId }, priority: MANUAL_PRIORITY, dedupeKey: `idea.quote:${ideaId}`, entityType: 'idea', entityId: ideaId, createdBy: actor, maxAttempts: 2 })
        return NextResponse.json({ ok: true, jobId: job.id, status: 'quoting' })
      }
      case 'approve': {
        if (!['priced', 'needs_review'].includes(idea.status)) return NextResponse.json({ error: `No se puede aprobar una idea en estado ${idea.status}` }, { status: 409 })
        await db.from('package_ideas').update({ status: 'approved', approved_by: actor, approved_at: now, updated_at: now }).eq('id', ideaId)
        await logEvent(db, { source: 'automation', action: 'idea.approved', message: `Idea #${ideaId} aprobada (${idea.destination_name})`, details: { ideaId } }, user ? { id: user.id, email: user.email } : null)
        return NextResponse.json({ ok: true, status: 'approved' })
      }
      case 'reject': {
        await db.from('package_ideas').update({ status: 'rejected', rejected_reason: body.reason ?? null, updated_at: now }).eq('id', ideaId)
        return NextResponse.json({ ok: true, status: 'rejected' })
      }
      case 'saved': {
        const tcPackageId = Number(body.tcPackageId)
        if (!tcPackageId) return NextResponse.json({ error: 'tcPackageId obligatorio' }, { status: 400 })
        await db.from('package_ideas').update({ status: 'saved', tc_package_id: tcPackageId, saved_via: 'manual', updated_at: now }).eq('id', ideaId)
        await logEvent(db, { source: 'automation', action: 'idea.saved_manual', message: `Idea #${ideaId} guardada a mano en siviajo.com como SIV ${tcPackageId}`, details: { ideaId, tcPackageId } }, user ? { id: user.id, email: user.email } : null)
        return NextResponse.json({ ok: true, status: 'saved' })
      }
      case 'update': {
        const allowed = ['origin', 'month', 'departure_date', 'flexibility', 'nights', 'adults', 'children', 'children_ages', 'regimen', 'stars_min', 'direct_flight', 'hotel_preferred', 'budget_max_pp', 'notes', 'title']
        const fields = Object.fromEntries(Object.entries(body.fields ?? {}).filter(([k]) => allowed.includes(k)))
        await db.from('package_ideas').update({ ...fields, status: 'draft', updated_at: now }).eq('id', ideaId)
        return NextResponse.json({ ok: true, status: 'draft' })
      }
      default:
        return NextResponse.json({ error: 'action inválida' }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
