import { NextRequest, NextResponse } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

/**
 * GET /api/meta/campaigns-with-adsets
 *
 * Devuelve todas las campañas con sus ad sets, agrupados.
 * Útil para el modal de "Replicar ads" donde el user elige destinos.
 *
 * Query params:
 *   ?ad_account_id=act_XXX   → override del default account
 *   ?status=ACTIVE           → filtrar solo activos (default: incluye PAUSED)
 *
 * Respuesta:
 * {
 *   campaigns: [
 *     {
 *       id: "120239...",
 *       name: "Caribe Test 2026",
 *       status: "ACTIVE",
 *       objective: "OUTCOME_SALES",
 *       ad_account_id: "act_271148251050653",
 *       adsets: [
 *         { id, name, status, optimization_goal, ... }
 *       ]
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const adAccountId = request.nextUrl.searchParams.get('ad_account_id') || undefined
  const statusFilter = request.nextUrl.searchParams.get('status')

  try {
    const accountId = adAccountId || process.env.META_AD_ACCOUNT_ID || ''
    const token = process.env.META_ACCESS_TOKEN!
    const client = getMetaAdsClient(adAccountId)

    // PERFORMANCE: NO usar client.getCampaigns() porque itera TODA la paginación
    // (cuentas grandes como SRI TOUR tienen 1000+ campañas históricas DELETED).
    // Filtramos del lado de Meta con effective_status para que vuelvan solo ACTIVE/PAUSED.
    const fields = 'id,name,status,objective'
    const effectiveStatus = encodeURIComponent('["ACTIVE","PAUSED"]')
    const campaignsResp = await fetch(
      `https://graph.facebook.com/v22.0/${accountId}/campaigns?fields=${fields}&effective_status=${effectiveStatus}&limit=200&access_token=${token}`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (!campaignsResp.ok) {
      const t = await campaignsResp.text()
      return NextResponse.json({ error: `Meta ${campaignsResp.status}: ${t.slice(0, 200)}` }, { status: 502 })
    }
    const campaignsData = await campaignsResp.json() as { data: Array<{ id: string; name: string; status: string; objective: string }> }
    let campaigns = campaignsData.data || []
    if (statusFilter) campaigns = campaigns.filter((c) => c.status === statusFilter)

    const usableStatuses = new Set(['ACTIVE', 'PAUSED'])
    console.log(`[campaigns-with-adsets] account ${accountId}: ${campaigns.length} campañas usables`)

    const out: Array<{
      id: string
      name: string
      status: string
      objective: string
      ad_account_id: string
      adsets: Array<{ id: string; name: string; status: string; optimization_goal?: string }>
    }> = []

    // Concurrency batch (avoid hitting Meta rate limits)
    const batchSize = 8
    for (let i = 0; i < campaigns.length; i += batchSize) {
      const batch = campaigns.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map((c) => client.getAdSetsByCampaign(c.id))
      )
      results.forEach((res, idx) => {
        const c = batch[idx]
        const allAdsets = res.status === 'fulfilled' ? res.value : []
        // Filtrar adsets DELETED/ARCHIVED — el modal solo necesita los usables
        const adsets = allAdsets.filter((a) => usableStatuses.has(a.status))
        out.push({
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          ad_account_id: adAccountId || process.env.META_AD_ACCOUNT_ID || '',
          adsets: adsets.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            optimization_goal: a.optimization_goal,
          })),
        })
      })
    }

    // Ordenar: ACTIVE primero, después PAUSED
    out.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ campaigns: out, total_scanned: campaignsData.data?.length || 0, total_usable: campaigns.length })
  } catch (error) {
    return errorResponse(error)
  }
}
