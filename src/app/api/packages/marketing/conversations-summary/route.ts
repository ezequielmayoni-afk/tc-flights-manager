import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * GET /api/packages/marketing/conversations-summary?days=7
 *
 * Devuelve, por cada paquete en marketing, métricas agregadas de Meta:
 *   - ads_count: ads activos (no DELETED) en BD
 *   - spend: suma de gasto
 *   - conversations: suma de messaging_conversations_started
 *   - cost_per_conversation: spend / conversations
 *
 * Los datos salen de meta_ad_insights (snapshot guardado por /api/meta/insights/sync).
 * Si la BD está desactualizada, el frontend puede llamar a /api/meta/insights/sync primero.
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10)
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return NextResponse.json({ error: 'days debe ser entre 1 y 365' }, { status: 400 })
  }

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - days)
  const since = sinceDate.toISOString().slice(0, 10)

  const db = createAdminClient()

  // 1) Paquetes en marketing
  const { data: packages, error: pkgErr } = await db
    .from('packages')
    .select('id, tc_package_id, title, current_price_per_pax, currency')
    .eq('send_to_marketing', true)
  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })
  if (!packages || packages.length === 0) return NextResponse.json({ packages: [], period_days: days })

  const packageIds = packages.map((p) => p.id)

  // 2) Ads del paquete (no DELETED)
  const { data: ads } = await db
    .from('meta_ads')
    .select('package_id, meta_ad_id, status, meta_status')
    .in('package_id', packageIds)
    .neq('status', 'DELETED')
    .limit(50000)

  const adIdsByPkg = new Map<number, string[]>()
  const allAdIds: string[] = []
  const activeCountByPkg = new Map<number, number>()
  for (const a of ads || []) {
    if (!a.meta_ad_id) continue
    if (!adIdsByPkg.has(a.package_id)) adIdsByPkg.set(a.package_id, [])
    adIdsByPkg.get(a.package_id)!.push(a.meta_ad_id)
    allAdIds.push(a.meta_ad_id)
    if (a.meta_status === 'ACTIVE' || a.status === 'ACTIVE') {
      activeCountByPkg.set(a.package_id, (activeCountByPkg.get(a.package_id) || 0) + 1)
    }
  }

  // 3) Insights agregados desde el período seleccionado
  const insightsByAdId = new Map<string, { spend: number; conversations: number; impressions: number; clicks: number }>()
  if (allAdIds.length > 0) {
    // Paginar para evitar el cap de 1000 filas de supabase
    const CHUNK = 500
    for (let i = 0; i < allAdIds.length; i += CHUNK) {
      const slice = allAdIds.slice(i, i + CHUNK)
      const { data: rows } = await db
        .from('meta_ad_insights')
        .select('meta_ad_id, spend, messaging_conversations_started, impressions, clicks')
        .in('meta_ad_id', slice)
        .gte('date_start', since)
        .limit(50000)
      for (const r of rows || []) {
        const prev = insightsByAdId.get(r.meta_ad_id) || { spend: 0, conversations: 0, impressions: 0, clicks: 0 }
        prev.spend += Number(r.spend) || 0
        prev.conversations += Number(r.messaging_conversations_started) || 0
        prev.impressions += Number(r.impressions) || 0
        prev.clicks += Number(r.clicks) || 0
        insightsByAdId.set(r.meta_ad_id, prev)
      }
    }
  }

  // 4) Agregación por paquete
  const result = packages.map((p) => {
    const adIds = adIdsByPkg.get(p.id) || []
    let spend = 0
    let conversations = 0
    let impressions = 0
    let clicks = 0
    for (const adId of adIds) {
      const ins = insightsByAdId.get(adId)
      if (!ins) continue
      spend += ins.spend
      conversations += ins.conversations
      impressions += ins.impressions
      clicks += ins.clicks
    }
    return {
      package_id: p.id,
      tc_package_id: p.tc_package_id,
      title: p.title,
      price_per_pax: p.current_price_per_pax,
      currency: p.currency,
      ads_total: adIds.length,
      ads_active: activeCountByPkg.get(p.id) || 0,
      spend: Math.round(spend * 100) / 100,
      conversations,
      cost_per_conversation: conversations > 0 ? Math.round((spend / conversations) * 100) / 100 : null,
      impressions,
      clicks,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
    }
  })

  // Ordenar por conversaciones desc (las más ruidosas arriba)
  result.sort((a, b) => b.conversations - a.conversations)

  return NextResponse.json({
    packages: result,
    period_days: days,
    since,
    totals: {
      spend: Math.round(result.reduce((s, p) => s + p.spend, 0) * 100) / 100,
      conversations: result.reduce((s, p) => s + p.conversations, 0),
    },
  })
}
