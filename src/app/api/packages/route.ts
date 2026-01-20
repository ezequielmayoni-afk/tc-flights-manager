import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithRole } from '@/lib/auth'

// Supabase client with service role for server operations
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Check authentication: API Key for external systems OR session for Hub users
async function checkAuth(request: NextRequest): Promise<boolean> {
  // Check API Key header first (for external systems)
  const apiKey = request.headers.get('X-API-Key')
  if (apiKey && apiKey === process.env.HUB_API_KEY) {
    return true
  }

  // Fall back to session auth (for Hub users)
  const user = await getUserWithRole()
  return !!user
}

/**
 * GET /api/packages
 * List all packages with optional filtering
 *
 * Returns packages with related data: destinations, transports, hotels
 *
 * Query params:
 * - tc_package_id: Filter by TC package ID (exact match)
 * - status: Filter by status (imported, reviewing, approved, in_design, in_marketing, published, expired)
 * - needs_quote: Filter by needs_manual_quote (true/false)
 * - active: Filter by tc_active (true/false)
 * - search: Search in title
 * - limit: Number of results (default 50)
 * - offset: Pagination offset (default 0)
 * - sort: Field to sort by (default: created_at)
 * - order: Sort order (asc/desc, default: desc)
 * - include: Level of detail - 'full' for all relations, otherwise minimal fields (OPTIMIZED)
 */
export async function GET(request: NextRequest) {
  // Check authentication (API Key or session)
  const isAuthorized = await checkAuth(request)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)

  try {
    // Parse query params
    const tcPackageId = searchParams.get('tc_package_id')
    const status = searchParams.get('status')
    const needsQuote = searchParams.get('needs_quote')
    const active = searchParams.get('active')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sort = searchParams.get('sort') || 'created_at'
    const order = searchParams.get('order') === 'asc' ? true : false
    const includeRelations = searchParams.get('include') === 'full'

    // OPTIMIZED: Only fetch full relations when explicitly requested
    // For list views, fetch only the essential fields to reduce response size
    const selectQuery = includeRelations
      ? `
        *,
        package_destinations (*),
        package_transports (
          *,
          package_transport_segments (*)
        ),
        package_hotels (
          *,
          package_hotel_images (*),
          package_hotel_rooms (*)
        ),
        package_transfers (*),
        package_closed_tours (*),
        package_cars (*),
        package_tickets (*),
        package_images (*),
        package_insurances (*),
        package_service_prices (*),
        package_cost_breakdown (*),
        package_price_history (*)
      `
      : `
        id, tc_package_id, title, large_title, current_price_per_pax, currency,
        departure_date, date_range_start, date_range_end,
        nights_count, adults_count, children_count, destinations_count,
        status, tc_active, needs_manual_quote,
        ads_created_count, image_url, created_at, last_sync_at,
        send_to_design, design_completed, send_to_marketing, marketing_completed
      `

    // Build query with appropriate fields
    let query = db
      .from('packages')
      .select(selectQuery, { count: 'exact' })

    // Apply filters
    if (tcPackageId) {
      query = query.eq('tc_package_id', parseInt(tcPackageId))
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (needsQuote === 'true') {
      query = query.eq('needs_manual_quote', true)
    } else if (needsQuote === 'false') {
      query = query.eq('needs_manual_quote', false)
    }

    if (active === 'true') {
      query = query.eq('tc_active', true)
    } else if (active === 'false') {
      query = query.eq('tc_active', false)
    }

    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    // Apply sorting and pagination
    query = query
      .order(sort, { ascending: order })
      .range(offset, offset + limit - 1)

    const { data: packages, error, count } = await query

    if (error) {
      console.error('[Packages] Error fetching:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      packages: packages || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    })
  } catch (error) {
    console.error('[Packages] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/packages
 * Bulk update packages
 *
 * Body:
 * - ids: Array of package IDs to update
 * - updates: Object with fields to update
 */
export async function PATCH(request: NextRequest) {
  // Check authentication (API Key or session)
  const isAuthorized = await checkAuth(request)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { ids, updates } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates object is required' }, { status: 400 })
    }

    // Allowed fields to update
    const allowedFields = [
      'status',
      'send_to_design',
      'design_completed',
      'send_to_marketing',
      'marketing_completed',
      'needs_manual_quote',
      'seo_title',
      'seo_description',
      'ai_description',
      'in_sitemap',
    ]

    // Filter updates to only allowed fields
    const filteredUpdates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Add timestamps for workflow fields
    if (filteredUpdates.design_completed === true) {
      filteredUpdates.design_completed_at = new Date().toISOString()
    }
    if (filteredUpdates.marketing_completed === true) {
      filteredUpdates.marketing_completed_at = new Date().toISOString()
    }

    const { data, error } = await db
      .from('packages')
      .update(filteredUpdates)
      .in('id', ids)
      .select()

    if (error) {
      console.error('[Packages] Error updating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      updated: data?.length || 0,
      packages: data,
    })
  } catch (error) {
    console.error('[Packages] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
