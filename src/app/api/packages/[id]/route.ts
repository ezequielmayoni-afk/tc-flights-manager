import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

// Supabase client with service role for server operations

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/packages/[id]
 * Get a single package with all related data
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const db = createAdminClient()

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
      return errorResponse(error)
    }

    return NextResponse.json(pkg)
  } catch (error) {
    console.error('[Package] Error:', error)
    return errorResponse(error)
  }
}

/**
 * PATCH /api/packages/[id]
 * Update a single package
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const db = createAdminClient()

  try {
    const body = await request.json()

    // Allowed fields to update
    const allowedFields = [
      'status',
      'send_to_design',
      'design_completed',
      'send_to_marketing',
      'marketing_completed',
      'marketing_status',
      'ads_created_count',
      'ads_active_count',
      'needs_manual_quote',
      'seo_title',
      'seo_description',
      'ai_description',
      'in_sitemap',
      'requote_status',
      'seo_uploaded_to_tc',
      'title',
      'meta_campaign_id',
      'meta_adset_ids',
      'meta_ad_account_id',
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

      // Enviar a diseño activa el monitoreo, igual que la acción masiva 'design',
      // salvo en los paquetes de cupo. Si ya estaba monitoreado no se toca, para no
      // perder el target_price ni el estado de recotización que ya tenía.
      const { data: current } = await db
        .from('packages')
        .select('monitor_enabled, current_price_per_pax')
        .eq('id', id)
        .single()

      const cupoPackageIds = await getCupoPackageIds(db, [Number(id)])

      if (current && !current.monitor_enabled && !cupoPackageIds.has(Number(id))) {
        updates.monitor_enabled = true
        if (updates.requote_status === undefined) {
          updates.requote_status = 'pending'
        }
        updates.target_price = current.current_price_per_pax
      }
    }
    if (updates.design_completed === true) {
      updates.design_completed_at = new Date().toISOString()
    }
    if (updates.send_to_marketing === true) {
      updates.send_to_marketing_at = new Date().toISOString()
      // Sincronizar status como source of truth — sin esto los dashboards
      // /packages y /packages/comercial muestran counts diferentes que /packages/marketing.
      // Se desincronizaba antes porque solo bulk-action seteaba ambos campos juntos.
      if (updates.status === undefined) {
        updates.status = 'in_marketing'
      }
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
      return errorResponse(error)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Package] Error:', error)
    return errorResponse(error)
  }
}

/**
 * DELETE /api/packages/[id]
 * Delete a package (soft delete by setting status to 'expired')
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const db = createAdminClient()

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
      return errorResponse(error)
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
    return errorResponse(error)
  }
}
