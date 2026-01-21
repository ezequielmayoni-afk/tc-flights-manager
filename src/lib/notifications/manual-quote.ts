/**
 * Manual Quote Notification Logic
 * Handles sending notifications for packages that need manual quote review
 * Sends ONE consolidated notification instead of individual ones per package
 */

import { createClient } from '@supabase/supabase-js'
import {
  sendSlackMessage,
  buildManualQuoteSummaryMessage,
} from '@/lib/slack/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

// Marcelo's Slack mention - can be configured as @marcelo or Slack user ID <@UXXXXXXXX>
const MARCELO_MENTION = '@Marcelo'

interface NotificationResult {
  tc_package_id: number
  status: string
}

interface CheckManualQuotesResult {
  success: boolean
  message: string
  sent: number
  total: number
  results: NotificationResult[]
  error?: string
}

/**
 * Check for packages with requote_status = 'needs_manual' and send ONE consolidated notification
 * for those that haven't been notified in the last 24 hours
 */
export async function checkAndSendManualQuoteNotifications(): Promise<CheckManualQuotesResult> {
  const db = getSupabaseClient()

  try {
    // Get all packages with requote_status = 'needs_manual'
    const { data: packages, error: pkgError } = await db
      .from('packages')
      .select('id, tc_package_id, title, current_price_per_pax, requote_price, currency, last_requote_at')
      .eq('requote_status', 'needs_manual')
      .not('requote_price', 'is', null)

    if (pkgError) {
      console.error('[Manual Quote Notifications] Error fetching packages:', pkgError)
      return {
        success: false,
        message: pkgError.message,
        sent: 0,
        total: 0,
        results: [],
        error: pkgError.message
      }
    }

    if (!packages || packages.length === 0) {
      return {
        success: true,
        message: 'No packages need notification',
        sent: 0,
        total: 0,
        results: []
      }
    }

    console.log(`[Manual Quote Notifications] Found ${packages.length} packages with needs_manual status`)

    // Get recent notifications to avoid duplicates (check by batch, not individual packages)
    // We look for any summary notification sent in the last 24 hours
    const { data: recentBatchNotification } = await db
      .from('notification_logs')
      .select('created_at')
      .eq('notification_type', 'needs_manual_quote_summary')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)

    // Also check individual package notifications to filter which packages to include
    const { data: recentPackageNotifications } = await db
      .from('notification_logs')
      .select('package_id, created_at')
      .eq('notification_type', 'needs_manual_quote')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const notifiedPackageIds = new Set(recentPackageNotifications?.map(n => n.package_id) || [])

    // Filter packages that haven't been notified individually
    const packagesToNotify = packages.filter(pkg => !notifiedPackageIds.has(pkg.id))

    if (packagesToNotify.length === 0) {
      return {
        success: true,
        message: 'All packages already notified in the last 24 hours',
        sent: 0,
        total: packages.length,
        results: packages.map(p => ({ tc_package_id: p.tc_package_id, status: 'already_notified' }))
      }
    }

    // Get notification settings
    const { data: settings } = await db
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (!settings?.slack_enabled || !settings?.slack_webhook_url) {
      return {
        success: false,
        message: 'Slack notifications not enabled',
        sent: 0,
        total: packagesToNotify.length,
        results: packagesToNotify.map(p => ({ tc_package_id: p.tc_package_id, status: 'slack_disabled' }))
      }
    }

    // Check if needs_manual_quote notifications are enabled
    if (settings.notify_needs_manual_quote === false) {
      return {
        success: false,
        message: 'Needs manual quote notifications disabled',
        sent: 0,
        total: packagesToNotify.length,
        results: packagesToNotify.map(p => ({ tc_package_id: p.tc_package_id, status: 'notification_disabled' }))
      }
    }

    const channel = settings.slack_channel_marketing || '#marketing'
    const results: NotificationResult[] = []

    // Build package data for the consolidated message
    const packageData = packagesToNotify.map(pkg => {
      const oldPrice = pkg.current_price_per_pax
      const newPrice = pkg.requote_price
      const variancePct = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0

      return {
        packageId: pkg.id,
        tcPackageId: pkg.tc_package_id,
        packageTitle: pkg.title,
        oldPrice,
        newPrice,
        currency: pkg.currency || 'USD',
        variancePct,
      }
    })

    // Build ONE consolidated message for all packages
    const message = buildManualQuoteSummaryMessage({
      packages: packageData,
      systemUrl: SYSTEM_URL,
      mentionUser: MARCELO_MENTION,
    })

    try {
      const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

      // Log the consolidated notification
      await db.from('notification_logs').insert({
        notification_type: 'needs_manual_quote_summary',
        channel: 'slack',
        recipient: channel,
        package_id: null, // Summary notification, not tied to a single package
        message_title: `Cotización manual requerida - ${packagesToNotify.length} paquete(s)`,
        message_data: {
          packages_count: packagesToNotify.length,
          packages: packageData.map(p => ({
            tc_package_id: p.tcPackageId,
            package_title: p.packageTitle,
            old_price: p.oldPrice,
            new_price: p.newPrice,
            currency: p.currency,
            variance_pct: p.variancePct,
          })),
          mention_user: MARCELO_MENTION,
        },
        status: slackResult.ok ? 'sent' : 'failed',
        error_message: slackResult.error,
        slack_message_ts: slackResult.ts,
        sent_at: slackResult.ok ? new Date().toISOString() : null,
      })

      // Also log individual package notifications to track which packages were included
      if (slackResult.ok) {
        for (const pkg of packagesToNotify) {
          await db.from('notification_logs').insert({
            notification_type: 'needs_manual_quote',
            channel: 'slack',
            recipient: channel,
            package_id: pkg.id,
            message_title: `Incluido en resumen - ${pkg.tc_package_id}`,
            message_data: {
              tc_package_id: pkg.tc_package_id,
              package_title: pkg.title,
              included_in_summary: true,
            },
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          results.push({ tc_package_id: pkg.tc_package_id, status: 'sent' })
        }

        console.log(`[Manual Quote Notifications] Sent 1 consolidated notification for ${packagesToNotify.length} packages`)

        return {
          success: true,
          message: `Sent 1 consolidated notification for ${packagesToNotify.length} packages`,
          sent: 1, // Only 1 message sent
          total: packagesToNotify.length,
          results,
        }
      } else {
        for (const pkg of packagesToNotify) {
          results.push({ tc_package_id: pkg.tc_package_id, status: slackResult.error || 'failed' })
        }

        return {
          success: false,
          message: slackResult.error || 'Failed to send notification',
          sent: 0,
          total: packagesToNotify.length,
          results,
          error: slackResult.error,
        }
      }
    } catch (error) {
      console.error('[Manual Quote Notifications] Error sending consolidated notification:', error)
      for (const pkg of packagesToNotify) {
        results.push({ tc_package_id: pkg.tc_package_id, status: 'error' })
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        sent: 0,
        total: packagesToNotify.length,
        results,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  } catch (error) {
    console.error('[Manual Quote Notifications] Error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      sent: 0,
      total: 0,
      results: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
