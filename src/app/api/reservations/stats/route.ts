import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Cliente sin tipos para tablas no tipadas
function getUntypedClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getUntypedClient()
  const searchParams = request.nextUrl.searchParams

  // Date range filters
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  // Get all reservations within date range
  let query = supabase
    .from('reservations')
    .select('*')

  if (startDate) {
    // Argentina is UTC-3, so 00:00 local = 03:00 UTC
    query = query.gte('reservation_date', `${startDate}T03:00:00Z`)
  }

  if (endDate) {
    // End of day in Argentina (23:59:59 local) = 02:59:59 UTC next day
    const nextDay = new Date(endDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().split('T')[0]
    query = query.lte('reservation_date', `${nextDayStr}T02:59:59.999Z`)
  }

  const { data: reservations, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Calculate statistics
  const stats = {
    total: reservations?.length || 0,
    confirmed: 0,
    modified: 0,
    cancelled: 0,
    totalPassengers: 0,
    totalAdults: 0,
    totalChildren: 0,
    totalInfants: 0,
    totalRevenue: 0,
    byDay: {} as Record<string, {
      date: string
      reservations: number
      passengers: number
      revenue: number
    }>,
  }

  reservations?.forEach(r => {
    // Status counts
    if (r.status === 'confirmed') stats.confirmed++
    else if (r.status === 'modified') stats.modified++
    else if (r.status === 'cancelled') stats.cancelled++

    // Only count non-cancelled for totals
    if (r.status !== 'cancelled') {
      stats.totalAdults += r.adults || 0
      stats.totalChildren += r.children || 0
      stats.totalInfants += r.infants || 0
      stats.totalPassengers += (r.adults || 0) + (r.children || 0) + (r.infants || 0)
      stats.totalRevenue += Number(r.total_amount) || 0
    }

    // Group by day
    const dateStr = new Date(r.reservation_date).toISOString().split('T')[0]
    if (!stats.byDay[dateStr]) {
      stats.byDay[dateStr] = {
        date: dateStr,
        reservations: 0,
        passengers: 0,
        revenue: 0,
      }
    }
    stats.byDay[dateStr].reservations++
    if (r.status !== 'cancelled') {
      stats.byDay[dateStr].passengers += (r.adults || 0) + (r.children || 0) + (r.infants || 0)
      stats.byDay[dateStr].revenue += Number(r.total_amount) || 0
    }
  })

  // Convert byDay to sorted array
  const dailyStats = Object.values(stats.byDay).sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return NextResponse.json({
    ...stats,
    byDay: dailyStats,
  })
}
