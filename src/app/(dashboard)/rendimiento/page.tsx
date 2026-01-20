import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RendimientoMetrics } from '@/components/rendimiento/RendimientoMetrics'

export const dynamic = 'force-dynamic'

export interface ManualQuoteMetrics {
  total: number
  avgResponseTimeHours: number | null
  items: {
    tc_package_id: number
    title: string
    notified_at: string
    completed_at: string
    responseTimeHours: number
  }[]
}

export interface DesignMetrics {
  total: number
  completed: number
  avgResponseTimeHours: number | null
  items: {
    id: number
    tc_package_id: number
    package_title: string
    reason: string
    priority: string
    assigned_to: string | null
    requested_by: string
    status: string
    created_at: string
    completed_at: string | null
    responseTimeHours: number | null
  }[]
}

export interface MarketingMetrics {
  total: number
  completed: number
  avgResponseTimeHours: number | null
  items: {
    id: number
    tc_package_id: number
    title: string
    destinations: string
    current_price_per_pax: number | null
    currency: string
    status: string
    send_to_marketing_at: string
    marketing_completed_at: string | null
    responseTimeHours: number | null
  }[]
}

interface NotificationLog {
  package_id: number | null
  sent_at: string | null
}

interface PackageManualQuote {
  id: number
  tc_package_id: number
  title: string
  manual_quote_completed_at: string | null
}

interface CreativeRequest {
  id: number
  tc_package_id: number
  reason: string
  priority: string
  assigned_to: string | null
  requested_by: string
  status: string
  created_at: string
  completed_at: string | null
  packages: { title: string } | null
}

interface PackageMarketing {
  id: number
  tc_package_id: number
  title: string
  current_price_per_pax: number | null
  currency: string
  status: string
  send_to_marketing_at: string | null
  marketing_completed_at: string | null
  package_destinations: { destination_name: string }[] | null
}

async function getManualQuoteMetrics(dateFrom?: string, dateTo?: string): Promise<ManualQuoteMetrics> {
  const supabase = await createClient()

  // Get notifications for needs_manual_quote
  let notificationsQuery = supabase
    .from('notification_logs')
    .select('package_id, sent_at')
    .eq('notification_type', 'needs_manual_quote')
    .eq('status', 'sent')

  if (dateFrom) {
    notificationsQuery = notificationsQuery.gte('sent_at', dateFrom)
  }
  if (dateTo) {
    notificationsQuery = notificationsQuery.lte('sent_at', dateTo)
  }

  const { data } = await notificationsQuery
  const notifications = data as NotificationLog[] | null

  if (!notifications || notifications.length === 0) {
    return { total: 0, avgResponseTimeHours: null, items: [] }
  }

  // Get packages with manual_quote_completed_at
  const packageIds = notifications.map(n => n.package_id).filter((id): id is number => id !== null)

  if (packageIds.length === 0) {
    return { total: 0, avgResponseTimeHours: null, items: [] }
  }

  const { data: packagesData } = await supabase
    .from('packages')
    .select('id, tc_package_id, title, manual_quote_completed_at')
    .in('id', packageIds)
    .not('manual_quote_completed_at', 'is', null)

  const packages = packagesData as PackageManualQuote[] | null

  if (!packages || packages.length === 0) {
    return { total: notifications.length, avgResponseTimeHours: null, items: [] }
  }

  // Match notifications with packages and calculate response times
  const items: ManualQuoteMetrics['items'] = []
  let totalResponseTime = 0

  for (const pkg of packages) {
    const notification = notifications.find(n => n.package_id === pkg.id)
    if (notification && notification.sent_at && pkg.manual_quote_completed_at) {
      const notifiedAt = new Date(notification.sent_at)
      const completedAt = new Date(pkg.manual_quote_completed_at)
      const responseTimeHours = (completedAt.getTime() - notifiedAt.getTime()) / (1000 * 60 * 60)

      if (responseTimeHours >= 0) {
        items.push({
          tc_package_id: pkg.tc_package_id,
          title: pkg.title,
          notified_at: notification.sent_at,
          completed_at: pkg.manual_quote_completed_at,
          responseTimeHours: Math.round(responseTimeHours * 10) / 10,
        })
        totalResponseTime += responseTimeHours
      }
    }
  }

  return {
    total: items.length,
    avgResponseTimeHours: items.length > 0 ? Math.round((totalResponseTime / items.length) * 10) / 10 : null,
    items: items.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()),
  }
}

