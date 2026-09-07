/**
 * Aviso a marketing cuando se da de baja un paquete porque su cupo se agotó.
 * Sigue el mismo molde que el resto: chequea la configuración, deduplica contra
 * notification_logs y registra el resultado.
 */

import { sendSlackMessage, buildCupoSoldOutMessage } from '@/lib/slack/client'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

export interface CupoSoldOutNoticeInput {
  packageId: number
  tcPackageId: number
  packageTitle: string
  flightId: number
  flightLabel: string
  departureDate: string
  cuposTotal: number
  requestedByEmail?: string | null
}

export async function sendCupoSoldOutNotice(
  db: Db,
  input: CupoSoldOutNoticeInput
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  try {
    const { data: settings } = await db
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (!settings?.slack_enabled || !settings?.slack_webhook_url) {
      return { ok: false, skipped: 'Slack no está habilitado' }
    }
    if (settings.notify_cupo_sold_out === false) {
      return { ok: false, skipped: 'Aviso de cupo agotado desactivado' }
    }

    const { data: recent } = await db
      .from('notification_logs')
      .select('id')
      .eq('notification_type', 'cupo_sold_out')
      .eq('package_id', input.packageId)
      .gte('created_at', new Date(Date.now() - DEDUP_WINDOW_MS).toISOString())
      .limit(1)

    if (recent && recent.length > 0) {
      return { ok: false, skipped: 'Ya se avisó por este paquete en las últimas 24 h' }
    }

    const message = buildCupoSoldOutMessage({ ...input, systemUrl: SYSTEM_URL })
    const channel = settings.slack_channel_marketing || '#marketing'
    const result = await sendSlackMessage(settings.slack_webhook_url, message)

    await db.from('notification_logs').insert({
      notification_type: 'cupo_sold_out',
      channel: 'slack',
      recipient: channel,
      package_id: input.packageId,
      message_title: `dar de baja, el paquete ID ${input.tcPackageId}`,
      message_data: {
        flight_id: input.flightId,
        flight: input.flightLabel,
        departure_date: input.departureDate,
        cupos_total: input.cuposTotal,
      },
      status: result.ok ? 'sent' : 'failed',
      error_message: result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    })

    return { ok: result.ok, error: result.error }
  } catch (error) {
    // Un fallo avisando no puede tumbar la baja del paquete, que ya se hizo.
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[cupo-sold-out] No se pudo avisar:', message)
    return { ok: false, error: message }
  }
}
