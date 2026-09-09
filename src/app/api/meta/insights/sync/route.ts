import { NextRequest, NextResponse } from 'next/server'
import type { DatePreset } from '@/lib/meta-ads/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { syncMetaInsights } from '@/lib/meta-ads/insights-sync'

/**
 * POST /api/meta/insights/sync
 * Sincroniza campañas, conjuntos, anuncios e insights desde Meta. La misma
 * lógica corre sola cada hora (job insights.sync); este botón la dispara a mano.
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const body = await request.json().catch(() => ({}))
    const { date_preset = 'last_7d' } = body as { date_preset?: DatePreset }
    const result = await syncMetaInsights(db, { datePreset: date_preset })
    if (result.totalAds === 0) {
      return NextResponse.json({ synced: 0, errors: 0, message: 'No ads found in the Meta account' })
    }
    return NextResponse.json({
      synced: result.synced,
      errors: result.errors,
      total_ads: result.totalAds,
      total_insights: result.totalInsights,
      campaigns_synced: result.campaignsSynced,
      adsets_synced: result.adsetsSynced,
    })
  } catch (error) {
    console.error('[Insights Sync] Error:', error)
    return errorResponse(error)
  }
}
