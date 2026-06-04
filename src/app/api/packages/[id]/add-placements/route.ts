import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * POST /api/packages/[id]/add-placements
 *
 * Registra campañas destino en pkg.meta_campaign_ids sin crear ads (placeholder).
 * Útil cuando todavía no hay creativos: el user reserva los adsets destino
 * para que aparezcan como "sin ads — agregá creativos" en la vista de marketing.
 *
 * Body: { campaign_ids: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const pkgId = parseInt(id)
  if (!pkgId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: { campaign_ids?: string[]; adset_ids?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const campaignIds = (body.campaign_ids || []).filter(Boolean)
  const adsetIds = (body.adset_ids || []).filter(Boolean)
  if (campaignIds.length === 0 && adsetIds.length === 0) {
    return NextResponse.json({ error: 'campaign_ids o adset_ids requerido' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: pkg } = await db
    .from('packages')
    .select('id, meta_campaign_ids, meta_reserved_adset_ids')
    .eq('id', pkgId)
    .maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'package not found' }, { status: 404 })

  const mergedCampaigns = Array.from(new Set([...(pkg.meta_campaign_ids || []), ...campaignIds]))
  const mergedAdsets = Array.from(new Set([...(pkg.meta_reserved_adset_ids || []), ...adsetIds]))
  const { error: updErr } = await db
    .from('packages')
    .update({ meta_campaign_ids: mergedCampaigns, meta_reserved_adset_ids: mergedAdsets })
    .eq('id', pkgId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    campaign_ids: mergedCampaigns,
    adset_ids: mergedAdsets,
    added_campaigns: campaignIds.length,
    added_adsets: adsetIds.length,
  })
}
