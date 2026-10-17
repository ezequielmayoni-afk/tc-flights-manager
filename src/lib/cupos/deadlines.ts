import type { Db } from '@/lib/jobs/types'
import { sendSlackMessage } from '@/lib/slack/client'

/** Pedidos enviados a aéreos que pasaron el plazo sin respuesta: un recordatorio por día a Slack (y, cuando esté, por mail). */
export async function checkCupoRequestDeadlines(db: Db, systemUrl: string): Promise<{ overdue: number; reminded: number; error?: string }> {
  const now = new Date()
  const { data, error } = await db.from('cupo_requests').select('id, title, sent_at, response_deadline_at, reminded_at, sent_to').eq('status', 'sent').lt('response_deadline_at', now.toISOString())
  if (error) return { overdue: 0, reminded: 0, error: error.message }
  const overdue = data ?? []
  const toRemind = overdue.filter(r => !r.reminded_at || Date.parse(r.reminded_at) < now.getTime() - 24 * 3600000)
  if (toRemind.length === 0) return { overdue: overdue.length, reminded: 0 }
  const { data: s } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url').eq('id', 1).maybeSingle()
  if (!s?.slack_enabled || !s.slack_webhook_url) return { overdue: overdue.length, reminded: 0, error: 'Slack apagado' }
  const lines = toRemind.map(r => { const hours = Math.round((now.getTime() - Date.parse(r.sent_at as string)) / 3600000); return `• #${r.id} ${r.title}: ${hours} h sin respuesta${(r.sent_to as string[] | null)?.length ? ` (${(r.sent_to as string[]).join(', ')})` : ''} → ${systemUrl}/flights/pedidos/${r.id}` })
  const res = await sendSlackMessage(s.slack_webhook_url, { text: `⏰ Pedidos de cupos vencidos sin respuesta de aéreos (${toRemind.length}):\n${lines.join('\n')}` })
  if (res.ok) await db.from('cupo_requests').update({ reminded_at: now.toISOString() }).in('id', toRemind.map(r => r.id))
  return { overdue: overdue.length, reminded: res.ok ? toRemind.length : 0, error: res.ok ? undefined : res.error }
}
