import { describe, expect, it } from 'vitest'
import { evaluatePackage, type GuardInput } from '../rules'

function input(overrides: Partial<GuardInput> = {}, pkg: Partial<GuardInput['package']> = {}): GuardInput {
  return {
    package: {
      id: 10, tcPackageId: 555, title: 'Punta Cana 7 noches', status: 'in_marketing', tcActive: true,
      departureDate: '2027-03-12', dateRangeEnd: '2027-03-12', needsManualQuote: false,
      currentPricePerPax: 1500, priceAtCreativeCreation: 1500, departureGroupId: null, writeLockUntil: null, ...pkg,
    },
    ads: [{ metaAdId: 'a1', status: 'ACTIVE', autoManaged: true, variant: 1 }, { metaAdId: 'a2', status: 'ACTIVE', autoManaged: true, variant: 2 }, { metaAdId: 'a3', status: 'PAUSED', autoManaged: true, variant: 3 }],
    links: [],
    siblings: [],
    insights: null,
    settings: { priceChangeThresholdPct: 5, ctrThresholdPct: 0.5, cplThreshold: 10, autoHideInTcOnSoldOut: false },
    today: '2026-09-10',
    weekLabel: '2026-W37',
    ...overrides,
  }
}

describe('evaluatePackage', () => {
  it('sin anuncios activos no decide nada', () => {
    expect(evaluatePackage(input({ ads: [] }))).toEqual([])
    expect(evaluatePackage(input({ ads: [{ metaAdId: 'x', status: 'ACTIVE', autoManaged: false, variant: 1 }] }))).toEqual([])
  })

  it('paquete vencido o no visible: pausa cada anuncio activo', () => {
    const d = evaluatePackage(input({}, { status: 'expired' }))
    expect(d.map(x => `${x.rule}:${x.action}:${x.metaAdId}`)).toEqual(['expired:pause:a1', 'expired:pause:a2'])
    expect(d[0].deterministic).toBe(true)
    expect(evaluatePackage(input({}, { status: 'not_visible' }))[0].rule).toBe('not_visible')
    expect(evaluatePackage(input({}, { tcActive: false }))[0].rule).toBe('tc_inactive')
    expect(evaluatePackage(input({}, { dateRangeEnd: '2026-09-01' }))[0].reason).toMatch(/ya pasó/)
  })

  it('vencido con otra salida de otra temporada: pausa, no redirige', () => {
    const d = evaluatePackage(input({ siblings: [{ packageId: 11, tcPackageId: 556, departureDate: '2027-07-10', hasSeats: true, sellable: true }] }, { dateRangeEnd: '2026-09-01' }))
    expect(d.map(x => x.action)).toEqual(['pause', 'pause'])
  })

  it('vencido con otra salida del grupo con lugares: redirige en vez de pausar', () => {
    const d = evaluatePackage(input({
      siblings: [
        { packageId: 11, tcPackageId: 556, departureDate: '2027-03-13', hasSeats: true, sellable: true },
        { packageId: 12, tcPackageId: 557, departureDate: '2027-03-19', hasSeats: false, sellable: true },
      ],
    }, { dateRangeEnd: '2026-09-01' }))
    expect(d.map(x => x.action)).toEqual(['redirect', 'request_creative'])
    expect(d[0].inputs.toTcPackageId).toBe(556)
    expect(d[1].inputs.creativeReason).toBe('sold_out_departure')
  })

  it('cupo agotado confirmado sin hermanas: pausa; con flag, además oculta en TC', () => {
    const links = [{ flightId: 7, flightLabel: 'AR1360 12/03', confidence: 'alta' as const, confirmed: false, remainingSeats: 0, totalSeats: 20, keptVisible: false }]
    const d = evaluatePackage(input({ links }))
    expect(d.map(x => x.action)).toEqual(['alert', 'pause', 'pause'])
    expect(d[0].rule).toBe('sold_out')
    const withHide = evaluatePackage(input({ links, settings: { priceChangeThresholdPct: 5, ctrThresholdPct: 0.5, cplThreshold: 10, autoHideInTcOnSoldOut: true } }))
    expect(withHide.map(x => x.action)).toEqual(['alert', 'pause', 'pause', 'hide_in_tc'])
  })

  it('cupo agotado con otra salida: nunca redirige; sólo sugiere en el aviso una de la misma temporada', () => {
    const links = [{ flightId: 566, flightLabel: '566 (2026-11-22)', confidence: 'alta' as const, confirmed: true, remainingSeats: 0, totalSeats: 10, keptVisible: false }]
    const pkg = { title: 'Paquete a Búzios con desayuno: 7 noches – Temporada baja 2026', departureDate: '2026-11-22', dateRangeEnd: '2026-11-22' }
    const febrero = { packageId: 11, tcPackageId: 38742558, departureDate: '2027-02-13', hasSeats: true, sellable: true }
    const d = evaluatePackage(input({ links, siblings: [febrero] }, pkg))
    expect(d.map(x => x.action)).toEqual(['alert', 'pause', 'pause'])
    expect(d[0].reason).toContain('No hay otra salida de la misma temporada (Temporada baja 2026)')
    expect(d[0].reason).not.toContain('38742558')
    const noviembre = { packageId: 12, tcPackageId: 40000001, departureDate: '2026-11-29', hasSeats: true, sellable: true }
    const d2 = evaluatePackage(input({ links, siblings: [febrero, noviembre] }, pkg))
    expect(d2.some(x => x.action === 'redirect')).toBe(false)
    expect(d2[0].reason).toContain('2026-11-29 (SIV 40000001)')
  })

  it('cupo agotado con vínculo de confianza media sólo avisa; si un humano lo mantuvo visible, no hace nada', () => {
    const media = [{ flightId: 7, flightLabel: 'AR1360', confidence: 'media' as const, confirmed: false, remainingSeats: 0, totalSeats: 20, keptVisible: false }]
    const d = evaluatePackage(input({ links: media }))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ rule: 'sold_out_unconfirmed', action: 'alert', deterministic: false })
    const kept = [{ ...media[0], keptVisible: true }]
    expect(evaluatePackage(input({ links: kept }))).toEqual([])
  })

  it('precio que subió: pide creatividad y propone pausar; si bajó, sólo creatividad', () => {
    const up = evaluatePackage(input({}, { currentPricePerPax: 1650 }))
    expect(up.map(x => `${x.rule}:${x.action}`)).toEqual(['price_drift:request_creative', 'price_drift:pause', 'price_drift:pause'])
    expect(up[1].deterministic).toBe(false)
    const down = evaluatePackage(input({}, { currentPricePerPax: 1400 }))
    expect(down.map(x => x.action)).toEqual(['request_creative'])
    expect(evaluatePackage(input({}, { currentPricePerPax: 1540 }))).toEqual([]) // +2,7 % < 5 %
  })

  it('rendimiento bajo con datos suficientes: un aviso por paquete y por semana', () => {
    const insights = { days: 7, spend: 120, impressions: 5000, clicks: 10, conversations: 4, ctrPct: 0.2, costPerConversation: 30 }
    const d = evaluatePackage(input({ insights }))
    expect(d.map(x => x.action)).toEqual(['alert'])
    expect(d[0].dedupeKey).toBe('guard:underperforming:pkg:10:2026-W37')
    expect(d[0].reason).toMatch(/CTR 0.2/)
    expect(d[0].reason).not.toMatch(/costo por conversación/) // 4 conversaciones no alcanzan para juzgar el costo
    expect(evaluatePackage(input({ insights: { ...insights, impressions: 300 } }))).toEqual([])
    const costly = evaluatePackage(input({ insights: { ...insights, ctrPct: 3, conversations: 20, costPerConversation: 30 } }))
    expect(costly[0].reason).toMatch(/costo por conversación USD 30/)
  })

  it('con bloqueo de escritura vigente no decide nada', () => {
    expect(evaluatePackage(input({}, { status: 'expired', writeLockUntil: '2999-01-01T00:00:00Z' }))).toEqual([])
  })
})
