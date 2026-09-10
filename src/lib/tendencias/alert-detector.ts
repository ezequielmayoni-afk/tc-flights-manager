import { isBreakout, parseRisingValue } from './collectors/google-related'
import type { GenericRelatedList, TrendDestination, TrendAlert } from './types'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

/**
 * Alertas a partir de los destinos puntuados:
 * - Pico de demanda (surging) con o sin paquetes.
 * - Hueco de catálogo: trending sin paquetes.
 * - Caída fuerte con paquetes activos (revisar campañas).
 */
export function detectAlerts(destinations: TrendDestination[]): TrendAlert[] {
  const alerts: TrendAlert[] = []

  for (const dest of destinations) {
    if (dest.momentum === 'surging' && dest.trendScore >= 30) {
      alerts.push({
        destination: dest.destination,
        alertType: 'demand_spike',
        severity: dest.hasPackages ? 'warning' : 'critical',
        title: `${dest.destination}: demanda en alza +${dest.changePct}%`,
        description: dest.hasPackages
          ? `${dest.destination} está explotando. Tenés ${dest.matchingPackageCount} paquete(s): buen momento para campañar.`
          : `${dest.destination} está explotando pero no tenés paquetes. Oportunidad perdida si no actuás.`,
        source: 'scoring',
        data: {
          trendScore: dest.trendScore,
          changePct: dest.changePct,
          hasPackages: dest.hasPackages,
          matchingPackageCount: dest.matchingPackageCount,
          destinationSlug: dest.destinationSlug,
        },
        dedupeKey: `demand_spike:${dest.destinationSlug}`,
      })
    }

    if (dest.classification === 'gap' && dest.trendScore >= 40) {
      alerts.push({
        destination: dest.destination,
        alertType: 'competitor_gap',
        severity: 'warning',
        title: `Hueco: ${dest.destination} trending (score ${dest.trendScore}) sin paquetes`,
        description: `Los argentinos están buscando ${dest.destination} y Sí, viajo no tiene paquetes. Considerar agregarlo al catálogo.`,
        source: 'classifier',
        data: {
          trendScore: dest.trendScore,
          momentum: dest.momentum,
          region: dest.region,
          destinationSlug: dest.destinationSlug,
          buyQueries: dest.relatedQueries.filter(q => q.intent === 'buy').map(q => q.query).slice(0, 5),
        },
        dedupeKey: `competitor_gap:${dest.destinationSlug}`,
      })
    }

    if (dest.momentum === 'falling' && dest.changePct !== null && dest.changePct < -40 && dest.hasPackages) {
      alerts.push({
        destination: dest.destination,
        alertType: 'demand_spike',
        severity: 'info',
        title: `${dest.destination}: demanda cayendo ${dest.changePct}%`,
        description: `${dest.destination} está perdiendo interés rápido. Tenés ${dest.matchingPackageCount} paquete(s) activo(s): revisar si conviene pausar campañas.`,
        source: 'scoring',
        data: {
          trendScore: dest.trendScore,
          changePct: dest.changePct,
          matchingPackageCount: dest.matchingPackageCount,
          destinationSlug: dest.destinationSlug,
        },
        dedupeKey: `demand_drop:${dest.destinationSlug}`,
      })
    }
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  return alerts
}

/**
 * Consultas genéricas en alza fuerte que nombran un destino ("paquetes a
 * florianopolis 2026", "msc cruceros +3.800 %"): una alerta informativa por
 * destino, salvo que ya tenga una de demanda en esta corrida.
 */
const MAX_RISING_ALERTS = 8

export function detectRisingQueryAlerts(lists: GenericRelatedList[], destinations: TrendDestination[], existing: TrendAlert[]): TrendAlert[] {
  const bySlug = new Map(destinations.map(d => [d.destinationSlug, d]))
  const covered = new Set(existing.filter(a => a.alertType === 'demand_spike').map(a => a.destination))
  const alerts: TrendAlert[] = []
  for (const list of lists) {
    for (const r of list.rising) {
      if (!r.slug) continue
      const dest = bySlug.get(r.slug)
      if (!dest || covered.has(dest.destination)) continue
      const pct = parseRisingValue(r.value)
      if (!isBreakout(r.value) && (pct === null || pct < 100)) continue
      covered.add(dest.destination)
      alerts.push({
        destination: dest.destination,
        alertType: 'demand_spike',
        severity: dest.hasPackages ? 'info' : 'warning',
        title: `En alza en Google: "${r.query}" (${r.value})`,
        description: dest.hasPackages
          ? `La búsqueda "${r.query}" está creciendo en Argentina. Tenés ${dest.matchingPackageCount} paquete(s) de ${dest.destination}.`
          : `La búsqueda "${r.query}" está creciendo en Argentina y no tenés paquetes de ${dest.destination}.`,
        source: 'google_related',
        data: { query: r.query, value: r.value, seed: list.seed, destinationSlug: dest.destinationSlug, trendScore: dest.trendScore, hasPackages: dest.hasPackages },
        dedupeKey: `rising_query:${dest.destinationSlug}:${r.query}`,
      })
    }
  }
  const order = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, MAX_RISING_ALERTS)
}
