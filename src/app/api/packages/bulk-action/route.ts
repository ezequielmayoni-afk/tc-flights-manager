import { NextRequest, NextResponse } from 'next/server'
import { deactivatePackage, getPackageDetail } from '@/lib/travelcompositor/client'
import { sendSlackMessage, buildCreativeRequestMessage, buildSentToMarketingMessage } from '@/lib/slack/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { expirePackageInTC } from '@/lib/packages/expire'
import { switchPackageToSystem } from '@/lib/packages/switch-to-system'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { logEvents, type LogSource } from '@/lib/logs'

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'


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
// Cómo se lee cada acción en la pantalla de Logs
const ACTION_LABELS: Record<string, { message: string; source: LogSource }> = {
  design: { message: 'Enviado a diseño', source: 'diseño' },
  marketing: { message: 'Enviado a marketing', source: 'marketing' },
  expired: { message: 'Marcado como vencido y desactivado en TC', source: 'paquetes' },
  'not-visible': { message: 'Marcado como no visible y desactivado en TC', source: 'paquetes' },
  delete: { message: 'Eliminado del sistema y desactivado en TC', source: 'paquetes' },
  monitor: { message: 'Monitoreo activado', source: 'paquetes' },
  unmonitor: { message: 'Monitoreo desactivado', source: 'paquetes' },
  'complete-requote': { message: 'Cotización manual marcada como completada', source: 'paquetes' },
  run_requote: { message: 'Marcado para ejecutar monitoreo', source: 'paquetes' },
  'accept-requote': { message: 'Precio nuevo aceptado como objetivo', source: 'paquetes' },
  'design-complete': { message: 'Diseño marcado como terminado', source: 'diseño' },
  'design-uncomplete': { message: 'Diseño devuelto a pendiente', source: 'diseño' },
  'creative-uploaded': { message: 'Creativos subidos a Meta', source: 'marketing' },
  'sync-ads-count': { message: 'Recuento de anuncios sincronizado', source: 'marketing' },
  switch_to_system: { message: 'Pasó de cupo a aéreo de sistema; monitoreo encendido', source: 'cupos' },
}

