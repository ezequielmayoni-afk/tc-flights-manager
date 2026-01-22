import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { DesignTable } from '@/components/packages/DesignTable'
import { CreativeRequestsPanel } from '@/components/design/CreativeRequestsPanel'
import { DesignPageHeader } from '@/components/design/DesignPageHeader'
import { listPackageCreatives } from '@/lib/google-drive/client'

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
      creative_update_needed
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

async function getDesignStats() {
  const supabase = await createClient()

  const [{ count: totalCount }, { count: pendingCount }, { count: completedCount }] = await Promise.all([
    supabase
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('send_to_design', true),
    supabase
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('send_to_design', true)
      .eq('design_completed', false),
    supabase
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('send_to_design', true)
      .eq('design_completed', true),
  ])

  return {
    total: totalCount || 0,
    pending: pendingCount || 0,
    completed: completedCount || 0,
  }
}

// Get creative counts for all packages (from Google Drive)
async function getCreativeCounts(packages: PackageForDesign[]): Promise<Record<number, number>> {
  const counts: Record<number, number> = {}

  // Fetch creatives for each package in parallel (limit concurrency to avoid rate limits)
  const batchSize = 5
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (pkg) => {
        try {
          const creatives = await listPackageCreatives(pkg.tc_package_id)
          return { id: pkg.id, count: creatives.length }
        } catch (error) {
          console.error(`Error fetching creatives for package ${pkg.tc_package_id}:`, error)
          return { id: pkg.id, count: 0 }
        }
      })
    )
    for (const result of results) {
      counts[result.id] = result.count
    }
  }

  return counts
}

export default async function DesignPage() {
  const [packages, stats, creativeRequests] = await Promise.all([
    getDesignPackages(),
    getDesignStats(),
    getPendingCreativeRequests(),
  ])

  // Fetch creative counts for all packages
  const creativeCounts = await getCreativeCounts(packages)

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
