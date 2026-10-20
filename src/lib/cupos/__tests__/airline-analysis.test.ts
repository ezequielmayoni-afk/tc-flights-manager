import { describe, expect, it } from 'vitest'
import type { ProbeOption } from '@/lib/cotizador/client'
import { airlineKey, analyzeAirlines, matchesPref, type DateOptions } from '../airline-analysis'
import { buildTiradas, datesFromStored, storeAnalysis } from '../tiradas'
import { buildIntel, marketFor } from '../route-intel'
import { observationsFromToolLog, parseDuration } from '@/lib/crm/flight-quotes'

const o = (airline: string, code: string, pricePp: number, stops = 0): ProbeOption => ({ pricePp, currency: 'USD', airline, flightOut: `${code}100`, flightBack: `${code}101`, departOut: '05:00', arriveOut: '10:00', departBack: '11:00', arriveBack: '16:00', durationOut: '5h', durationBack: '5h', durationOutMin: 300, durationBackMin: 300, stopsOut: stops, stopsBack: stops, maxLayoverH: 0, fareFamily: 'BASIC', checkedBag: false, carryOn: true, personalItem: true, fares: [] })
const day = (date: string, options: ProbeOption[], directOnly = false): DateOptions => ({ date, nights: 7, group: 0, groupLabel: 'g', seats: 10, directOnly, options })

describe('una sola aerolínea para todo el pedido', () => {
  const dates = [
    day('2027-01-02', [o('JetSMART', 'JA', 500), o('Gol', 'G3', 450, 1), o('Aerolíneas', 'AR', 700)]),
    day('2027-01-09', [o('JetSMART', 'JA', 520), o('Gol', 'G3', 430, 1)]),
    day('2027-01-16', [o('JetSMART', 'JA', 480), o('Aerolíneas', 'AR', 650)]),
  ]
  it('gana la que cubre todas las fechas aunque otra sea más barata en alguna', () => {
    const d = analyzeAirlines(dates)
    expect(d.chosen).toBe('JA')
    expect(d.stats[0]).toMatchObject({ code: 'JA', covered: 3, total: 3, avgPp: 500, directShare: 1 })
    expect(d.reason).toContain('JetSMART: 3 de 3 fechas')
  })
  it('si una cubre una fecha menos y es 10 % más barata, gana ella y avisa la fecha que falta', () => {
    const cheap = [day('2027-01-02', [o('JetSMART', 'JA', 600), o('Gol', 'G3', 400)]), day('2027-01-09', [o('JetSMART', 'JA', 600), o('Gol', 'G3', 420)]), day('2027-01-16', [o('JetSMART', 'JA', 600), o('Gol', 'G3', 410)]), day('2027-01-23', [o('JetSMART', 'JA', 600)])]
    const d = analyzeAirlines(cheap)
    expect(d.chosen).toBe('G3')
    expect(d.reason).toContain('2027-01-23')
  })
  it('directo gana a escala si la diferencia es menor al 15 %', () => {
    const d = analyzeAirlines([day('2027-01-02', [o('Arajet', 'DM', 995), o('Avianca', 'AV', 871, 1)]), day('2027-01-09', [o('Arajet', 'DM', 995), o('Avianca', 'AV', 871, 1)])])
    expect(d.chosen).toBe('DM')
    expect(d.reason).toContain('una escala cuenta 15 % más cara')
    expect(analyzeAirlines([day('2027-01-02', [o('Arajet', 'DM', 995), o('Avianca', 'AV', 700, 1)])]).chosen).toBe('AV')
  })
  it('sólo directos descarta las escalas y la preferencia restringe', () => {
    expect(analyzeAirlines(dates.map(d => ({ ...d, directOnly: true }))).stats.find(s => s.code === 'G3')).toBeUndefined()
    expect(analyzeAirlines(dates, { prefs: ['Aerolíneas'] }).chosen).toBe('AR')
    expect(matchesPref('JA', 'JetSMART', ['jetsmart'])).toBe(true)
    expect(airlineKey({ flightOut: 'G31875', airline: 'Gol' })).toBe('G3')
  })
  it('las tiradas son todas de la elegida; se puede cambiar sin volver a sondear', () => {
    const { rows } = buildTiradas({ requestId: 1, legacy: false, maxOptions: 5, singleAirline: true, dates, prefs: [] })
    expect(rows.map(r => r.airline_code)).toEqual(['JA', 'JA', 'JA'])
    const stored = storeAnalysis(dates, analyzeAirlines(dates), true, null)
    const again = buildTiradas({ requestId: 1, legacy: false, maxOptions: 5, singleAirline: true, dates: datesFromStored(stored), prefs: [], forceAirline: 'AR' })
    expect(again.rows.map(r => r.departure_date)).toEqual(['2027-01-16', '2027-01-02'])
    expect(again.decision?.reason).toContain('Elegida a mano')
  })
})

