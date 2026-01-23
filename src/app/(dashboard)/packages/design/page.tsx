import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { DesignTable } from '@/components/packages/DesignTable'
import { CreativeRequestsPanel } from '@/components/design/CreativeRequestsPanel'
import { DesignPageHeader } from '@/components/design/DesignPageHeader'

export type PackageForDesign = {
  id: number
  tc_package_id: number
  title: string
  date_range_start: string | null
  date_range_end: string | null
  current_price_per_pax: number | null
  currency: string
  transports_count: number
  hotels_count: number
  transfers_count: number
  tours_count: number
  tickets_count: number
  nights_count: number | null
  send_to_design_at: string | null
  status: string
  send_to_design: boolean
  send_to_marketing: boolean
  design_completed: boolean
  design_completed_at: string | null
  design_deadline: string | null
  creative_update_needed?: boolean
  creative_count: number // Now from DB instead of Google Drive API
}

async function getDesignPackages(): Promise<PackageForDesign[]> {
  const supabase = await createClient()

  const { data: packages, error } = await supabase
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      date_range_start,
      date_range_end,
      current_price_per_pax,
      currency,
      transports_count,
      hotels_count,
      transfers_count,
      tours_count,
      tickets_count,
      nights_count,
      send_to_design_at,
      status,
      send_to_design,
      send_to_marketing,
      design_completed,
      design_completed_at,
      design_deadline,
      creative_update_needed,
      creative_count
    `)
    .eq('send_to_design', true)
    .order('design_completed', { ascending: true })
    .order('send_to_design_at', { ascending: false })

  if (error) {
    console.error('Error fetching design packages:', error)
    return []
  }

  return (packages as PackageForDesign[]) || []
}

async function getPendingCreativeRequests() {
  const supabase = await createClient()

  const { data: requests, error } = await supabase
    .from('creative_requests')
    .select(`
      id,
      package_id,
      tc_package_id,
      reason,
      reason_detail,
      priority,
      status,
      requested_by,
      created_at,
      requested_variants,
      packages:package_id (
        title,
        current_price_per_pax,
        currency
      )
    `)
    .in('status', ['pending', 'in_progress'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching creative requests:', error)
    return []
  }

  return requests || []
}

// Compute stats from packages array instead of making 3 separate DB queries
function computeStats(packages: PackageForDesign[]) {
  const total = packages.length
  const pending = packages.filter(p => !p.design_completed).length
  const completed = packages.filter(p => p.design_completed).length

  return { total, pending, completed }
}

// Build creative counts map from packages (already have creative_count in DB)
function buildCreativeCounts(packages: PackageForDesign[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const pkg of packages) {
    counts[pkg.id] = pkg.creative_count || 0
  }
  return counts
}

export default async function DesignPage() {
  // Single parallel fetch - no more sequential Google Drive API calls!
  const [packages, creativeRequests] = await Promise.all([
    getDesignPackages(),
    getPendingCreativeRequests(),
  ])

  // Compute stats from already-fetched packages (saves 3 DB queries)
  const stats = computeStats(packages)

  // Build creative counts from DB field (saves 100+ Google Drive API calls)
  const creativeCounts = buildCreativeCounts(packages)

  return (
    <div className="flex flex-col h-full">
      <Header title="Diseño de Paquetes" />

      <div className="flex-1 p-6 space-y-6">
        <DesignPageHeader stats={stats} />

        {/* Creative Requests Panel */}
        {creativeRequests.length > 0 && (
          <CreativeRequestsPanel requests={creativeRequests} />
        )}

        <div className="bg-white rounded-lg border">
          <DesignTable packages={packages} creativeCounts={creativeCounts} />
        </div>
      </div>
    </div>
  )
}
