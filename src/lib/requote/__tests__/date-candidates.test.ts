import { describe, expect, it } from 'vitest'
import { candidateDates, rankDates } from '../date-candidates'
import type { FareCell } from '@/lib/producto/types'

const window = { kind: 'alta' as const, months: [1, 2], from: '2027-01-01', to: '2027-02-28', label: 'temporada alta (enero–febrero 2027)' }
const cell = (date: string, price: number, direct: boolean): FareCell => ({ date, pricePerPax: price, currency: 'USD', direct, durationMinutes: direct ? 480 : 700, airline: direct ? 'Arajet' : 'Avianca', source: 'cotizador_probe' })
const profile = { stopover_threshold_pct: 17, stopover_modifiers: { short_trip: 10, kids: 5, overnight: 12, origin_interior: -7, half_direct: 0.66 }, direct_required: false }
const ctx = { nights: 9, hasKids: false, originInterior: false }

describe('candidateDates', () => {
  it('mismo día de la semana que la salida original, cada semana de la ventana', () => {
    const dates = candidateDates(window, '2027-01-17')
    expect(dates).toEqual(['2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24', '2027-01-31', '2027-02-07', '2027-02-14', '2027-02-21', '2027-02-28'])
    expect(dates.every(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 0)).toBe(true)
  })
  it('con tope se queda con las más cercanas a la original', () => {
    expect(candidateDates(window, '2027-01-17', { maxDates: 3 })).toEqual(['2027-01-10', '2027-01-17', '2027-01-24'])
  })
  it('ventana corta: suma fechas intermedias para tener al menos cuatro', () => {
    const dates = candidateDates({ ...window, from: '2027-02-10', to: '2027-02-28' }, '2027-01-17')
    expect(dates.length).toBeGreaterThanOrEqual(4)
    expect(dates.every(d => d >= '2027-02-10' && d <= '2027-02-28')).toBe(true)
  })
})

describe('rankDates', () => {
  it('ordena por el precio de la tarifa que eligió la regla directo/escala', () => {
    const by = new Map<string, FareCell[]>([
      ['2027-01-10', [cell('2027-01-10', 1200, true), cell('2027-01-10', 1150, false)]],  // escala ahorra 4 % < 17 % → directo 1200
      ['2027-02-07', [cell('2027-02-07', 1300, true), cell('2027-02-07', 900, false)]],    // escala ahorra 31 % → escala 900
      ['2027-01-24', [cell('2027-01-24', 1000, true)]],
    ])
    const r = rankDates(by, profile, ctx)
    expect(r.map(x => `${x.date}:${x.cell.pricePerPax}:${x.cell.direct ? 'd' : 'e'}`)).toEqual(['2027-02-07:900:e', '2027-01-24:1000:d', '2027-01-10:1200:d'])
  })
  it('directo obligatorio descarta fechas sin directo', () => {
    const by = new Map<string, FareCell[]>([['2027-01-10', [cell('2027-01-10', 800, false)]], ['2027-01-24', [cell('2027-01-24', 1000, true)]]])
    expect(rankDates(by, { ...profile, direct_required: true }, ctx).map(x => x.date)).toEqual(['2027-01-24'])
  })
  it('ignora precios inválidos', () => {
    const by = new Map<string, FareCell[]>([['2027-01-10', [cell('2027-01-10', 0, true)]]])
    expect(rankDates(by, profile, ctx)).toEqual([])
  })
})