export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { packageIds, action, reason, priority, reason_detail } = await request.json()

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return NextResponse.json({ error: 'No packages selected' }, { status: 400 })
    }

    if (!['design', 'marketing', 'expired', 'not-visible', 'visible', 'group_departures', 'ungroup_departures', 'delete', 'monitor', 'unmonitor', 'complete-requote', 'run_requote', 'accept-requote', 'design-complete', 'design-uncomplete', 'creative-uploaded', 'sync-ads-count', 'switch_to_system'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get package details first (include current_price_per_pax for monitor action, date_range_end for marketing expiration)
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id, title, current_price_per_pax, date_range_end, monitor_enabled, departure_date, departure_group_id')
      .in('id', packageIds)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Los paquetes de cupo no se monitorean: el precio no se recotiza contra el mercado.
    const cupoPackageIds = action === 'design'
      ? await getCupoPackageIds(db, (packages || []).map(p => p.id))
      : new Set<number>()

    const results: PackageResult[] = []

    // Agrupar salidas: mismo producto, distintas fechas. Un solo grupo para toda la selección.
    if (action === 'group_departures' || action === 'ungroup_departures') {
      const list = [...(packages || [])].sort((a, b) => String(a.departure_date ?? '9999').localeCompare(String(b.departure_date ?? '9999')))
      const existing = list.map(p => p.departure_group_id).find(Boolean) as string | undefined
      // Los grupos automáticos (auto:…) se recalculan a diario por firma de producto; uno manual (grp-…) manda sobre ellos.
      const manualExisting = existing && !existing.startsWith('auto:') ? existing : undefined
      const groupId = action === 'group_departures' ? (manualExisting ?? `grp-${Date.now().toString(36)}`) : null
      for (const [index, pkg] of list.entries()) {
        const { error } = await db.from('packages').update({ departure_group_id: groupId, departure_index: groupId ? index + 1 : null }).eq('id', pkg.id)
        results.push({ id: pkg.id, tc_package_id: pkg.tc_package_id, title: pkg.title, status: error ? 'error' : 'success', error: error?.message })
      }
      await enqueueJob(db, { kind: 'cupo.link_refresh', payload: { packageIds: list.map(p => p.id) }, priority: MANUAL_PRIORITY, dedupeKey: `cupo.link_refresh:group:${groupId ?? 'none'}:${Date.now()}`, createdBy: user?.email ?? 'ui' }).catch(() => null)
      await logEvents(db, results.filter(r => r.status === 'success').map(r => ({
        source: 'paquetes' as const,
        action: `package.${action}`,
        message: action === 'group_departures' ? `Agrupado como salidas (${groupId}) con ${list.length - 1} más` : 'Sacado del grupo de salidas',
        entityType: 'package' as const,
        entityId: r.id,
        entityLabel: `${r.tc_package_id} · ${r.title}`,
        details: { group_id: groupId, package_ids: list.map(p => p.id) },
      })), user ? { id: user.id, email: user.email } : null)
      return NextResponse.json({ success: true, updated: results.filter(r => r.status === 'success').length, errors: results.filter(r => r.status === 'error').length, results, groupId })
    }

    // Process each package individually
    for (const pkg of packages || []) {
      try {
        console.log(`[Bulk Action] Processing package ${pkg.id} (tc_package_id: ${pkg.tc_package_id}) with action: ${action}`)
        let updateData: Record<string, unknown> = {}
        let tcError: string | null = null

        switch (action) {
          case 'design': {
            const designReason = reason || 'new_package'
            const designPriority = priority || 'normal'
            const designReasonDetail = reason_detail || 'Paquete enviado a diseño'

            updateData = {
              status: 'in_design',
              send_to_design: true,
              send_to_design_at: new Date().toISOString(),
              creative_update_needed: true,
              creative_update_reason: designReason,
              creative_update_requested_at: new Date().toISOString(),
              creative_update_requested_by: 'Marketing',
            }

            // Enviar a diseño activa el monitoreo (mismos campos que la acción 'monitor'),
            // salvo en los paquetes de cupo. Si el paquete ya estaba monitoreado no se
            // toca, para no perder el target_price ni el estado de recotización.
            if (!pkg.monitor_enabled && !cupoPackageIds.has(pkg.id)) {
              updateData.monitor_enabled = true
              updateData.requote_status = 'pending'
              updateData.target_price = pkg.current_price_per_pax
            }

            // Create creative request entry
            const { data: creativeRequest, error: crError } = await db
              .from('creative_requests')
              .insert({
                package_id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                reason: designReason,
                reason_detail: designReasonDetail,
                priority: designPriority,
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
                reason: designReason,
                reasonDetail: designReasonDetail,
                priority: designPriority,
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
                message_data: { reason: designReason, priority: designPriority },
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
          }
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
          case 'switch_to_system': {
            // El cambio ya se hizo en TC (sin "fijo", tarifa de sistema, guardado):
            // HUB relee TC, lo saca de cupo y prende el monitoreo. Si TC sigue
            // devolviendo el aéreo como contrato, no toca nada y lo dice.
            const switched = await switchPackageToSystem(db, pkg.id, user ? { id: user.id, email: user.email } : null)
            results.push({ id: pkg.id, tc_package_id: pkg.tc_package_id, title: pkg.title, status: switched.ok ? 'success' : 'error', error: switched.ok ? undefined : switched.reason })
            continue
          }

          case 'expired': {
            // La baja vive en @/lib/packages/expire para que sea idéntica acá y
            // en la pantalla de cupos agotados. Como esa función ya escribe en
            // la base, se sale acá con el resultado propio en vez de caer al
            // update genérico de abajo (que con un objeto vacío fallaría).
            const expired = await expirePackageInTC(
              db,
              { id: pkg.id, tc_package_id: pkg.tc_package_id, title: pkg.title },
              user ? { id: user.id, email: user.email } : null,
              { reason: 'acción masiva' }
            )

            results.push({
              id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              title: pkg.title,
              status: expired.tcError || expired.dbError ? 'error' : 'success',
              error: expired.dbError
                ? `Error al actualizar en hub: ${expired.dbError}`
                : expired.tcError
                  ? `Marcado vencido en hub, pero TC falló: ${expired.tcError}`
                  : undefined,
            })
            continue
          }

          case 'visible': {
            // Volver a poner en venta: PUT {active:true, visible:true} en TC, verificado por el job tc.write.
            const job = await enqueueJob(db, { kind: 'tc.write', payload: { op: 'activate', packageId: pkg.id, tcPackageId: pkg.tc_package_id, reason: 'acción "Visible" desde la tabla' }, priority: MANUAL_PRIORITY, dedupeKey: `tc.write:activate:${pkg.tc_package_id}`, entityType: 'package', entityId: pkg.id, createdBy: user?.email ?? 'ui' })
            await db.from('packages').update({ paused_reason: null }).eq('id', pkg.id)
            results.push({ id: pkg.id, tc_package_id: pkg.tc_package_id, title: pkg.title, status: 'success', error: job.deduped ? 'ya había una activación en cola' : undefined })
            continue
          }

          case 'not-visible': {
            // Sacar de la venta sin darlo por vencido: se desactiva en TC, pasa
            // al estado No visible y se apaga el monitoreo, porque un paquete
            // que no se ve no tiene precio que vigilar.
            const hidden = await expirePackageInTC(
              db,
              { id: pkg.id, tc_package_id: pkg.tc_package_id, title: pkg.title },
              user ? { id: user.id, email: user.email } : null,
              { reason: 'marcado como no visible', status: 'not_visible', stopMonitoring: true }
            )

            results.push({
              id: pkg.id,
              tc_package_id: pkg.tc_package_id,
              title: pkg.title,
              status: hidden.tcError || hidden.dbError ? 'error' : 'success',
              error: hidden.dbError
                ? `Error al actualizar en hub: ${hidden.dbError}`
                : hidden.tcError
                  ? `Marcado no visible en hub, pero TC falló: ${hidden.tcError}`
                  : undefined,
            })
            continue
          }

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
              // Este es el camino que usa la pantalla de cotización manual;
              // antes solo el PATCH individual dejaba registro de cuándo se
              // completó, así que el histórico quedaba incompleto.
              manual_quote_completed_at: new Date().toISOString(),
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

    // Un evento por paquete: sin esto no queda rastro de quién movió qué ni cuándo.
    // 'expired' y 'not-visible' se saltean porque expirePackageInTC ya registra
    // su propio evento con más detalle (si TC respondió bien, el error, el motivo).
    const label = ACTION_LABELS[action] || { message: action, source: 'paquetes' as LogSource }
    await logEvents(
      db,
      (action === 'expired' || action === 'not-visible' ? [] : results).map(r => ({
        source: label.source,
        action: `package.${action}`,
        level: r.status === 'error' ? ('error' as const) : ('info' as const),
        message: r.status === 'error' ? `${label.message} — falló: ${r.error}` : label.message,
        entityType: 'package' as const,
        entityId: r.id,
        entityLabel: `${r.tc_package_id} · ${r.title}`,
        details: {
          tc_package_id: r.tc_package_id,
          ...(action === 'design' ? { cupo: cupoPackageIds.has(r.id), monitoreo_activado: !cupoPackageIds.has(r.id) } : {}),
          ...(r.error ? { error: r.error } : {}),
        },
      })),
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json({
      success: errorCount === 0,
      updated: successCount,
      errors: errorCount,
      results,
    })
  } catch (error) {
    console.error('[Bulk Action] Error:', error)
    return errorResponse(error)
  }
}
