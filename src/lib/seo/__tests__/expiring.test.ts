import { describe, expect, it } from 'vitest'
import { buildExpiringMessage, findExpiring, type ExpiringCandidate } from '../expiring'

function c(over: Partial<ExpiringCandidate>): ExpiringCandidate {
  return { tcPackageId: 1, packageId: 10, title: 'Paquete a Bayahibe', departureDate: '2026-10-25', dateRangeEnd: null, tcActive: true, impressions: 500, clicks: 10, url: null, ...over }
}

describe('findExpiring', () => {
  const today = '2026-10-19'
  it('avisa por las fichas con tráfico que vencen en 7 días o ya vencieron, ordenadas por impresiones', () => {
    const out = findExpiring(
      [
        c({ tcPackageId: 1, departureDate: '2026-10-25', impressions: 100 }), // 6 días
        c({ tcPackageId: 2, departureDate: '2026-10-07', impressions: 274 }), // vencida
        c({ tcPackageId: 3, departureDate: '2026-11-30', impressions: 900 }), // lejos
        c({ tcPackageId: 4, departureDate: '2026-10-20', impressions: 5 }), // sin tráfico
        c({ tcPackageId: 5, departureDate: '2026-10-20', tcActive: false }), // inactiva
        c({ tcPackageId: 6, departureDate: '2026-10-20', dateRangeEnd: '2027-02-01' }), // rango vigente
      ],
      { today }
    )
    expect(out.map(a => [a.tcPackageId, a.reason, a.daysLeft])).toEqual([
      [2, 'vencida', -12],
      [1, 'por_vencer', 6],
    ])
  })
  it('respeta el umbral de impresiones y los días configurables', () => {
    const out = findExpiring([c({ departureDate: '2026-10-30', impressions: 30 })], { today, daysAhead: 14, minImpressions: 25 })
    expect(out).toHaveLength(1)
    expect(findExpiring([c({ departureDate: '2026-10-30', impressions: 30 })], { today, daysAhead: 7 })).toHaveLength(0)
  })
})

describe('buildExpiringMessage', () => {
  it('arma el texto con enlace, plazo y la advertencia de no desactivar', () => {
    const alerts = findExpiring([c({ departureDate: '2026-10-07', impressions: 274, clicks: 5 })], { today: '2026-10-19' })
    const msg = buildExpiringMessage(alerts)
    expect(msg).toContain('1 ficha con tráfico en Google vence o ya venció')
    expect(msg).toContain('venció hace 12 d')
    expect(msg).toContain('NO desactivar')
    expect(msg).toContain('https://www.siviajo.com/es/idea/1/x')
  })
})
