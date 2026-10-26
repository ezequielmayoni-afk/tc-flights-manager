/** `giftcard.reconcile` (cada hora): relee en MP los pedidos pendientes, emite vouchers pagados que fallaron y vence los viejos. */
import type { HandlerDefinition } from '../types'
import { reconcilePending } from '@/lib/giftcard/issue'

export const giftcardReconcileHandler: HandlerDefinition = {
  kind: 'giftcard.reconcile',
  description: 'Gift cards: concilia pedidos pendientes contra Mercado Pago, emite vouchers pagados que fallaron y vence los viejos (cada hora).',
  lane: 'default',
  handler: async ({ db, log }) => {
    const r = await reconcilePending(db as never)
    log(`gift cards: revisados ${r.checked}, emitidos ${r.issued}, vencidos ${r.expired}, errores ${r.errors}`)
    return { ok: true, result: { ...r } }
  },
}