async function getDesignMetrics(dateFrom?: string, dateTo?: string): Promise<DesignMetrics> {
  const supabase = await createClient()

  let query = supabase
    .from('creative_requests')
    .select(`
      id,
      tc_package_id,
      reason,
      priority,
      assigned_to,
      requested_by,
      status,
      created_at,
      completed_at,
      packages:package_id (title)
    `)

  if (dateFrom) {
    query = query.gte('created_at', dateFrom)
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo)
  }

  query = query.order('created_at', { ascending: false })

  const { data } = await query
  const requests = data as CreativeRequest[] | null

  if (!requests || requests.length === 0) {
    return { total: 0, completed: 0, avgResponseTimeHours: null, items: [] }
  }

  const items: DesignMetrics['items'] = []
  let totalResponseTime = 0
  let completedCount = 0

  for (const req of requests) {
    const pkg = req.packages
    let responseTimeHours: number | null = null

    if (req.completed_at) {
      completedCount++
      const createdAt = new Date(req.created_at)
      const completedAt = new Date(req.completed_at)
      responseTimeHours = (completedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

      if (responseTimeHours >= 0) {
        totalResponseTime += responseTimeHours
      }
    }

    items.push({
      id: req.id,
      tc_package_id: req.tc_package_id,
      package_title: pkg?.title || '',
      reason: req.reason,
      priority: req.priority,
      assigned_to: req.assigned_to,
      requested_by: req.requested_by,
      status: req.status,
      created_at: req.created_at,
      completed_at: req.completed_at,
      responseTimeHours: responseTimeHours !== null ? Math.round(responseTimeHours * 10) / 10 : null,
    })
  }

  return {
    total: requests.length,
    completed: completedCount,
    avgResponseTimeHours: completedCount > 0 ? Math.round((totalResponseTime / completedCount) * 10) / 10 : null,
    items,
  }
}

async function getMarketingMetrics(dateFrom?: string, dateTo?: string): Promise<MarketingMetrics> {
  const supabase = await createClient()

  let query = supabase
    .from('packages')
    .select(`
      id, tc_package_id, title, current_price_per_pax, currency, status,
      send_to_marketing_at, marketing_completed_at,
      package_destinations (destination_name)
    `)
    .eq('send_to_marketing', true)
    .not('send_to_marketing_at', 'is', null)

  if (dateFrom) {
    query = query.gte('send_to_marketing_at', dateFrom)
  }
  if (dateTo) {
    query = query.lte('send_to_marketing_at', dateTo)
  }

  query = query.order('send_to_marketing_at', { ascending: false })

  const { data } = await query
  const packages = data as PackageMarketing[] | null

  if (!packages || packages.length === 0) {
    return { total: 0, completed: 0, avgResponseTimeHours: null, items: [] }
  }

  const items: MarketingMetrics['items'] = []
  let totalResponseTime = 0
  let completedCount = 0

  for (const pkg of packages) {
    let responseTimeHours: number | null = null

    if (pkg.marketing_completed_at && pkg.send_to_marketing_at) {
      completedCount++
      const sentAt = new Date(pkg.send_to_marketing_at)
      const completedAt = new Date(pkg.marketing_completed_at)
      responseTimeHours = (completedAt.getTime() - sentAt.getTime()) / (1000 * 60 * 60)

      if (responseTimeHours >= 0) {
        totalResponseTime += responseTimeHours
      }
    }

    const destinations = pkg.package_destinations?.map(d => d.destination_name).join(', ') || ''

    items.push({
      id: pkg.id,
      tc_package_id: pkg.tc_package_id,
      title: pkg.title,
      destinations,
      current_price_per_pax: pkg.current_price_per_pax,
      currency: pkg.currency || 'USD',
      status: pkg.status,
      send_to_marketing_at: pkg.send_to_marketing_at!,
      marketing_completed_at: pkg.marketing_completed_at,
      responseTimeHours: responseTimeHours !== null ? Math.round(responseTimeHours * 10) / 10 : null,
    })
  }

  return {
    total: packages.length,
    completed: completedCount,
    avgResponseTimeHours: completedCount > 0 ? Math.round((totalResponseTime / completedCount) * 10) / 10 : null,
    items,
  }
}

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function RendimientoPage({ searchParams }: PageProps) {
  const params = await searchParams
  const dateFrom = params.from
  const dateTo = params.to

  const [manualQuoteMetrics, designMetrics, marketingMetrics] = await Promise.all([
    getManualQuoteMetrics(dateFrom, dateTo),
    getDesignMetrics(dateFrom, dateTo),
    getMarketingMetrics(dateFrom, dateTo),
  ])

  return (
    <div className="flex flex-col h-full">
      <Header title="Rendimiento del Equipo" />

      <div className="flex-1 p-6 space-y-6">
        <RendimientoMetrics
          manualQuote={manualQuoteMetrics}
          design={designMetrics}
          marketing={marketingMetrics}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </div>
    </div>
  )
}
