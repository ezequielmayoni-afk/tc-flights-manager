import { describe, expect, it } from 'vitest'
import { classifyDestinations } from '../classifier'
import { detectAlerts } from '../alert-detector'
import type { TrendDestination } from '../types'

function dest(overrides: Partial<TrendDestination>): TrendDestination {
  return {
    destination: 'X', destinationSlug: 'x', region: 'caribe', trendScore: 50, rank: 1,
    signals: {},
    prevWeekScore: null, changePct: null, momentum: 'new', hasPackages: false, matchingPackageCount: 0,
    matchingPackageIds: [], cheapestPackagePrice: null, classification: 'declining', relatedQueries: [], rawSignals: {},
    ...overrides,
  }
}

describe('classifyDestinations', () => {
  it('matriz score × catálogo', () => {
    const [a, b, c, d] = classifyDestinations([
      dest({ trendScore: 90, hasPackages: true, momentum: 'stable' }),
      dest({ trendScore: 90, hasPackages: false, momentum: 'stable' }),
      dest({ trendScore: 5, hasPackages: true }),
      dest({ trendScore: 5, hasPackages: false }),
    ])
    expect(a.classification).toBe('opportunity')
    expect(b.classification).toBe('gap')
    expect(c.classification).toBe('saturated')
    expect(d.classification).toBe('declining')
  })

  it('un destino en alza con score medio también es accionable', () => {
    const [rising, stable] = classifyDestinations([
      dest({ trendScore: 20, hasPackages: true, momentum: 'rising' }),
      dest({ trendScore: 20, hasPackages: true, momentum: 'stable' }),
      dest({ trendScore: 100, momentum: 'stable' }),
      dest({ trendScore: 95, momentum: 'stable' }),
      dest({ trendScore: 90, momentum: 'stable' }),
    ])
    expect(rising.classification).toBe('opportunity')
    expect(stable.classification).toBe('saturated')
  })
})

describe('detectAlerts', () => {
  it('pico sin paquetes es crítico, con paquetes es atención', () => {
    const alerts = detectAlerts([
      dest({ destination: 'Aruba', momentum: 'surging', changePct: 80, trendScore: 60, hasPackages: false, classification: 'gap' }),
      dest({ destination: 'Cancún', momentum: 'surging', changePct: 70, trendScore: 60, hasPackages: true, matchingPackageCount: 3, classification: 'opportunity' }),
    ])
    const aruba = alerts.filter(a => a.destination === 'Aruba')
    expect(aruba.map(a => `${a.alertType}:${a.severity}`)).toEqual(['demand_spike:critical', 'competitor_gap:warning'])
    expect(alerts.find(a => a.destination === 'Cancún')?.severity).toBe('warning')
    expect(alerts[0].severity).toBe('critical')
  })

  it('caída fuerte con paquetes avisa para revisar campañas', () => {
    const alerts = detectAlerts([dest({ destination: 'Miami', momentum: 'falling', changePct: -55, trendScore: 20, hasPackages: true, matchingPackageCount: 2, classification: 'saturated' })])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('info')
  })

  it('un hueco con score bajo no alerta', () => {
    expect(detectAlerts([dest({ trendScore: 30, classification: 'gap' })])).toHaveLength(0)
  })
})
