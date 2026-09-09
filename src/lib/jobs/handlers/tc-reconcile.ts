import { getPackageInfo } from '@/lib/travelcompositor/client'
import { notifyAutomation } from '@/lib/notifications/automation'
import type { HandlerDefinition } from '../types'

const BATCH = 40

/**
 * Reconciliación nocturna: los paquetes que HUB tiene como dados de baja o no
 * visibles deberían estar inactivos en TC. Si TC los muestra activos (alguien
 * los reactivó o el PUT nunca llegó) se marcan como discrepancia y se avisa.
 * Los activos ya los verifica el refresh diario.
 */
export const tcReconcileHandler: HandlerDefinition = {
  kind: 'tc.reconcile',
  lane: 'tc',
  description: 'Compara el estado local (vencido / no visible) contra TC y marca discrepancias',
  handler: async ({ db, job, heartbeat, log }) => {
    const { data } = await db
      .from('packages')
      .select('id, tc_package_id, title, status, tc_active, tc_state_checked_at')
      .in('status', ['expired', 'not_visible'])
      .order('tc_state_checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH)
    const rows = (data ?? []) as Array<{ id: number; tc_package_id: number; title: string; status: string; tc_active: boolean; tc_state_checked_at: string | null }>
    const mismatches: string[] = []
    let checked = 0
    for (const p of rows) {
      try {
        const info = await getPackageInfo(p.tc_package_id)
        const mismatch = info.active === true
        await db.from('packages').update({ tc_state_mismatch: mismatch, tc_state_checked_at: new Date().toISOString(), tc_active: info.active }).eq('id', p.id)
        if (mismatch) mismatches.push(`SIV ${p.tc_package_id} · ${p.title} (${p.status} en HUB, activo en TC)`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // 404 = ya no existe en TC: coincide con "dado de baja".
        if (message.includes('404')) await db.from('packages').update({ tc_state_mismatch: false, tc_state_checked_at: new Date().toISOString(), tc_active: false }).eq('id', p.id)
      }
      checked++
      if (checked % 10 === 0) await heartbeat()
    }
    if (mismatches.length > 0) {
      await notifyAutomation(db, { type: 'tc_reconcile', title: `${mismatches.length} paquete(s) dados de baja en HUB pero activos en TC`, lines: mismatches.slice(0, 15), dedupeKey: `tc_reconcile:${new Date().toISOString().slice(0, 10)}`, level: 'warning', data: { count: mismatches.length } })
    }
    await log(`Reconciliación TC: ${checked} revisados, ${mismatches.length} discrepancias`, { mismatches }, mismatches.length ? 'warning' : 'info')
    return { ok: true, result: { checked, mismatches: mismatches.length, job: job.id } }
  },
}
