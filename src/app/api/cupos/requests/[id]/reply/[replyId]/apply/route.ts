import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest } from '@/lib/cupos/requests'
import type { ReplyProposal } from '@/lib/cupos/reply-extract'

export const dynamic = 'force-dynamic'

const schema = z.object({ proposals: z.array(z.object({ optionId: z.number().int().positive(), price_pp: z.number().min(0).nullable(), currency: z.string().max(3).default('USD'), seats_offered: z.number().int().min(0).nullable().optional(), available: z.boolean().nullable().optional(), notes: z.string().max(400).nullable().optional(), terms: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional() })).min(1) })

/** POST — aplica la propuesta leída (tal cual o corregida en pantalla) a las tiradas: precio, lugares y condiciones. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; replyId: string }> }) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id, replyId } = await params
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
    const db = createAdminClient()
    const loaded = await loadRequest(db, Number(id))
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const now = new Date().toISOString()
    const actor = user?.email ?? 'ui'
    const TERM_KEYS = ['deposit_pct', 'deposit_amount_pp', 'deposit_due_date', 'balance_due_date', 'release_date', 'name_list_due_date', 'valid_until', 'cancellation_terms', 'payment_conditions'] as const
    let applied = 0
    for (const p of parsed.data.proposals as Array<Partial<ReplyProposal> & { optionId: number }>) {
      const opt = loaded.options.find(o => o.id === p.optionId)
      if (!opt || opt.status === 'loaded') continue
      const row: Record<string, unknown> = { reply_id: Number(replyId), updated_at: now }
      if (p.available === false) { row.status = 'rejected'; row.decision_reason = p.notes ?? 'Sin disponibilidad según aéreos'; row.decided_by = actor; row.decided_at = now }
      else if (p.price_pp !== null && p.price_pp !== undefined) { row.airline_price_pp = p.price_pp; row.airline_currency = p.currency ?? 'USD'; row.airline_quoted_at = now; row.status = opt.status === 'accepted' ? 'accepted' : 'quoted' }
      if (p.notes !== undefined) row.airline_notes = p.notes
      if (p.seats_offered !== undefined) row.seats_offered = p.seats_offered
      for (const k of TERM_KEYS) { const v = p.terms?.[k]; if (v !== undefined && v !== null && v !== '') row[k] = v }
      const { error } = await db.from('cupo_request_options').update(row).eq('id', opt.id)
      if (!error) applied++
    }
    if (applied > 0) {
      await db.from('cupo_request_replies').update({ status: 'applied', applied_at: now, applied_by: actor }).eq('id', Number(replyId))
      if (['sent', 'ready', 'draft'].includes(loaded.request.status)) await db.from('cupo_requests').update({ status: 'answered', answered_at: loaded.request.answered_at ?? now, answered_by: loaded.request.answered_by ?? `${actor} (respuesta leída)`, updated_at: now }).eq('id', Number(id))
    }
    await logEvent(db, { source: 'cupos', action: 'cupo_reply.applied', message: `Pedido #${id}: respuesta ${replyId} aplicada a ${applied} tirada(s)`, entityType: 'cupo_request', entityId: Number(id), details: parsed.data }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, applied })
  } catch (error) {
    return errorResponse(error)
  }
}
