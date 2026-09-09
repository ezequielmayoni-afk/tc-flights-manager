import { describe, expect, it } from 'vitest'
import { decideStopover, effectiveThreshold } from '../stopover-rule'
import { pickDate, adjustedPrice } from '../date-picker'
import { validateIdea } from '../validate-idea'
import type { DestinationProfile, FareCell } from '../types'

const modifiers = { short_trip: 10, kids: 5, overnight: 12, origin_interior: -7, half_direct: 0.66 }

function profile(overrides: Partial<DestinationProfile> = {}): DestinationProfile {
  return {
    code: 'PUJ', name: 'Punta Cana', aliases: [], family: 'caribe', tc_destination_code: 'PUJ', iata_airport: 'PUJ',
    regimen_required: 'all_inclusive', regimen_allowed: ['all_inclusive'], nights_default: 7, nights_allowed: [7, 8, 9, 10],
    stars_default: 5, stars_min: 4, high_season_months: [1, 2, 7], booking_window_days: 90,
    stopover_threshold_pct: 22, stopover_modifiers: modifiers, airlines_by_origin: { EZE: ['AR', 'CM'] },
    themes_default: ['Caribe'], direct_required: false, auto_publish: false, auto_requote: false, price_tolerance_pct: 3, active: true,
    ...overrides,
  }
}

function cell(date: string, price: number, direct: boolean, duration: number | null = null, extra: Partial<FareCell> = {}): FareCell {
  return { date, pricePerPax: price, currency: 'USD', direct, durationMinutes: duration, airline: direct ? 'AR' : 'CM', source: 'tc_search', stops: direct ? 0 : 1, ...extra }
}

describe('effectiveThreshold', () => {
  it('ajusta por viaje corto, menores, pernocte y origen del interior', () => {
    const p = profile()
    expect(effectiveThreshold(p, { nights: 7, hasKids: false, originInterior: false }, { stops: 2, overnightStop: false })).toBe(22)
    expect(effectiveThreshold(p, { nights: 4, hasKids: true, originInterior: false }, { stops: 2, overnightStop: true })).toBe(49)
    expect(effectiveThreshold(p, { nights: 7, hasKids: false, originInterior: true }, { stops: 2, overnightStop: false })).toBe(15)
    // Una escala corta pide dos tercios del umbral
    expect(effectiveThreshold(p, { nights: 7, hasKids: false, originInterior: false }, { stops: 1, overnightStop: false })).toBe(14.5)
  })
  it('sin umbral (Asia) devuelve null', () => {
    expect(effectiveThreshold(profile({ stopover_threshold_pct: null }), { nights: 10, hasKids: false, originInterior: false }, null)).toBeNull()
  })
})

describe('decideStopover', () => {
  const ctx = { nights: 7, hasKids: false, originInterior: false }
  it('elige escala sólo si el ahorro supera el umbral', () => {
    const direct = cell('2027-03-12', 1500, true)
    expect(decideStopover(profile(), ctx, direct, cell('2027-03-12', 1250, false)).choice).toBe('stopover') // ahorra 16,7 % > 14,5
    expect(decideStopover(profile(), ctx, direct, cell('2027-03-12', 1350, false)).choice).toBe('direct')   // ahorra 10 %
  })
  it('respeta directo obligatorio y la falta de opciones', () => {
    expect(decideStopover(profile({ direct_required: true }), ctx, cell('d', 1500, true), cell('d', 900, false)).choice).toBe('direct')
    expect(decideStopover(profile(), ctx, null, cell('d', 900, false)).choice).toBe('only_option')
    expect(decideStopover(profile(), ctx, cell('d', 900, true), null).choice).toBe('direct')
  })
})

describe('pickDate', () => {
  const cells = [
    cell('2027-03-05', 1400, true, 600),
    cell('2027-03-12', 1150, false, 1080),  // barata pero 8 h más larga: +200 ajustado = 1350
    cell('2027-03-19', 1300, true, 600),
    cell('2027-03-26', 1250, true, 600),
    cell('2027-04-02', 900, true, 600),     // fuera de ventana
  ]
  const ctx = { nights: 7, hasKids: false, originInterior: false }
  it('elige por precio ajustado por duración y aplica la regla directo/escala', () => {
    const pick = pickDate(cells, profile(), ctx, { from: '2027-03-01', to: '2027-03-31' })!
    expect(pick.chosen.date).toBe('2027-03-26')
    expect(pick.stopover.choice).toBe('direct')
    expect(pick.alternatives.map(a => a.date)).toEqual(['2027-03-19', '2027-03-12', '2027-03-05']) // por precio ajustado: 1300, 1350, 1400
    expect(adjustedPrice(cells[1], 600)).toBe(1350)
  })
  it('respeta exclusiones, días de la semana y tope de precio', () => {
    expect(pickDate(cells, profile(), ctx, { from: '2027-03-01', to: '2027-03-31', exclude: ['2027-03-26'] })!.chosen.date).toBe('2027-03-19')
    expect(pickDate(cells, profile(), ctx, { from: '2027-03-01', to: '2027-03-31', weekdays: [6] })).toBeNull()
    expect(pickDate(cells, profile(), ctx, { from: '2027-03-01', to: '2027-03-31', maxPricePerPax: 1000 })).toBeNull()
  })
})

describe('validateIdea', () => {
  const today = new Date(Date.UTC(2026, 8, 9))
  const base = { destinationCode: 'PUJ', origin: 'EZE', month: '2027-03', nights: 7, adults: 2, children: 0, regimen: 'all_inclusive' as const, starsMin: 4, directFlight: null }
  it('Punta Cana sin all inclusive no pasa', () => {
    const v = validateIdea({ ...base, regimen: 'desayuno' }, profile(), today)
    expect(v.ok).toBe(false)
    expect(v.hard[0]).toMatch(/all inclusive/)
  })
  it('una noche de diferencia avisa, tres bloquean', () => {
    expect(validateIdea({ ...base, nights: 6 }, profile(), today)).toMatchObject({ ok: true })
    expect(validateIdea({ ...base, nights: 6 }, profile(), today).soft[0]).toMatch(/6 noches/)
    expect(validateIdea({ ...base, nights: 3 }, profile(), today).ok).toBe(false)
  })
  it('directo obligatorio, estrellas mínimas y ventana de compra', () => {
    expect(validateIdea({ ...base, directFlight: false }, profile({ direct_required: true }), today).ok).toBe(false)
    expect(validateIdea({ ...base, starsMin: 3 }, profile(), today).ok).toBe(false)
    const soon = validateIdea({ ...base, month: '2026-10' }, profile(), today)
    expect(soon.ok).toBe(true)
    expect(soon.soft.some(s => s.includes('ventana de compra'))).toBe(true)
  })
})
