import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  sendSlackMessage,
  buildCreativeRequestMessage,
  buildCreativeCompletedMessage,
} from '@/lib/slack/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * GET /api/creative-requests
 * List creative requests with optional filters
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)

  const status = searchParams.get('status')
  const packageId = searchParams.get('package_id')
  const priority = searchParams.get('priority')

  try {
    let query = db
      .from('creative_requests')
      .select(`
        *,
        packages:package_id (
          id,
          tc_package_id,
          title,
          current_price_per_pax,
          currency
        )
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (packageId) {
      query = query.eq('package_id', parseInt(packageId))
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Creative Requests GET] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error fetching requests' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /api/creative-requests
 * Create a new creative request
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const {
      package_id,
      reason,
      reason_detail,
      priority = 'normal',
      variant,
      aspect_ratio,
      requested_by = 'Marketing',
      requested_variants,
    } = body

    if (!package_id || !reason) {
      return new Response(
        JSON.stringify({ error: 'package_id and reason are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get package info
    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('id, tc_package_id, title')
      .eq('id', package_id)
      .single()

    if (pkgError || !pkg) {
      return new Response(
        JSON.stringify({ error: 'Package not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create the request
    const { data: creativeRequest, error: insertError } = await db
      .from('creative_requests')
      .insert({
        package_id,
        tc_package_id: pkg.tc_package_id,
        reason,
        reason_detail,
        priority,
        variant,
        aspect_ratio,
        requested_by,
        requested_variants: requested_variants || null,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    // Mark package as needing creative update
    await db
      .from('packages')
      .update({
        creative_update_needed: true,
        creative_update_reason: reason,
        creative_update_requested_at: new Date().toISOString(),
        creative_update_requested_by: requested_by,
      })
      .eq('id', package_id)

    // Send Slack notification if enabled
    const { data: settings } = await db
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (settings?.slack_enabled && settings?.slack_webhook_url && settings?.notify_creative_request) {
      const message = buildCreativeRequestMessage({
        requestId: creativeRequest.id,
        packageId: pkg.id,
        tcPackageId: pkg.tc_package_id,
        packageTitle: pkg.title,
        requestedBy: requested_by,
        reason,
        reasonDetail: reason_detail,
        priority,
        variant,
        aspectRatio: aspect_ratio,
        requestedVariants: requested_variants,
        systemUrl: SYSTEM_URL,
      })

      const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

      // Log notification
      await db.from('notification_logs').insert({
        notification_type: 'creative_request',
        channel: 'slack',
        recipient: settings.slack_channel_design || '#design',
        package_id,
        creative_request_id: creativeRequest.id,
        message_title: `Nueva solicitud de creativo para ${pkg.tc_package_id}`,
        message_data: { reason, priority },
        status: slackResult.ok ? 'sent' : 'failed',
        error_message: slackResult.error,
        slack_message_ts: slackResult.ts,
        sent_at: slackResult.ok ? new Date().toISOString() : null,
      })

      // Update request with slack notification timestamp
      if (slackResult.ok) {
        await db
          .from('creative_requests')
          .update({
            slack_notified_at: new Date().toISOString(),
            slack_message_ts: slackResult.ts,
          })
          .eq('id', creativeRequest.id)
      }
    }

    return new Response(JSON.stringify(creativeRequest), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Creative Requests POST] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error creating request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * PATCH /api/creative-requests
 * Update a creative request status
 */
export async function PATCH(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const {
      id,
      status,
      assigned_to,
      notes,
      rejection_reason,
    } = body

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get current request
    const { data: currentRequest, error: fetchError } = await db
      .from('creative_requests')
      .select('*, packages:package_id (id, tc_package_id, title)')
      .eq('id', id)
      .single()

    if (fetchError || !currentRequest) {
      return new Response(
        JSON.stringify({ error: 'Request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const updateData: Record<string, unknown> = {}

    if (status) {
      updateData.status = status

      if (status === 'in_progress' && !currentRequest.started_at) {
        updateData.started_at = new Date().toISOString()
      }

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString()

        // Clear the creative_update_needed flag on package
        await db
          .from('packages')
          .update({
            creative_update_needed: false,
            creative_update_reason: null,
            creatives_last_updated_at: new Date().toISOString(),
          })
          .eq('id', currentRequest.package_id)
      }

      // Marketing marked the request as fully processed (ads updated)
      // or discarded (not needed anymore)
      if (status === 'processed' || status === 'discarded') {
        // Clear the creative_update_needed flag on package
        await db
          .from('packages')
          .update({
            creative_update_needed: false,
            creative_update_reason: null,
          })
          .eq('id', currentRequest.package_id)
      }

      if (status === 'rejected') {
        updateData.rejection_reason = rejection_reason
      }
    }

    if (assigned_to !== undefined) updateData.assigned_to = assigned_to
    if (notes !== undefined) updateData.notes = notes

    const { data: updatedRequest, error: updateError } = await db
      .from('creative_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // Send Slack notification for completion
    if (status === 'completed') {
      const { data: settings } = await db
        .from('notification_settings')
        .select('*')
        .eq('id', 1)
        .single()

      if (settings?.slack_enabled && settings?.slack_webhook_url && settings?.notify_creative_completed) {
        const pkg = currentRequest.packages as { id: number; tc_package_id: number; title: string }

        const message = buildCreativeCompletedMessage({
          requestId: id,
          packageId: pkg.id,
          tcPackageId: pkg.tc_package_id,
          packageTitle: pkg.title,
          completedBy: assigned_to || 'Diseño',
          notes,
          systemUrl: SYSTEM_URL,
        })

        const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

        // Log notification
        await db.from('notification_logs').insert({
          notification_type: 'creative_completed',
          channel: 'slack',
          recipient: settings.slack_channel_marketing || '#marketing',
          package_id: currentRequest.package_id,
          creative_request_id: id,
          message_title: `Creativo completado para ${pkg.tc_package_id}`,
          status: slackResult.ok ? 'sent' : 'failed',
          error_message: slackResult.error,
          sent_at: slackResult.ok ? new Date().toISOString() : null,
        })
      }
    }

    return new Response(JSON.stringify(updatedRequest), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Creative Requests PATCH] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error updating request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * DELETE /api/creative-requests?id=XXX&action=complete|discard
 * Delete a creative request (marketing acknowledged/discarded it)
 */
export async function DELETE(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  const action = searchParams.get('action') // 'complete' or 'discard'

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Get current request to get package_id
    const { data: currentRequest, error: fetchError } = await db
      .from('creative_requests')
      .select('package_id')
      .eq('id', parseInt(id))
      .single()

    if (fetchError || !currentRequest) {
      return new Response(
        JSON.stringify({ error: 'Request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Clear the creative_update_needed flag on package
    await db
      .from('packages')
      .update({
        creative_update_needed: false,
        creative_update_reason: null,
      })
      .eq('id', currentRequest.package_id)

    // Delete the request
    const { error: deleteError } = await db
      .from('creative_requests')
      .delete()
      .eq('id', parseInt(id))

    if (deleteError) {
      throw deleteError
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Creative Requests DELETE] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error deleting request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
