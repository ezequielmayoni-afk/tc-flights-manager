import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  sendSlackMessage,
  buildPriceChangeMessage,
  buildAdUnderperformingMessage,
  buildNeedsManualQuoteMessage,
} from '@/lib/slack/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * POST /api/notifications/send
 * Send a notification (price change, ad underperforming, etc.)
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { type, package_id, data } = body as {
      type: 'price_change' | 'ad_underperforming' | 'needs_manual_quote'
      package_id: number
      data: Record<string, unknown>
    }

    if (!type || !package_id) {
      return new Response(
        JSON.stringify({ error: 'type and package_id are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get notification settings
    const { data: settings, error: settingsError } = await db
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (settingsError || !settings?.slack_enabled || !settings?.slack_webhook_url) {
      return new Response(
        JSON.stringify({ success: false, reason: 'Slack notifications not enabled' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get package info
    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('id, tc_package_id, title, current_price_per_pax, currency')
      .eq('id', package_id)
      .single()

    if (pkgError || !pkg) {
      return new Response(
        JSON.stringify({ error: 'Package not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let message
    let shouldSend = false
    let notificationType = type
    let channel = settings.slack_channel_design || '#design'

    switch (type) {
      case 'price_change':
        if (!settings.notify_price_change) {
          return new Response(
            JSON.stringify({ success: false, reason: 'Price change notifications disabled' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        const priceData = data as {
          old_price: number
          new_price: number
          variance_pct: number
        }

        // Check threshold
        if (Math.abs(priceData.variance_pct) < (settings.price_change_threshold_pct || 5)) {
          return new Response(
            JSON.stringify({ success: false, reason: 'Price change below threshold' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        message = buildPriceChangeMessage({
          packageId: pkg.id,
          tcPackageId: pkg.tc_package_id,
          packageTitle: pkg.title,
          oldPrice: priceData.old_price,
          newPrice: priceData.new_price,
          currency: pkg.currency || 'USD',
          variancePct: priceData.variance_pct,
          systemUrl: SYSTEM_URL,
        })

        // Mark package as needing creative update
        await db
          .from('packages')
          .update({
            creative_update_needed: true,
            creative_update_reason: 'price_change',
            creative_update_requested_at: new Date().toISOString(),
          })
          .eq('id', package_id)

        shouldSend = true
        break

      case 'ad_underperforming':
        if (!settings.notify_ad_underperforming) {
          return new Response(
            JSON.stringify({ success: false, reason: 'Underperforming ad notifications disabled' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        const adData = data as {
          ad_id: string
          ad_name: string
          ctr?: number
          cpl?: number
          spend?: number
          leads?: number
        }

        // Check thresholds
        const ctrBelowThreshold = settings.ctr_threshold_pct && adData.ctr !== undefined && adData.ctr < settings.ctr_threshold_pct
        const cplAboveThreshold = settings.cpl_threshold && adData.cpl !== undefined && adData.cpl > settings.cpl_threshold

        if (!ctrBelowThreshold && !cplAboveThreshold) {
          return new Response(
            JSON.stringify({ success: false, reason: 'Ad metrics within acceptable range' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        message = buildAdUnderperformingMessage({
          packageId: pkg.id,
          tcPackageId: pkg.tc_package_id,
          packageTitle: pkg.title,
          adId: adData.ad_id,
          adName: adData.ad_name,
          metrics: {
            ctr: adData.ctr,
            cpl: adData.cpl,
            spend: adData.spend,
            leads: adData.leads,
          },
          thresholds: {
            ctr: settings.ctr_threshold_pct,
            cpl: settings.cpl_threshold,
          },
          systemUrl: SYSTEM_URL,
        })

        channel = settings.slack_channel_marketing || '#marketing'
        shouldSend = true
        break

      case 'needs_manual_quote':
        // Check setting (default to true if column doesn't exist yet)
        if (settings.notify_needs_manual_quote === false) {
          return new Response(
            JSON.stringify({ success: false, reason: 'Needs manual quote notifications disabled' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        const manualQuoteData = data as {
          old_price: number
          new_price: number
          variance_pct: number
        }

        message = buildNeedsManualQuoteMessage({
          packageId: pkg.id,
          tcPackageId: pkg.tc_package_id,
          packageTitle: pkg.title,
          oldPrice: manualQuoteData.old_price,
          newPrice: manualQuoteData.new_price,
          currency: pkg.currency || 'USD',
          variancePct: manualQuoteData.variance_pct,
          systemUrl: SYSTEM_URL,
        })

        channel = settings.slack_channel_marketing || '#marketing'
        shouldSend = true
        break

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid notification type' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    if (!shouldSend || !message) {
      return new Response(
        JSON.stringify({ success: false, reason: 'No notification to send' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Send notification
    const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

    // Log notification
    const getMessageTitle = () => {
      switch (type) {
        case 'price_change':
          return `Cambio de precio en ${pkg.tc_package_id}`
        case 'ad_underperforming':
          return `Anuncio con bajo rendimiento - ${pkg.tc_package_id}`
        case 'needs_manual_quote':
          return `Cotización manual requerida - ${pkg.tc_package_id}`
        default:
          return `Notificación - ${pkg.tc_package_id}`
      }
    }

    await db.from('notification_logs').insert({
      notification_type: notificationType,
      channel: 'slack',
      recipient: channel,
      package_id,
      meta_ad_id: type === 'ad_underperforming' ? (data as { ad_id: string }).ad_id : null,
      message_title: getMessageTitle(),
      message_data: data,
      status: slackResult.ok ? 'sent' : 'failed',
      error_message: slackResult.error,
      slack_message_ts: slackResult.ts,
      sent_at: slackResult.ok ? new Date().toISOString() : null,
    })

    return new Response(JSON.stringify({
      success: slackResult.ok,
      error: slackResult.error,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Notifications Send] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error sending notification' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
