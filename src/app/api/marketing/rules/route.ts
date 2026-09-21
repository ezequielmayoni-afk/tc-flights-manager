import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRules } from '@/lib/marketing/evaluate'
import { DEFAULT_FAMILY_WEIGHTS, DEFAULT_WEIGHTS } from '@/lib/marketing/criteria'

export const dynamic = 'force-dynamic'

/** GET /api/marketing/rules — reglas vigentes + cuántos paquetes hay por vía. */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const rules = await loadRules(db)
    const { data } = await db.from('packages').select('marketing_track, marketing_evaluated_at').eq('tc_active', true).not('status', 'in', '("expired","not_visible")')
    const byTrack: Record<string, number> = {}
    let lastEvaluatedAt: string | null = null
    for (const r of (data ?? []) as Array<{ marketing_track: string | null; marketing_evaluated_at: string | null }>) {
      const t = r.marketing_track ?? 'undecided'; byTrack[t] = (byTrack[t] ?? 0) + 1
      if (r.marketing_evaluated_at && (!lastEvaluatedAt || r.marketing_evaluated_at > lastEvaluatedAt)) lastEvaluatedAt = r.marketing_evaluated_at
    }
    return NextResponse.json({ rules, weightKeys: Object.keys(DEFAULT_WEIGHTS), familyKeys: [...new Set([...Object.keys(DEFAULT_FAMILY_WEIGHTS), 'usa', 'europa', 'medio_oriente_asia', ...Object.keys(rules.familyWeights)])], byTrack, lastEvaluatedAt })
  } catch (error) {
    return errorResponse(error)
  }
}

const patchSchema = z.object({
  weights: z.record(z.string(), z.number().min(-100).max(100)).optional(),
  marketingMin: z.number().min(0).max(100).optional(),
  manualMin: z.number().min(-100).max(100).optional(),
  marginGoodPct: z.number().min(0).max(100).optional(),
  marginGreatPct: z.number().min(0).max(100).optional(),
  marginBadPct: z.number().min(0).max(100).optional(),
  minDaysToDeparture: z.number().int().min(0).max(365).optional(),
  cupoMinSeats: z.number().int().min(0).max(500).optional(),
  cupoWindowFromDays: z.number().int().min(0).max(365).optional(),
  cupoWindowToDays: z.number().int().min(0).max(730).optional(),
  maxInMarketingPerDestination: z.number().int().min(1).max(50).optional(),
  ticketLowUsd: z.number().min(0).max(20000).optional(),
  ticketHighUsd: z.number().min(0).max(50000).optional(),
  familyWeights: z.record(z.string(), z.number().min(-100).max(100)).optional(),
  autoApprove: z.boolean().optional(),
})

/** PATCH /api/marketing/rules — cambia pesos y umbrales; la próxima evaluación los usa. */
export async function PATCH(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const p = parsed.data
    const db = createAdminClient()
    const current = await loadRules(db)
    const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user?.email ?? null }
    if (p.weights) row.weights = { ...current.weights, ...p.weights }
    if (p.familyWeights) row.family_weights = { ...current.familyWeights, ...p.familyWeights }
    const map: Array<[keyof typeof p, string]> = [['marketingMin', 'marketing_min'], ['manualMin', 'manual_min'], ['marginGoodPct', 'margin_good_pct'], ['marginGreatPct', 'margin_great_pct'], ['marginBadPct', 'margin_bad_pct'], ['minDaysToDeparture', 'min_days_to_departure'], ['cupoMinSeats', 'cupo_min_seats'], ['cupoWindowFromDays', 'cupo_window_from_days'], ['cupoWindowToDays', 'cupo_window_to_days'], ['maxInMarketingPerDestination', 'max_in_marketing_per_destination'], ['ticketLowUsd', 'ticket_low_usd'], ['ticketHighUsd', 'ticket_high_usd'], ['autoApprove', 'auto_approve']]
    for (const [k, col] of map) if (p[k] !== undefined) row[col] = p[k]
    const { error } = await db.from('marketing_rules').update(row).eq('id', 1)
    if (error) throw new Error(error.message)
    await logEvent(db, { source: 'marketing', action: 'marketing.rules_updated', message: `Reglas del criterio marketing actualizadas (${Object.keys(row).filter(k => !['updated_at', 'updated_by'].includes(k)).join(', ')})`, details: row }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, rules: await loadRules(db) })
  } catch (error) {
    return errorResponse(error)
  }
}
