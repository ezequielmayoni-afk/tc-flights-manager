import { describe, expect, it } from 'vitest'
import { matchReplyToOptions, parseReplyJson, repairJson } from '../reply-extract'
import type { CupoRequestOption } from '../requests'

const opt = (id: number, departure_date: string, airline: string, system: number): CupoRequestOption => ({ id, request_id: 1, rank: id, status: 'requested', departure_date, return_date: departure_date, nights: 7, airline, airline_code: null, flight_out: null, flight_back: null, depart_out: null, arrive_out: null, depart_back: null, arrive_back: null, stops_out: 0, stops_back: 0, direct: true, fare_family: null, checked_bag: null, seats: 10, system_price_pp: system, system_currency: 'USD', system_probed_at: null, market_price_pp: null, airline_price_pp: null, airline_currency: null, airline_notes: null, airline_quoted_at: null, delta_pct: null, decision_reason: null, decided_by: null, decided_at: null, flight_id: null, return_flight_id: null, idea_id: null, created_at: '', updated_at: '' })

describe('parseReplyJson', () => {
  it('tolera fences, números como texto y fechas inválidas', () => {
    const p = parseReplyJson('```json\n{"options":[{"departure_date":"2027-03-13","airline":"Arajet","price_pp":"USD 690","currency":"usd","seats_offered":10,"available":true}],"terms":{"deposit_pct":30,"deposit_due_date":"13/03/2027","release_date":"2027-02-13"},"confidence":"alta"}\n```')
    expect(p.options[0].price_pp).toBe(690); expect(p.options[0].currency).toBe('USD'); expect(p.terms.deposit_pct).toBe(30); expect(p.terms.deposit_due_date).toBeNull(); expect(p.terms.release_date).toBe('2027-02-13'); expect(p.confidence).toBe('alta')
  })
})

describe('repairJson', () => {
  it('escapa saltos de línea dentro de strings y saca comas finales', () => {
    const fixed = repairJson('{"a":"línea 1\nlínea 2","b":[1,2,],}')
    expect(JSON.parse(fixed)).toEqual({ a: 'línea 1\nlínea 2', b: [1, 2] })
    expect(JSON.parse(repairJson('{"q":“hola”}'))).toEqual({ q: 'hola' })
  })
})

describe('matchReplyToOptions', () => {
  const options = [opt(1, '2027-03-13', 'JetSmart', 565), opt(2, '2027-03-13', 'Arajet', 650), opt(3, '2027-03-27', 'Arajet', 643)]
  it('asocia por fecha y aerolínea, hereda términos generales y calcula el delta', () => {
    const parsed = parseReplyJson(JSON.stringify({ options: [{ departure_date: '2027-03-13', airline: 'ARAJET', price_pp: 700, currency: 'USD', seats_offered: 10, available: true, terms: { release_date: '2027-02-20' } }, { departure_date: '2027-03-27', price_pp: null, available: false }, { departure_date: '2027-04-10', airline: 'Arajet', price_pp: 600 }], terms: { deposit_pct: 30, balance_due_date: '2027-02-28' }, confidence: 'alta' }))
    const r = matchReplyToOptions(parsed, options)
    expect(r[0]).toMatchObject({ optionId: 2, matched: true, price_pp: 700, delta_pct: 7.7 })
    expect(r[0].terms).toMatchObject({ deposit_pct: 30, balance_due_date: '2027-02-28', release_date: '2027-02-20' })
    expect(r[1]).toMatchObject({ optionId: 3, matched: true, available: false, delta_pct: null })
    expect(r[2]).toMatchObject({ optionId: null, matched: false, departure_date: '2027-04-10' })
  })
})
