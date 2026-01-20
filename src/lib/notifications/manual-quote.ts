/**
 * Manual Quote Notification Logic
 * Handles sending notifications for packages that need manual quote review
 */

import { createClient } from '@supabase/supabase-js'
import {
  sendSlackMessage,
  buildNeedsManualQuoteMessage,
} from '@/lib/slack/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

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
 * Check for packages with requote_status = 'needs_manual' and send notifications
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

    // Get recent notifications to avoid duplicates
    const { data: recentNotifications } = await db
      .from('notification_logs')
      .select('package_id, created_at')
      .eq('notification_type', 'needs_manual_quote')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

    const notifiedPackageIds = new Set(recentNotifications?.map(n => n.package_id) || [])

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
        total: packages.length,
        results: packages.map(p => ({ tc_package_id: p.tc_package_id, status: 'slack_disabled' }))
      }
    }

    // Check if needs_manual_quote notifications are enabled
    if (settings.notify_needs_manual_quote === false) {
      return {
        success: false,
        message: 'Needs manual quote notifications disabled',
        sent: 0,
        total: packages.length,
        results: packages.map(p => ({ tc_package_id: p.tc_package_id, status: 'notification_disabled' }))
      }
    }

    let sent = 0
    const results: NotificationResult[] = []
    const channel = settings.slack_channel_marketing || '#marketing'

    for (const pkg of packages) {
      // Skip if already notified in the last 24 hours
      if (notifiedPackageIds.has(pkg.id)) {
        results.push({ tc_package_id: pkg.tc_package_id, status: 'already_notified' })
        continue
      }

      const oldPrice = pkg.current_price_per_pax
      const newPrice = pkg.requote_price
      const variancePct = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0

      try {
        // Build and send Slack message directly
        const message = buildNeedsManualQuoteMessage({
          packageId: pkg.id,
          tcPackageId: pkg.tc_package_id,
          packageTitle: pkg.title,
          oldPrice,
          newPrice,
          currency: pkg.currency || 'USD',
          variancePct,
          systemUrl: SYSTEM_URL,
        })

        const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

        // Log notification
        await db.from('notification_logs').insert({
          notification_type: 'needs_manual_quote',
          channel: 'slack',
          recipient: channel,
          package_id: pkg.id,
          message_title: `Cotización manual requerida - ${pkg.tc_package_id}`,
          message_data: {
            tc_package_id: pkg.tc_package_id,
            package_title: pkg.title,
            old_price: oldPrice,
            new_price: newPrice,
            currency: pkg.currency || 'USD',
            variance_pct: variancePct,
          },
          status: slackResult.ok ? 'sent' : 'failed',
          error_message: slackResult.error,
          slack_message_ts: slackResult.ts,
          sent_at: slackResult.ok ? new Date().toISOString() : null,
        })

        if (slackResult.ok) {
          sent++
          results.push({ tc_package_id: pkg.tc_package_id, status: 'sent' })
          console.log(`[Manual Quote Notifications] Notification sent for ${pkg.tc_package_id}`)
        } else {
          results.push({ tc_package_id: pkg.tc_package_id, status: slackResult.error || 'failed' })
        }
      } catch (error) {
        console.error(`[Manual Quote Notifications] Error sending notification for ${pkg.tc_package_id}:`, error)
        results.push({ tc_package_id: pkg.tc_package_id, status: 'error' })
      }
    }

    return {
      success: true,
      message: `Sent ${sent} notifications`,
      sent,
      total: packages.length,
      results,
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