describe('historial de la ruta y mercado', () => {
  it('junta sondas, bot, web y Sabre por aerolínea y arma el mercado por fecha', () => {
    const intel = buildIntel([
      { source: 'cotizador_probe', departure_date: '2027-01-02', return_date: '2027-01-09', nights: 7, price_per_pax: 500, airline: null, airline_code: null, direct: null, flight_numbers: null, options: [o('JetSMART', 'JA', 500), o('Gol', 'G3', 450, 1)], raw: null },
      { source: 'crm_quote', departure_date: '2027-01-02', return_date: '2027-01-09', nights: 7, price_per_pax: 480, airline: 'JetSmart', airline_code: 'JA', direct: true, flight_numbers: ['JA3840'], options: null, raw: { crm_log_id: 'x', chosen: true } },
      { source: 'tc_search', departure_date: '2027-01-03', return_date: '2027-01-10', nights: 7, price_per_pax: 530, airline: 'JetSMART', airline_code: null, direct: true, flight_numbers: null, options: null, raw: null },
    ], [{ depart_date: '2027-01-02', return_date: '2027-01-09', price_pp: 470, itineraries: [{ airlineCode: 'JA', totalUsd: 470, stopsOut: 0, stopsBack: 0 }] }], { nights: [7], airport: 'MCZ', keys: ['MAO', 'MCZ'] })
    const ja = intel.history.find(h => h.code === 'JA')!
    expect(ja.observations).toBe(4)
    expect(ja.sources).toEqual({ sondas: 1, bot: 1, web: 1, sabre: 1 })
    expect(marketFor(intel, '2027-01-02', 7)).toMatchObject({ pp: 480, n: 3 })
    expect(marketFor(intel, '2027-01-04', 7)).toMatchObject({ pp: 530 })
    expect(intel.demand).toMatchObject({ botQuotes: 1, webSearches: 1 })
  })
})

describe('cotizaciones del bot del CRM', () => {
  const log = { id: 'abc', tool_slug: 'cotizador', created_at: '2026-10-20T19:34:09Z',
    input: { origen: 'BUE', adultos: 3, tramos_json: '[{"destino":"Maragogi","iata_aeropuerto":"MCZ","noches":8}]' },
    output: { moneda: 'USD', viaje: { destino: 'Maragogi', fecha_ida: '2027-02-28', pasajeros: { adultos: 3, menores: [10] } },
      vuelo: { aerolinea: 'JetSmart', numero_vuelo_ida: 'JA 3826', numero_vuelo_vuelta: 'G31875', ida: { ruta_iata: 'AEP→REC', salida: '05:03', llegada: '10:05', escalas: 0 }, vuelta: { escalas: 1 }, equipaje: { carry_on: false }, aerolineas_distintas: 'JetSmart ida · Gol vuelta' },
      fechas: { elegida: '2027-02-28', alternativas: [{ pp: 511, fecha: '2027-02-28', fecha_vuelta: '2027-03-08', tarifa: 'BASIC', escalas: 0, duracion: '5h2m', valija_facturada: false }, { pp: 540, fecha: '2027-02-01', fecha_vuelta: '2027-02-09', tarifa: 'BASIC', escalas: 0, duracion: '5h30m' }] } } }
  it('una observación por fecha con precio; la elegida lleva aerolínea y vuelos; destino = aeropuerto pedido', () => {
    const obs = observationsFromToolLog(log)
    expect(obs).toHaveLength(2)
    expect(obs[0]).toMatchObject({ origin: 'BUE', destination: 'MCZ', departure_date: '2027-02-28', nights: 8, price_per_pax: 511, airline_code: 'JA', flight_numbers: ['JA3826', 'G31875'], direct: false, adults: 3, source: 'crm_quote' })
    expect(obs[0].raw).toMatchObject({ crm_log_id: 'abc', chosen: true, arrival_airport: 'REC', menores: 1 })
    expect(obs[1]).toMatchObject({ airline: null, price_per_pax: 540, duration_minutes: 330 })
    expect(parseDuration('11h45m')).toBe(705)
  })
  it('multidestino y respuestas sin alternativas no generan nada', () => {
    expect(observationsFromToolLog({ ...log, output: { ...log.output, multidestino: true } })).toEqual([])
    expect(observationsFromToolLog({ ...log, output: { ...log.output, fechas: {} } })).toEqual([])
  })
})
