import { sendSlackMessage, type SlackMessage } from '@/lib/slack/client'
import type { Db } from '@/lib/jobs/types'

/**
 * Avisos del loop a Slack (canal de automatización, o el de marketing si no
 * hay uno configurado). Mismo molde que el resto: configuración, dedupe
 * contra notification_logs y registro. Nunca lanza.
 */

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

export interface AutomationNoticeInput {
  type: string
  title: string
  lines: string[]
  packageId?: number | null
  metaAdId?: string | null
  /** Clave para no repetir el mismo aviso dentro de la ventana. */
  dedupeKey?: string
  dedupeHours?: number
  level?: 'info' | 'warning' | 'critical'
  /** Enlace de acción (por defecto, la pantalla de tareas). */
  url?: string
  data?: Record<string, unknown>
}

const EMOJI: Record<NonNullable<AutomationNoticeInput['level']>, string> = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }

export function buildAutomationMessage(input: AutomationNoticeInput): SlackMessage {
  const level = input.level ?? 'info'
  const url = input.url ?? `${SYSTEM_URL}/tareas`
  const body = input.lines.map(l => `• ${l}`).join('\n')
  return {
    text: `${EMOJI[level]} ${input.title}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${EMOJI[level]} ${input.title}`.slice(0, 150) } },
      { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) || '—' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<${url}|Ver en HUB> · automático` }] },
    ],
  }
}

export async function notifyAutomation(db: Db, input: AutomationNoticeInput): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  try {
    const { data: settings } = await db.from('notification_settings').select('*').eq('id', 1).single()
    if (!settings?.slack_enabled || !settings?.slack_webhook_url) return { ok: false, skipped: 'Slack no está habilitado' }

    if (input.dedupeKey) {
      const since = new Date(Date.now() - (input.dedupeHours ?? 24) * 3_600_000).toISOString()
      const { data: recent } = await db
        .from('notification_logs')
        .select('id')
        .eq('notification_type', input.type)
        .eq('message_title', input.dedupeKey)
        .gte('created_at', since)
        .limit(1)
      if (recent && recent.length > 0) return { ok: false, skipped: 'Ya se avisó esto en la ventana de dedupe' }
    }

    const channel = settings.slack_channel_automation || settings.slack_channel_marketing || '#marketing'
    const result = await sendSlackMessage(settings.slack_webhook_url, buildAutomationMessage(input))
    await db.from('notification_logs').insert({
      notification_type: input.type,
      channel: 'slack',
      recipient: channel,
      package_id: input.packageId ?? null,
      meta_ad_id: input.metaAdId ?? null,
      message_title: input.dedupeKey ?? input.title,
      message_body: input.lines.join('\n'),
      message_data: input.data ?? null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.error ?? null,
      slack_message_ts: result.ts ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    })
    return { ok: result.ok, error: result.error }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
