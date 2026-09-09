import { buildCreativeRequestMessage, sendSlackMessage } from '@/lib/slack/client'
import type { Db } from '@/lib/jobs/types'

/**
 * Pedido de creatividad disparado por el sistema (guard, autopilot, salidas).
 * Mismo flujo que el pedido humano de bulk-action (fila en creative_requests
 * + Slack a diseño + notification_logs), con `source='auto'` y una clave de
 * disparo para no pedir dos veces lo mismo mientras el pedido siga abierto.
 */

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

export type AutoCreativeReason = 'sold_out_departure' | 'price_change' | 'fatigue' | 'scarcity' | 'new_departure'

export interface AutoCreativeRequestInput {
  packageId: number
  tcPackageId: number
  packageTitle: string
  reason: AutoCreativeReason
  reasonDetail: string
  triggerKey: string
  priority?: 'urgent' | 'normal' | 'low'
  adDecisionId?: number | null
  ideaId?: number | null
}

export async function createAutoCreativeRequest(db: Db, input: AutoCreativeRequestInput): Promise<{ id: number; created: boolean }> {
  const { data: existing } = await db
    .from('creative_requests')
    .select('id')
    .eq('trigger_key', input.triggerKey)
    .in('status', ['pending', 'in_progress'])
    .limit(1)
    .maybeSingle()
  if (existing) return { id: (existing as { id: number }).id, created: false }

  const priority = input.priority ?? 'normal'
  const { data, error } = await db
    .from('creative_requests')
    .insert({
      package_id: input.packageId,
      tc_package_id: input.tcPackageId,
      requested_by: 'HUB (automático)',
      reason: input.reason,
      reason_detail: input.reasonDetail,
      priority,
      status: 'pending',
      source: 'auto',
      trigger_key: input.triggerKey,
      ad_decision_id: input.adDecisionId ?? null,
      idea_id: input.ideaId ?? null,
    })
    .select('id')
    .single()
  if (error || !data) {
    // 23505 = otro proceso creó el mismo pedido entre el select y el insert.
    if (error?.code === '23505') {
      const { data: again } = await db.from('creative_requests').select('id').eq('trigger_key', input.triggerKey).in('status', ['pending', 'in_progress']).limit(1).maybeSingle()
      if (again) return { id: (again as { id: number }).id, created: false }
    }
    throw new Error(`No se pudo crear el pedido de creatividad: ${error?.message ?? 'sin datos'}`)
  }
  const requestId = (data as { id: number }).id

  const { data: settings } = await db.from('notification_settings').select('*').eq('id', 1).single()
  if (settings?.slack_enabled && settings?.slack_webhook_url && settings?.notify_creative_request !== false) {
    const message = buildCreativeRequestMessage({
      requestId,
      packageId: input.packageId,
      tcPackageId: input.tcPackageId,
      packageTitle: input.packageTitle,
      requestedBy: 'HUB (automático)',
      reason: input.reason,
      reasonDetail: input.reasonDetail,
      priority,
      systemUrl: SYSTEM_URL,
    })
    const slack = await sendSlackMessage(settings.slack_webhook_url, message)
    await db.from('notification_logs').insert({
      notification_type: 'creative_request',
      channel: 'slack',
      recipient: settings.slack_channel_design || '#design',
      package_id: input.packageId,
      creative_request_id: requestId,
      message_title: `Pedido automático de creativo para ${input.tcPackageId} (${input.reason})`,
      message_data: { reason: input.reason, priority, trigger_key: input.triggerKey },
      status: slack.ok ? 'sent' : 'failed',
      error_message: slack.error ?? null,
      slack_message_ts: slack.ts ?? null,
      sent_at: slack.ok ? new Date().toISOString() : null,
    })
    if (slack.ok) await db.from('creative_requests').update({ slack_notified_at: new Date().toISOString(), slack_message_ts: slack.ts }).eq('id', requestId)
  }
  return { id: requestId, created: true }
}
