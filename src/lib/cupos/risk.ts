import type { Db } from '@/lib/jobs/types'
import { loadFlightsForMatch } from '@/lib/packages/flight-match'
import { buildCupoSummary, type CupoSummaryRow } from './summary'
import { sendSlackMessage } from '@/lib/slack/client'

/**
 * Semáforo de riesgo de cada cupo (recomendación del consultor): rojo si más
 * del 25 % sigue sin vender a 45 días o menos; amarillo si más del 40 % a 60
 * días o menos. Verde el resto; gris si ya está agotado o ya voló.
 */
export type RiskLevel = 'green' | 'yellow' | 'red' | 'none'

export function riskLevelFor(input: { remaining: number; total: number; daysToDeparture: number }): RiskLevel {
  if (input.total <= 0 || input.remaining <= 0 || input.daysToDeparture < 0) return 'none'
  const unsold = input.remaining / input.total
  if (input.daysToDeparture <= 45 && unsold > 0.25) return 'red'
  if (input.daysToDeparture <= 60 && unsold > 0.4) return 'yellow'
  return 'green'
}

export const RISK_LABELS: Record<RiskLevel, string> = { green: 'Bien', yellow: 'Riesgo', red: 'Riesgo alto', none: '' }

const ORDER: Record<RiskLevel, number> = { none: 0, green: 1, yellow: 2, red: 3 }

/** Evalúa todos los cupos futuros, guarda el nivel en flights (ida y vuelta) y avisa en Slack los que empeoraron. */
export async function evaluateCupoRisk(db: Db, options: { systemUrl?: string } = {}): Promise<{ evaluated: number; red: number; yellow: number; worsened: number; notified: boolean }> {
  const today = new Date().toISOString().slice(0, 10)
  const flights = await loadFlightsForMatch(db, { activeOnly: true })
  const rows = buildCupoSummary({ flights, linkedPackagesByFlight: new Map(), destinationsByPackage: new Map(), today })
  const { data: current } = await db.from('flights').select('id, risk_level, paired_flight_id').in('id', rows.map(r => r.flightId))
  const prev = new Map((current ?? []).map(f => [Number(f.id), { level: (f.risk_level as RiskLevel | null) ?? 'none', paired: f.paired_flight_id as number | null }]))
  const worsened: Array<CupoSummaryRow & { level: RiskLevel; before: RiskLevel }> = []
  let red = 0, yellow = 0
  const now = new Date().toISOString()
  for (const r of rows) {
    const level = riskLevelFor({ remaining: r.remaining, total: r.total, daysToDeparture: r.daysToDeparture })
    if (level === 'red') red++; if (level === 'yellow') yellow++
    const before = prev.get(r.flightId)?.level ?? 'none'
    const ids = [r.flightId, ...(prev.get(r.flightId)?.paired ? [Number(prev.get(r.flightId)!.paired)] : [])]
    await db.from('flights').update({ risk_level: level, risk_evaluated_at: now }).in('id', ids)
    if (ORDER[level] > ORDER[before] && level !== 'green') worsened.push({ ...r, level, before })
  }
  let notified = false
  if (worsened.length > 0) {
    const { data: s } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url, slack_channel_producto').eq('id', 1).maybeSingle()
    if (s?.slack_enabled && s.slack_webhook_url) {
      const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
      const lines = worsened.sort((a, b) => ORDER[b.level] - ORDER[a.level] || a.daysToDeparture - b.daysToDeparture).map(w => `${w.level === 'red' ? '🔴' : '🟡'} *${w.destination}* ${fmt(w.departureDate)}: quedan ${w.remaining} de ${w.total} a ${w.daysToDeparture} días${w.packages?.length ? ` · SIV ${w.packages.map(p => p.tcPackageId).join(', ')}` : ''}`)
      const r = await sendSlackMessage(s.slack_webhook_url, { text: `Cupos en riesgo (${worsened.length}):\n${lines.join('\n')}\nVer: ${options.systemUrl ?? 'https://hub.siviajo.com'}/dashboard` })
      notified = r.ok
    }
  }
  return { evaluated: rows.length, red, yellow, worsened: worsened.length, notified }
}
