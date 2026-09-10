import { checkAndSendManualQuoteNotifications } from '@/lib/notifications/manual-quote'
import type { HandlerDefinition } from '../types'

/** Un solo resumen a Slack con los paquetes en revisión manual (la función ya dedupea a uno por 24 h). */
export const packageRequoteNotifyHandler: HandlerDefinition = {
  kind: 'package.requote.notify',
  lane: 'default',
  description: 'Monitoreo de precio: resumen a Slack de los paquetes que quedaron en revisión manual',
  handler: async ({ log }) => {
    const r = await checkAndSendManualQuoteNotifications()
    await log(`Monitoreo de precio: aviso a Slack ${r.sent > 0 ? 'enviado' : 'no enviado'} (${r.total} en revisión manual): ${r.message}`, { sent: r.sent, total: r.total }, r.success ? 'info' : 'warning')
    if (!r.success) return { ok: false, error: r.error ?? r.message, retry: false, result: { sent: r.sent, total: r.total } }
    return { ok: true, result: { sent: r.sent, total: r.total } }
  },
}
