import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { deactivatePackage, getPackageDetail } from '@/lib/travelcompositor/client'
import { sendSlackMessage, buildCreativeRequestMessage, buildSentToMarketingMessage } from '@/lib/slack/client'

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface PackageResult {
  id: number
  tc_package_id: number
  title: string
  status: 'success' | 'error'
  error?: string
}

/**
 * POST /api/packages/bulk-action
 * Execute bulk actions on multiple packages
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const { packageIds, action } = await request.json()

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return NextResponse.json({ error: 'No packages selected' }, { status: 400 })
    }

    if (!['design', 'marketing', 'expired', 'delete', 'monitor', 'unmonitor', 'complete-requote', 'run_requote', 'accept-requote', 'design-complete', 'design-uncomplete', 'creative-uploaded', 'sync-ads-count'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get package details first (include current_price_per_pax for monitor action, date_range_end for marketing expiration)
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id, title, current_price_per_pax, date_range_end')
      .in('id', packageIds)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const results: PackageResult[] = []

    // Process each package individually
    for (const pkg of packages || []) {
      try {
        console.log(`[Bulk Action] Processing package ${pkg.id} (tc_package_id: ${pkg.tc_package_id}) with action: ${action}`)
        let updateData: Record<string, unknown> = {}
        let tcError: string | null = null

        switch (action) {
          case 'design':
            updateData = {
              status: 'in_design',
              send_to_design: true,
              send_to_design_at: new Date().toISOString(),
              creative_update_needed: true,
              creative_update_reason: 'new_package',
              creative_update_requested_at: new Date().toISOString(),
              creative_update_requested_by: 'Marketing',
            }

            // Create creative request entry
            const { data: creativeRequest, error: crError } = await db
              .from('creative_requests')
              .insert({
                package_id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                reason: 'new_package',
                reason_detail: 'Paquete nuevo enviado a diseño',
                priority: 'normal',
                requested_by: 'Marketing',
                status: 'pending',
              })
              .select()
              .single()

            if (crError) {
              console.error(`[Bulk Action] Error creating creative request for ${pkg.tc_package_id}:`, crError)
            }

            // Send Slack notification
            const { data: settings } = await db
              .from('notification_settings')
              .select('*')
              .eq('id', 1)
              .single()

            if (settings?.slack_enabled && settings?.slack_webhook_url && settings?.notify_creative_request && creativeRequest) {
              const message = buildCreativeRequestMessage({
                requestId: creativeRequest.id,
                packageId: pkg.id,
                tcPackageId: pkg.tc_package_id,
                packageTitle: pkg.title,
                requestedBy: 'Marketing',
                reason: 'new_package',
                reasonDetail: 'Paquete nuevo enviado a diseño',
                priority: 'normal',
                systemUrl: SYSTEM_URL,
              })

              const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

              // Log notification
              await db.from('notification_logs').insert({
                notification_type: 'creative_request',
                channel: 'slack',
                recipient: settings.slack_channel_design || '#design',
                package_id: pkg.id,
                creative_request_id: creativeRequest.id,
                message_title: `Nueva solicitud de creativo para ${pkg.tc_package_id}`,
                message_data: { reason: 'new_package', priority: 'normal' },
                status: slackResult.ok ? 'sent' : 'failed',
                error_message: slackResult.error,
                slack_message_ts: slackResult.ts,
                sent_at: slackResult.ok ? new Date().toISOString() : null,
              })

              // Update request with slack timestamp
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
            break
          case 'marketing':
            console.log(`[Bulk Action] Setting package ${pkg.id} to marketing`)

            // Calculate marketing expiration date (15 days before date_range_end)
            let marketingExpirationDate: string | null = null
            if (pkg.date_range_end) {
              const endDate = new Date(pkg.date_range_end)
              const expirationDate = new Date(endDate)
              expirationDate.setDate(expirationDate.getDate() - 15)
              marketingExpirationDate = expirationDate.toISOString().split('T')[0] // YYYY-MM-DD format
              console.log(`[Bulk Action] Calculated marketing_expiration_date: ${marketingExpirationDate} (15 days before ${pkg.date_range_end})`)
            }

            updateData = {
              status: 'in_marketing',
              send_to_marketing: true,
              design_completed: true,
              design_completed_at: new Date().toISOString(),
              ...(marketingExpirationDate && { marketing_expiration_date: marketingExpirationDate }),
            }
            console.log(`[Bulk Action] updateData for marketing:`, updateData)

            // Mark any pending creative requests as completed
            await db
              .from('creative_requests')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              .eq('package_id', pkg.id)
              .in('status', ['pending', 'in_progress'])

            // Get creatives count for this package
            const { count: creativesCount } = await db
              .from('meta_creatives')
              .select('*', { count: 'exact', head: true })
              .eq('package_id', pkg.id)
              .eq('upload_status', 'uploaded')

            // Send Slack notification
            const { data: mktSettings } = await db
              .from('notification_settings')
              .select('*')
              .eq('id', 1)
              .single()

            if (mktSettings?.slack_enabled && mktSettings?.slack_webhook_url) {
              const message = buildSentToMarketingMessage({
                packageId: pkg.id,
                tcPackageId: pkg.tc_package_id,
                packageTitle: pkg.title,
                sentBy: 'Diseño',
                creativesCount: creativesCount || 0,
                systemUrl: SYSTEM_URL,
              })

              const slackResult = await sendSlackMessage(mktSettings.slack_webhook_url, message)

              // Log notification
              await db.from('notification_logs').insert({
                notification_type: 'sent_to_marketing',
                channel: 'slack',
                recipient: mktSettings.slack_channel_marketing || '#marketing',
                package_id: pkg.id,
                message_title: `Paquete ${pkg.tc_package_id} enviado a marketing`,
                message_data: { creativesCount: creativesCount || 0 },
                status: slackResult.ok ? 'sent' : 'failed',
                error_message: slackResult.error,
                slack_message_ts: slackResult.ts,
                sent_at: slackResult.ok ? new Date().toISOString() : null,
              })
            }
            break
          case 'expired':
            // First, try to deactivate in TravelCompositor
            const tcExpiredResult = await deactivatePackage(pkg.tc_package_id)
            if (!tcExpiredResult.success) {
              tcError = tcExpiredResult.error || 'Error al desactivar en TC'
            }

            updateData = {
              status: 'expired',
              tc_active: false,
            }
            break

          case 'delete':
            // First, try to deactivate in TravelCompositor
            const tcDeleteResult = await deactivatePackage(pkg.tc_package_id)
            if (!tcDeleteResult.success) {
              tcError = tcDeleteResult.error || 'Error al desactivar en TC'
            }

            // Delete from database (CASCADE will delete related records)
            const { error: deleteError } = await db
              .from('packages')
              .delete()
              .eq('id', pkg.id)

            if (deleteError) {
              results.push({
                id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                title: pkg.title,
                status: 'error',
                error: tcError
                  ? `TC desactivado con error (${tcError}), DB falló: ${deleteError.message}`
                  : `Error al eliminar de DB: ${deleteError.message}`,
              })
            } else {
              results.push({
                id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                title: pkg.title,
                status: tcError ? 'error' : 'success',
                error: tcError ? `Eliminado de DB, pero TC falló: ${tcError}` : undefined,
              })
            }
            continue // Skip the update logic below

          case 'monitor':
            updateData = {
              monitor_enabled: true,
              requote_status: 'pending',
              target_price: pkg.current_price_per_pax, // Save current price as reference for variance calculation
            }
            break

          case 'unmonitor':
            updateData = {
              monitor_enabled: false,
              requote_status: null,
              requote_price: null,
              requote_variance_pct: null,
              target_price: null,
            }
            break

          case 'complete-requote':
            updateData = {
              requote_status: 'completed',
              requote_price: pkg.current_price_per_pax,
              target_price: pkg.current_price_per_pax,
              last_requote_at: new Date().toISOString(),
            }
            break

          case 'run_requote':
            // Mark packages as pending so the bot will process them
            // Also enable monitoring and set target_price if not set
            updateData = {
              monitor_enabled: true,
              requote_status: 'pending',
              target_price: pkg.current_price_per_pax, // Use current price as target if not set
            }
            break

          case 'accept-requote':
            // Accept the current price as the new target price
            // First fetch latest price from TC, then set it as target_price
            // This way user doesn't need to click "Actualizar TC" first
            // NOTE: Does NOT change requote_status - user must click "Completado" to mark as done
            try {
              const tcDetail = await getPackageDetail(pkg.tc_package_id)
              const newPriceFromTC = tcDetail.pricePerPerson?.amount || tcDetail.totalPrice?.amount

              if (newPriceFromTC) {
                // Update current_price_per_pax with TC price, then set as target
                updateData = {
                  current_price_per_pax: newPriceFromTC,
                  target_price: newPriceFromTC,
                  requote_price: newPriceFromTC,
                  requote_variance_pct: 0,
                  last_requote_at: new Date().toISOString(),
                }
              } else {
                // Fallback to current DB price if TC doesn't return a price
                updateData = {
                  target_price: pkg.current_price_per_pax,
                  requote_price: pkg.current_price_per_pax,
                  requote_variance_pct: 0,
                  last_requote_at: new Date().toISOString(),
                }
              }
            } catch (tcFetchError) {
              // If TC fetch fails, use current DB price as fallback
              console.error(`[Accept Requote] TC fetch failed for ${pkg.tc_package_id}:`, tcFetchError)
              updateData = {
                target_price: pkg.current_price_per_pax,
                requote_price: pkg.current_price_per_pax,
                requote_variance_pct: 0,
                last_requote_at: new Date().toISOString(),
              }
            }
            break

          case 'design-complete':
            // Mark design as completed
            updateData = {
              design_completed: true,
              design_completed_at: new Date().toISOString(),
            }
            break

          case 'design-uncomplete':
            // Revert design to pending
            updateData = {
              design_completed: false,
              design_completed_at: null,
            }
            break

          case 'creative-uploaded':
            // Mark that creatives have been uploaded to Meta with current price
            updateData = {
              price_at_creative_creation: pkg.current_price_per_pax,
            }
            break

          case 'sync-ads-count':
            // Recalculate ads_created_count from meta_ads table
            const { count: adsCount } = await db
              .from('meta_ads')
              .select('*', { count: 'exact', head: true })
              .eq('package_id', pkg.id)
              .neq('status', 'DELETED')

            console.log(`[Bulk Action] Syncing ads count for package ${pkg.id}: found ${adsCount || 0} ads`)

            updateData = {
              ads_created_count: adsCount || 0,
            }
            break
        }

        // If TC deactivation failed, report error but still update local DB
        console.log(`[Bulk Action] About to update package ${pkg.id} with:`, updateData)

        if (tcError) {
          // Still update local DB
          const { error: tcUpdateError } = await db
            .from('packages')
            .update(updateData)
            .eq('id', pkg.id)

          console.log(`[Bulk Action] TC error case - Update result for ${pkg.id}:`, tcUpdateError ? tcUpdateError.message : 'success')

          results.push({
            id: pkg.id,
            tc_package_id: pkg.tc_package_id,
            title: pkg.title,
            status: 'error',
            error: `DB actualizada, pero TC falló: ${tcError}`,
          })
        } else {
          const { error: updateError, data: updateData2 } = await db
            .from('packages')
            .update(updateData)
            .eq('id', pkg.id)
            .select()

          console.log(`[Bulk Action] Update result for ${pkg.id}:`, updateError ? updateError.message : 'success', updateData2)

          if (updateError) {
            results.push({
              id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              title: pkg.title,
              status: 'error',
              error: updateError.message,
            })
          } else {
            results.push({
              id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              title: pkg.title,
              status: 'success',
            })
          }
        }
      } catch (err) {
        results.push({
          id: pkg.id,
          tc_package_id: pkg.tc_package_id,
          title: pkg.title,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const errorCount = results.filter(r => r.status === 'error').length

    console.log(`[Bulk Action] ${action}: ${successCount} success, ${errorCount} errors`)

    return NextResponse.json({
      success: errorCount === 0,
      updated: successCount,
      errors: errorCount,
      results,
    })
  } catch (error) {
    console.error('[Bulk Action] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
