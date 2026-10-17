import { describe, expect, it } from 'vitest'
import { candidateDepartures, pickOptionForDate, rankOptions, waitingHours } from '../requests'
import type { ProbeOption } from '@/lib/cotizador/client'

const opt = (over: Partial<ProbeOption>): ProbeOption => ({ pricePp: 1000, currency: 'USD', airline: 'JetSMART', flightOut: 'JA3822', flightBack: 'JA3825', departOut: '08:00', arriveOut: '10:30', departBack: '11:00', arriveBack: '13:30', durationOut: '2h30', durationBack: '2h30', durationOutMin: 150, durationBackMin: 150, stopsOut: 0, stopsBack: 0, maxLayoverH: 0, fareFamily: 'light', checkedBag: false, carryOn: true, personalItem: true, fares: [], ...over })

describe('candidateDepartures', () => {
  it('jueves y sábados de cada mes pedido, desde 21 días, repartidos entre meses', () => {
    const dates = candidateDepartures({ months: ['2027-03', '2027-04'], weekdays: [4, 6], today: '2027-02-20', maxDates: 8 })
    expect(dates.length).toBeLessThanOrEqual(8)
    expect(dates.every(d => d >= '2027-03-13')).toBe(true)
    expect(dates.every(d => [4, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))).toBe(true)
    expect(dates.some(d => d.startsWith('2027-03')) && dates.some(d => d.startsWith('2027-04'))).toBe(true)
  })
  it('sin meses válidos no hay fechas', () => { expect(candidateDepartures({ months: ['x'], weekdays: [6], today: '2027-01-01' })).toEqual([]) })
})

describe('pickOptionForDate', () => {
  it('elige la más barata que cumpla directo y aerolínea; si no hay, relaja en orden', () => {
    const options = [opt({ pricePp: 900, stopsOut: 1, airline: 'LATAM' }), opt({ pricePp: 1100, airline: 'JetSMART' }), opt({ pricePp: 1000, airline: 'Flybondi' })]
    expect(pickOptionForDate(options, { directOnly: true, airlinePref: ['JETSMART'] })?.pricePp).toBe(1100)
    expect(pickOptionForDate(options, { directOnly: true, airlinePref: ['AEROLINEAS'] })?.pricePp).toBe(1000)
    expect(pickOptionForDate(options, { directOnly: false, airlinePref: [] })?.pricePp).toBe(900)
    expect(pickOptionForDate([opt({ stopsOut: 1 })], { directOnly: true, airlinePref: [] })).toBeNull()
  })
})

describe('rankOptions / waitingHours', () => {
  it('ordena por precio y después directo primero', () => {
    const r = rankOptions([{ system_price_pp: 1200, direct: false, departure_date: '2027-03-06' }, { system_price_pp: 1000, direct: false, departure_date: '2027-03-13' }, { system_price_pp: 1000, direct: true, departure_date: '2027-03-20' }])
    expect(r.map(x => x.departure_date)).toEqual(['2027-03-20', '2027-03-13', '2027-03-06'])
  })
  it('horas de espera de aéreos', () => {
    expect(waitingHours({ sent_at: '2027-01-01T10:00:00Z', answered_at: '2027-01-03T22:00:00Z' })).toBe(60)
    expect(waitingHours({ sent_at: '2027-01-01T10:00:00Z', answered_at: null }, new Date('2027-01-02T10:00:00Z'))).toBe(24)
    expect(waitingHours({ sent_at: null, answered_at: null })).toBeNull()
  })
})
