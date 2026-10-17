import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { waitingHours, type CupoRequest } from '@/lib/cupos/requests'

export const dynamic = 'force-dynamic'

/** GET /api/cupos/requests — todos los pedidos con resumen de tiradas y horas de espera. */
export async function GET() {
  const { authorized } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const [{ data: requests, error }, { data: options }] = await Promise.all([
      db.from('cupo_requests').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }),
      db.from('cupo_request_options').select('request_id, status, system_price_pp, airline_price_pp'),
    ])
    if (error) throw new Error(error.message)
    const byReq = new Map<number, { total: number; quoted: number; accepted: number; minSystem: number | null }>()
    for (const o of (options ?? []) as Array<{ request_id: number; status: string; system_price_pp: number | string | null; airline_price_pp: number | string | null }>) {
      const e = byReq.get(o.request_id) ?? { total: 0, quoted: 0, accepted: 0, minSystem: null }
      e.total++; if (o.airline_price_pp !== null) e.quoted++; if (o.status === 'accepted' || o.status === 'loaded') e.accepted++
      const sp = o.system_price_pp === null ? null : Number(o.system_price_pp); if (sp !== null && (e.minSystem === null || sp < e.minSystem)) e.minSystem = sp
      byReq.set(o.request_id, e)
    }
    const now = new Date()
    return NextResponse.json({ requests: ((requests ?? []) as unknown as CupoRequest[]).map(r => ({ ...r, summary: byReq.get(r.id) ?? { total: 0, quoted: 0, accepted: 0, minSystem: null }, waitingHours: waitingHours(r, now), overdue: Boolean(r.response_deadline_at && !r.answered_at && r.status === 'sent' && Date.parse(r.response_deadline_at) < now.getTime()) })) })
  } catch (error) {
    return errorResponse(error)
  }
}

const createSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  originCode: z.string().trim().min(2).max(10).default('BUE'),
  originName: z.string().trim().max(80).optional(),
  destinationCode: z.string().trim().min(2).max(12),
  destinationName: z.string().trim().min(2).max(80),
  destinationProfileCode: z.string().trim().max(20).nullable().optional(),
  months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(6),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([4, 6]),
  nights: z.number().int().min(1).max(30),
  seatsRequested: z.number().int().min(1).max(500),
  adults: z.number().int().min(1).max(9).default(2),
  childrenAges: z.array(z.number().int().min(0).max(17)).max(6).default([]),
  airlinePref: z.array(z.string().trim().min(2).max(30)).max(5).default([]),
  directOnly: z.boolean().default(false),
  maxOptions: z.number().int().min(3).max(12).default(5),
  notes: z.string().trim().max(600).nullable().optional(),
  probeNow: z.boolean().default(true),
})

/** POST /api/cupos/requests — crea un pedido (borrador) y, por defecto, encola el armado de tiradas. */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const p = parsed.data
    const db = createAdminClient()
    const monthsLabel = p.months.map(m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })).join('/')
    const title = p.title ?? `${p.originCode} → ${p.destinationName} · ${monthsLabel} · ${p.seatsRequested} lugares`
    const actor = user?.email ?? 'ui'
    const { data, error } = await db.from('cupo_requests').insert({
      title, origin_code: p.originCode.toUpperCase(), origin_name: p.originName ?? null, destination_code: p.destinationCode, destination_name: p.destinationName, destination_profile_code: p.destinationProfileCode ?? null,
      months: p.months, weekdays: p.weekdays, nights: p.nights, seats_requested: p.seatsRequested, adults: p.adults, children_ages: p.childrenAges, airline_pref: p.airlinePref, direct_only: p.directOnly, max_options: p.maxOptions, notes: p.notes ?? null, requested_by: actor,
    }).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'No se pudo crear el pedido')
    let jobId: number | null = null
    if (p.probeNow) {
      const job = await enqueueJob(db, { kind: 'cupo.probe', payload: { requestId: data.id, actor }, priority: MANUAL_PRIORITY, dedupeKey: `cupo.probe:${data.id}`, entityType: 'cupo_request', entityId: data.id, createdBy: actor })
      jobId = job.id
      await db.from('cupo_requests').update({ status: 'probing', probe_job_id: job.id }).eq('id', data.id)
    }
    await logEvent(db, { source: 'cupos', action: 'cupo_request.created', message: `Pedido de cupos #${data.id}: ${title}`, entityType: 'cupo_request', entityId: data.id, details: { ...p, jobId } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, id: data.id, jobId }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
