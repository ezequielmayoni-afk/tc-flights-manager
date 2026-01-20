import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Supabase client with service role for server operations
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/packages/[id]
 * Get a single package with all related data
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getSupabaseClient()

  try {
    const { data: pkg, error } = await db
      .from('packages')
      .select(`
        *,
        package_destinations(*),
        package_transports(*, package_transport_segments(*)),
        package_hotels(*, package_hotel_images(*)),
        package_transfers(*),
        package_closed_tours(*),
        package_cars(*),
        package_tickets(*),
        package_images(*),
        package_cost_breakdown(*),
        package_price_history(*),
        package_service_prices(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }
      console.error('[Package] Error fetching:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(pkg)
  } catch (error) {
    console.error('[Package] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/packages/[id]
 * Update a single package
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getSupabaseClient()

  try {
    const body = await request.json()

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
      'requote_status',
      'seo_uploaded_to_tc',
      'title',
    ]

    // Filter updates to only allowed fields
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        updates[key] = value
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Add timestamps for workflow fields
    if (updates.send_to_design === true) {
      updates.send_to_design_at = new Date().toISOString()
    }
    if (updates.design_completed === true) {
      updates.design_completed_at = new Date().toISOString()
    }
    if (updates.send_to_marketing === true) {
      updates.send_to_marketing_at = new Date().toISOString()
    }
    if (updates.marketing_completed === true) {
      updates.marketing_completed_at = new Date().toISOString()
    }

    // Track when manual quote is completed (requote_status changes to 'completed')
    if (updates.requote_status === 'completed') {
      updates.manual_quote_completed_at = new Date().toISOString()
    }

    // Reset seo_uploaded_to_tc when SEO fields are modified (so bot will re-upload)
    if (updates.seo_title !== undefined || updates.seo_description !== undefined || updates.title !== undefined) {
      updates.seo_uploaded_to_tc = false
    }

    // Record workflow change if status changed
    const oldStatus = body._oldStatus
    if (updates.status && oldStatus && updates.status !== oldStatus) {
      await db.from('package_workflow').insert({
        package_id: parseInt(id),
        department: 'system',
        action: 'status_change',
        from_status: oldStatus,
        to_status: updates.status,
      })
    }

    const { data, error } = await db
      .from('packages')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }
      console.error('[Package] Error updating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Package] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/packages/[id]
 * Delete a package (soft delete by setting status to 'expired')
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getSupabaseClient()

  try {
    // Get current package status
    const { data: pkg } = await db
      .from('packages')
      .select('status')
      .eq('id', id)
      .single()

    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    // Soft delete
    const { error } = await db
      .from('packages')
      .update({ status: 'expired', tc_active: false })
      .eq('id', id)

    if (error) {
      console.error('[Package] Error deleting:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Record workflow change
    await db.from('package_workflow').insert({
      package_id: parseInt(id),
      department: 'system',
      action: 'delete',
      from_status: pkg.status,
      to_status: 'expired',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Package] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
