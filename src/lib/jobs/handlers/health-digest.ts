import { notifyAutomation } from '@/lib/notifications/automation'
import type { HandlerDefinition } from '../types'

/** Resumen diario del loop a Slack (07:00 ART): jobs, decisiones, integraciones. */
export const healthDigestHandler: HandlerDefinition = {
  kind: 'health.digest',
  lane: 'default',
  description: 'Digest diario a Slack: jobs de las últimas 24 h, decisiones del guard, salud de integraciones',
  handler: async ({ db, log }) => {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const [jobs, decisions, health, proposed] = await Promise.all([
      db.from('hub_jobs').select('kind, status').gte('created_at', since),
      db.from('ad_decisions').select('rule, action, status').gte('created_at', since),
      db.from('integration_status').select('provider, status').order('provider'),
      db.from('ad_decisions').select('id', { count: 'exact', head: true }).eq('status', 'proposed'),
    ])
    const byStatus: Record<string, number> = {}
    for (const j of (jobs.data ?? []) as Array<{ status: string }>) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1
    const failedKinds = [...new Set(((jobs.data ?? []) as Array<{ kind: string; status: string }>).filter(j => j.status === 'failed').map(j => j.kind))]
    const dec = (decisions.data ?? []) as Array<{ rule: string; action: string; status: string }>
    const decLines = Object.entries(dec.reduce((acc, d) => { const k = `${d.rule} → ${d.action} (${d.status})`; acc[k] = (acc[k] ?? 0) + 1; return acc }, {} as Record<string, number>)).map(([k, n]) => `${n} × ${k}`)
    const bad = ((health.data ?? []) as Array<{ provider: string; status: string }>).filter(h => h.status === 'down' || h.status === 'degraded')

    const lines = [
      `Jobs 24 h: ${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ') || 'ninguno'}${failedKinds.length ? ` · fallaron: ${failedKinds.join(', ')}` : ''}`,
      decLines.length ? `Guard: ${decLines.join(' · ')}` : 'Guard: sin decisiones nuevas',
      `Decisiones esperando aprobación: ${proposed.count ?? 0}`,
      bad.length ? `Integraciones con problemas: ${bad.map(b => `${b.provider} ${b.status}`).join(', ')}` : 'Integraciones: todas ok',
    ]
    const r = await notifyAutomation(db, { type: 'daily_digest', title: 'Resumen diario del loop', lines, dedupeKey: `daily_digest:${new Date().toISOString().slice(0, 10)}`, level: bad.length || failedKinds.length ? 'warning' : 'info' })
    await log(`Digest diario ${r.ok ? 'enviado' : r.skipped ? `omitido (${r.skipped})` : `falló (${r.error})`}`, { lines })
    return { ok: true, result: { sent: r.ok, lines } }
  },
}
