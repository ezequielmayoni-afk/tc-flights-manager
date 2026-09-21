import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, evaluatePackage, isHotWindow, marginPct, type CriteriaContext, type CriteriaPackage } from '../criteria'

const pkg: CriteriaPackage = { id: 1, tcPackageId: 111, title: 'Punta Cana 7 noches', status: 'imported', tcActive: true, needsManualQuote: false, pricePerPax: 1500, totalPrice: 3000, airCost: 1200, landCost: 1400, agencyFee: 330, departureDate: '2027-01-17', dateRangeEnd: null, destinationCodes: ['PUJ'], profileViolations: null, inMarketing: false }
const ctx: CriteriaContext = { today: '2026-10-08', cupo: null, operatorDeparture: false, family: null, trend: null, momentum: null, highSeasonMonths: null, bookingWindowDays: null, inMarketingSameDestination: 0 }

describe('marginPct', () => {
  it('usa la fee de agencia sobre el total cuando existe', () => { expect(marginPct(pkg)).toBe(11) })
  it('cae a total menos costos si no hay fee', () => { expect(marginPct({ ...pkg, agencyFee: null })).toBe(13.3) })
  it('sin total no hay margen', () => { expect(marginPct({ ...pkg, totalPrice: null })).toBeNull() })
  it('cupo de contrato sin desglose (fee 0, aéreo 0) → margen desconocido, no 1%', () => { expect(marginPct({ ...pkg, agencyFee: 0, airCost: 0, landCost: 2970 })).toBeNull() })
})

describe('isHotWindow', () => {
  it('aguinaldo, Travel Sale, fin de año y quincenas', () => {
    expect(isHotWindow('2026-06-25')).toBe(true); expect(isHotWindow('2026-08-12')).toBe(true); expect(isHotWindow('2026-12-15')).toBe(true)
    expect(isHotWindow('2026-10-03')).toBe(true); expect(isHotWindow('2026-10-17')).toBe(true); expect(isHotWindow('2026-10-08')).toBe(false)
  })
})

describe('evaluatePackage', () => {
  it('cupo con lugares en ventana + margen + tendencia → marketing', () => {
    const e = evaluatePackage({ ...pkg, agencyFee: 600 }, { ...ctx, cupo: { remaining: 10, total: 20 }, trend: 'opportunity', highSeasonMonths: [1, 2, 7, 12], bookingWindowDays: 120 })
    expect(e.components).toMatchObject({ cupo: 25, margin_good: 15, margin_great: 5, trend_opportunity: 15, high_season: 10 })
    expect(e.score).toBe(70); expect(e.track).toBe('marketing')
    expect(e.reasons).toContain('Cupo con 10 lugares a 101 días')
  })
  it('sin señales fuertes → web', () => {
    // Margen "justo" (8 %), sin cupo, sin tendencia, sin familia: nada suma.
    const e = evaluatePackage({ ...pkg, agencyFee: 240 }, ctx)
    expect(e.score).toBe(0); expect(e.track).toBe('web')
    // Con margen bueno (11 %) suma 15 pero sigue por debajo de "para decidir" (20).
    expect(evaluatePackage(pkg, ctx)).toMatchObject({ score: 15, track: 'web' })
  })
  it('zona intermedia → manual', () => {
    const e = evaluatePackage({ ...pkg, agencyFee: 600 }, { ...ctx, trend: 'opportunity' })
    expect(e.score).toBe(35); expect(e.track).toBe('manual')
  })
  it('penaliza canibalización, salida cercana y violaciones', () => {
    const e = evaluatePackage({ ...pkg, agencyFee: 600, departureDate: '2026-10-20', profileViolations: ['régimen'] }, { ...ctx, cupo: { remaining: 10, total: 20 }, inMarketingSameDestination: 3 })
    expect(e.components).toMatchObject({ cannibalization: -15, too_close: -25, profile_violation: -30 })
    expect(e.track).toBe('web')
  })
  it('riesgo de cupo: más del 40 % sin vender a menos de 60 días suma', () => {
    const e = evaluatePackage(pkg, { ...ctx, today: '2026-12-01', cupo: { remaining: 9, total: 20 } })
    expect(e.components.cupo_risk).toBe(15); expect(e.components.cupo).toBe(25)
  })
  it('excluye lo que no se puede vender', () => {
    expect(evaluatePackage({ ...pkg, tcActive: false }, ctx)).toMatchObject({ track: 'excluded', excludedBecause: 'Dado de baja en TC' })
    expect(evaluatePackage({ ...pkg, needsManualQuote: true }, ctx).track).toBe('excluded')
    expect(evaluatePackage({ ...pkg, pricePerPax: null }, ctx).excludedBecause).toBe('Sin precio')
    expect(evaluatePackage({ ...pkg, departureDate: '2026-09-01' }, ctx).excludedBecause).toBe('La salida ya pasó')
    // Paquete de sistema: la fecha vencida se recotiza dentro del rango, sigue vendible.
    const sys = evaluatePackage({ ...pkg, departureDate: '2026-09-01', dateRangeEnd: '2026-12-15' }, { ...ctx, cupo: null })
    expect(sys.excludedBecause).toBeNull(); expect(sys.components.too_close).toBeUndefined()
    // Cupo: el rango no cuenta, sale un día fijo.
    expect(evaluatePackage({ ...pkg, departureDate: '2026-09-01', dateRangeEnd: '2026-12-15' }, { ...ctx, cupo: { remaining: 4, total: 10 } }).excludedBecause).toBe('La salida ya pasó')
    expect(evaluatePackage({ ...pkg, departureDate: '2026-09-01', dateRangeEnd: '2026-09-15' }, { ...ctx, cupo: null }).excludedBecause).toBe('El rango de fechas ya venció')
  })
  it('lo que ya está en marketing conserva la vía aunque el score sea bajo', () => {
    const e = evaluatePackage({ ...pkg, inMarketing: true }, ctx)
    expect(e.track).toBe('marketing'); expect(e.reasons[0]).toBe('Ya está en marketing')
  })
  it('respeta pesos y umbrales editados', () => {
    const e = evaluatePackage({ ...pkg, agencyFee: 600 }, { ...ctx, trend: 'opportunity' }, { ...DEFAULT_RULES, weights: { ...DEFAULT_RULES.weights, trend_opportunity: 40 }, marketingMin: 55 })
    expect(e.score).toBe(60); expect(e.track).toBe('marketing')
  })

  it('salida grupal del operador suma y la familia pesa según las reglas', () => {
    const e = evaluatePackage({ ...pkg, agencyFee: 0, airCost: 0, landCost: 2970, pricePerPax: 4000 }, { ...ctx, operatorDeparture: true, family: 'europa' })
    expect(e.components.grupal).toBe(20); expect(e.components.family).toBeUndefined()
    expect(evaluatePackage(pkg, { ...ctx, family: 'caribe' }).components.family).toBe(15)
    expect(evaluatePackage(pkg, { ...ctx, family: 'argentina' }).components.family).toBe(-10)
  })
  it('ticket bajo penaliza: con USD 400 la pauta no se paga', () => {
    expect(evaluatePackage({ ...pkg, pricePerPax: 400 }, ctx).components.ticket_low).toBe(-15)
    expect(evaluatePackage({ ...pkg, pricePerPax: 2000 }, ctx).components.ticket_low).toBeUndefined()
  })
})
