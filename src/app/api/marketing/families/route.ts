import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadFamilies } from '@/lib/marketing/families'

export const dynamic = 'force-dynamic'

/** GET /api/marketing/families — familias + campañas y conjuntos conocidos (tablas locales sincronizadas de Meta). */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const [families, { data: campaigns }, { data: adsets }] = await Promise.all([
      loadFamilies(db),
      db.from('meta_campaigns').select('meta_campaign_id, name, status, objective, daily_budget').order('name'),
      db.from('meta_adsets').select('meta_adset_id, meta_campaign_id, name, status, daily_budget, optimization_goal').order('updated_at', { ascending: false }),
    ])
    return NextResponse.json({ families, campaigns: campaigns ?? [], adsets: adsets ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

const patchSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().min(1).max(80).optional(),
  metaCampaignId: z.string().max(40).nullable().optional(),
  templateAdsetId: z.string().max(40).nullable().optional(),
  dailyBudgetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  targetCpconUsd: z.number().min(0).max(10_000).nullable().optional(),
  targetCpaUsd: z.number().min(0).max(100_000).nullable().optional(),
  maxActiveAdsPerAdset: z.number().int().min(1).max(20).optional(),
  autoLaunch: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(400).nullable().optional(),
})

/** PATCH /api/marketing/families — edita una familia (o la crea si la key es nueva). */
export async function PATCH(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const p = parsed.data
    const db = createAdminClient()
    const row: Record<string, unknown> = { key: p.key, updated_at: new Date().toISOString(), updated_by: user?.email ?? null }
    const map: Array<[keyof typeof p, string]> = [['name', 'name'], ['metaCampaignId', 'meta_campaign_id'], ['templateAdsetId', 'template_adset_id'], ['dailyBudgetCents', 'daily_budget_cents'], ['targetCpconUsd', 'target_cpcon_usd'], ['targetCpaUsd', 'target_cpa_usd'], ['maxActiveAdsPerAdset', 'max_active_ads_per_adset'], ['autoLaunch', 'auto_launch'], ['active', 'active'], ['notes', 'notes']]
    for (const [k, col] of map) if (p[k] !== undefined) row[col] = p[k]
    if (!('name' in row)) { const { data } = await db.from('marketing_families').select('key').eq('key', p.key).maybeSingle(); if (!data) row.name = p.key }
    const { error } = await db.from('marketing_families').upsert(row, { onConflict: 'key' })
    if (error) throw new Error(error.message)
    await logEvent(db, { source: 'marketing', action: 'marketing.family_updated', message: `Familia ${p.key} actualizada (${Object.keys(row).filter(k => !['key', 'updated_at', 'updated_by'].includes(k)).join(', ')})`, details: row }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, families: await loadFamilies(db) })
  } catch (error) {
    return errorResponse(error)
  }
}
