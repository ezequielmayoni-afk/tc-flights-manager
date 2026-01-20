import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/notifications/settings
 * Get notification settings
 */
export async function GET() {
  const db = getSupabaseClient()

  try {
    const { data, error } = await db
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    // Return default settings if not found
    if (!data) {
      return new Response(JSON.stringify({
        slack_enabled: false,
        slack_webhook_url: '',
        slack_channel_design: '#design',
        slack_channel_marketing: '#marketing',
        notify_price_change: true,
        notify_creative_request: true,
        notify_creative_completed: true,
        notify_ad_underperforming: true,
        notify_needs_manual_quote: true,
        price_change_threshold_pct: 5.0,
        ctr_threshold_pct: 0.5,
        cpl_threshold: 10.0,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Notification Settings GET] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error fetching settings' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * PUT /api/notifications/settings
 * Update notification settings
 */
export async function PUT(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()

    // Only allow specific fields to be updated
    const allowedFields = [
      'slack_enabled',
      'slack_webhook_url',
      'slack_channel_design',
      'slack_channel_marketing',
      'notify_price_change',
      'notify_creative_request',
      'notify_creative_completed',
      'notify_ad_underperforming',
      'notify_needs_manual_quote',
      'price_change_threshold_pct',
      'ctr_threshold_pct',
      'cpl_threshold',
    ]

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data, error } = await db
      .from('notification_settings')
      .upsert({ id: 1, ...updateData })
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Notification Settings PUT] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error updating settings' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /api/notifications/settings/test
 * Test Slack webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { webhook_url, channel } = body

    if (!webhook_url) {
      return new Response(JSON.stringify({ error: 'webhook_url is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Send test message
    const response = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Test de conexión desde TC Flights Manager`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '✅ Conexión Exitosa',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Las notificaciones de *TC Flights Manager* están configuradas correctamente para el canal *${channel || 'este canal'}*.`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Enviado: ${new Date().toLocaleString('es-AR')}`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Slack responded with ${response.status}: ${text}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Notification Settings Test] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error testing webhook' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
