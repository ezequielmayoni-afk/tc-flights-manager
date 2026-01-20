import { createClient } from '@supabase/supabase-js'
import { MarketingTable } from '@/components/marketing/MarketingTable'
import { CreativesReadyPanel } from '@/components/marketing/CreativesReadyPanel'
import { PromptIAButton } from '@/components/marketing/PromptIAButton'
import Link from 'next/link'
import { BarChart3, Settings, AlertTriangle } from 'lucide-react'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const dynamic = 'force-dynamic'

export default async function MarketingPage() {
  const db = getSupabaseClient()

  // Get packages that are in marketing
  let { data: packages, error } = await db
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      current_price_per_pax,
      currency,
      departure_date,
      date_range_start,
      date_range_end,
      nights_count,
      marketing_status,
      marketing_expiration_date,
      ads_created_count,
      total_ad_spend,
      total_leads,
      creative_update_needed,
      creative_update_reason,
      price_at_creative_creation
    `)
    .eq('send_to_marketing', true)
    .order('created_at', { ascending: false })

  // Sync ads_created_count for all packages (recalculate from meta_ads table)
  if (packages && packages.length > 0) {
    const packageIds = packages.map(p => p.id)

    // Get actual ad counts from meta_ads table
    const { data: adCounts } = await db
      .from('meta_ads')
      .select('package_id')
      .in('package_id', packageIds)
      .neq('status', 'DELETED')

    // Count ads per package
    const countsByPackage: Record<number, number> = {}
    adCounts?.forEach(ad => {
      countsByPackage[ad.package_id] = (countsByPackage[ad.package_id] || 0) + 1
    })

    // Update packages that have mismatched counts
    for (const pkg of packages) {
      const actualCount = countsByPackage[pkg.id] || 0
      if (pkg.ads_created_count !== actualCount) {
        await db
          .from('packages')
          .update({ ads_created_count: actualCount })
          .eq('id', pkg.id)
        pkg.ads_created_count = actualCount // Update local data too
      }
    }
  }

  // Get pending creative requests count
  const { count: pendingRequestsCount } = await db
    .from('creative_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  // Get completed creative requests (ready to upload to Meta)
  const { data: completedRequests } = await db
    .from('creative_requests')
    .select(`
      id,
      package_id,
      tc_package_id,
      reason,
      reason_detail,
      priority,
      completed_at,
      packages:package_id (
        title,
        current_price_per_pax,
        currency,
        price_at_creative_creation
      )
    `)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching marketing packages:', error)
  }

  // Calculate stats
  const now = new Date()
  const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

  // Find packages expiring in the next 15 days
  const expiringPackages = packages?.filter((p) => {
    if (!p.marketing_expiration_date) return false
    const expDate = new Date(p.marketing_expiration_date)
    return expDate >= now && expDate <= in15Days
  }) || []

  const stats = {
    total: packages?.length || 0,
    pending: packages?.filter((p) => !p.ads_created_count || p.ads_created_count === 0).length || 0,
    copyGenerated: packages?.filter((p) => p.marketing_status === 'copy_generated').length || 0,
    active: packages?.filter((p) => p.marketing_status === 'active').length || 0,
    needsUpdate: packages?.filter((p) => p.creative_update_needed).length || 0,
    totalSpend: packages?.reduce((sum, p) => sum + (p.total_ad_spend || 0), 0) || 0,
    totalLeads: packages?.reduce((sum, p) => sum + (p.total_leads || 0), 0) || 0,
    pendingRequests: pendingRequestsCount || 0,
    totalAds: packages?.reduce((sum, p) => sum + (p.ads_created_count || 0), 0) || 0,
    expiringCount: expiringPackages.length,
    expiringIds: expiringPackages.map(p => p.tc_package_id),
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="text-muted-foreground">
            Gestiona los anuncios de Meta Ads para tus paquetes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PromptIAButton />
          <Link
            href="/packages/marketing/settings"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted transition-colors"
          >
            <Settings className="h-4 w-4" />
            Notificaciones
          </Link>
          <Link
            href="/packages/marketing/analytics"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </Link>
        </div>
      </div>

      {/* Panel de creativos listos para subir */}
      {completedRequests && completedRequests.length > 0 && (
        <CreativesReadyPanel requests={completedRequests as any} />
      )}

      {/* Alert Banner for packages needing update */}
      {stats.needsUpdate > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900">
              {stats.needsUpdate} paquete{stats.needsUpdate > 1 ? 's' : ''} necesita{stats.needsUpdate > 1 ? 'n' : ''} actualización de creativos
            </p>
            <p className="text-sm text-amber-700">
              El precio cambió desde que se crearon los creativos. Solicita nuevos diseños.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Paquetes</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Total Anuncios</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalAds}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Sin Anuncios</p>
          <p className="text-2xl font-bold text-red-600">{stats.pending}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Copy Generado</p>
          <p className="text-2xl font-bold text-blue-600">{stats.copyGenerated}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Activos</p>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        {stats.needsUpdate > 0 && (
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-700">Actualizar</p>
            <p className="text-2xl font-bold text-amber-600">{stats.needsUpdate}</p>
          </div>
        )}
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Gasto Total</p>
          <p className="text-2xl font-bold">${stats.totalSpend.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Leads Totales</p>
          <p className="text-2xl font-bold text-purple-600">{stats.totalLeads}</p>
        </div>
      </div>

      {/* Alert for expiring packages */}
      {stats.expiringCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-orange-900">
                {stats.expiringCount} paquete{stats.expiringCount > 1 ? 's' : ''} vence{stats.expiringCount > 1 ? 'n' : ''} en los próximos 15 días
              </p>
              <p className="text-sm text-orange-700 mt-1">
                IDs: {stats.expiringIds.join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border">
        <MarketingTable packages={packages || []} />
      </div>
    </div>
  )
}
