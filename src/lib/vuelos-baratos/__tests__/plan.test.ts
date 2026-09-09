import { describe, expect, it } from 'vitest'
import type { ProbeResult } from '@/lib/cotizador/client'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { SWEEP_PRIORITY } from '../config'
import { buildSweepJobs, chunkPairs, probeResultToInsert } from '../sweep'
import type { DatePair, LandingDestinationRow, LandingRouteRow } from '../types'

/**
 * El plan del barrido: qué jobs se encolan cada noche y cómo se traduce la
 * respuesta de una sonda a la fila que se guarda. Todo determinista: mismo
 * `today` y mismo `day` ⇒ mismos jobs.
 */

const HOY = new Date(Date.UTC(2026, 8, 9)) // miércoles 9 de septiembre de 2026
const DIA = '2026-09-09'

function destino(over: Partial<LandingDestinationRow> = {}): LandingDestinationRow {
  return {
    code: 'MIA',
    slug: 'miami',
    name: 'Miami',
    tc_code: 'MIA',
    iata_display: 'MIA',
    haul: 'long',
    seo_title: null,
    seo_description: null,
    hero_image_url: null,
    faq: [],
    active: true,
    sort_order: 10,
    ...over,
  }
}

function ruta(over: Partial<LandingRouteRow> = {}): LandingRouteRow {
  return {
    id: 7,
    destination_code: 'MIA',
    origin_tc_code: 'BUE',
    origin_name: 'Buenos Aires',
    stay_nights: [7, 10, 14],
    weekdays: [2, 5],
    probes_per_month: 8,
    months_ahead: 12,
    active: true,
    ...over,
  }
}

describe('chunkPairs', () => {
  it('parte en tandas del tamaño pedido y deja el resto en la última', () => {
    const pairs: DatePair[] = Array.from({ length: 11 }, (_, i) => ({ depart: `2026-12-${String(i + 1).padStart(2, '0')}`, return: '2026-12-20', nights: 7 }))
    const chunks = chunkPairs(pairs)
    expect(chunks.map((c) => c.length)).toEqual([10, 1])
    expect(chunks.flat()).toEqual(pairs)
    expect(chunkPairs(pairs, 4).map((c) => c.length)).toEqual([4, 4, 3])
    expect(chunkPairs([])).toEqual([])
  })
})

describe('buildSweepJobs', () => {
  it('genera un job por ruta × mes × tanda, con la clave de dedupe exacta', () => {
    const jobs = buildSweepJobs({ routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 2, trigger: 'cron' })

    // 8 sondas por mes entran en una sola tanda de 10.
    expect(jobs).toHaveLength(2)
    expect(jobs[0].kind).toBe('flights.sweep')
    expect(jobs[0].dedupeKey).toBe('flights.sweep:BUE:miami:2026-09:0:2026-09-09')
    expect(jobs[1].dedupeKey).toBe('flights.sweep:BUE:miami:2026-10:0:2026-09-09')
    expect(jobs[0].entityType).toBe('flight_route')
    expect(jobs[0].entityId).toBe(7)
    expect(jobs[0].maxAttempts).toBe(2)
    expect(jobs[0].createdBy).toBe('flights.sweep.plan')
    expect(jobs[0].payload).toMatchObject({ routeId: 7, destinationCode: 'MIA', originCode: 'BUE', slug: 'miami', month: '2026-09', chunk: 0, trigger: 'cron' })
    expect((jobs[0].payload!.pairs as DatePair[]).length).toBeGreaterThan(0)
  })

  it('los primeros 4 meses van con un punto más de prioridad', () => {
    const jobs = buildSweepJobs({ routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 6, trigger: 'cron' })
    const porMes = new Map(jobs.map((j) => [String(j.payload!.month), j.priority]))

    expect(porMes.get('2026-09')).toBe(SWEEP_PRIORITY + 1)
    expect(porMes.get('2026-12')).toBe(SWEEP_PRIORITY + 1)
    expect(porMes.get('2027-01')).toBe(SWEEP_PRIORITY)
    expect(porMes.get('2027-02')).toBe(SWEEP_PRIORITY)
  })

  it('respeta monthsOverride, la prioridad manual y el createdBy de la UI', () => {
    const jobs = buildSweepJobs({ routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 3, priority: MANUAL_PRIORITY, trigger: 'manual' })
    expect(new Set(jobs.map((j) => String(j.payload!.month)))).toEqual(new Set(['2026-09', '2026-10', '2026-11']))
    expect(jobs.every((j) => (j.priority ?? 0) >= MANUAL_PRIORITY)).toBe(true)
    expect(jobs.every((j) => j.createdBy === 'ui')).toBe(true)
  })

  it('sin monthsOverride usa months_ahead de la ruta', () => {
    const jobs = buildSweepJobs({ routes: [ruta({ months_ahead: 4 })], destinations: [destino()], today: HOY, day: DIA, trigger: 'cron' })
    expect(new Set(jobs.map((j) => String(j.payload!.month))).size).toBe(4)
  })

  it('parte en varias tandas cuando el mes pide más sondas que el máximo por job', () => {
    const jobs = buildSweepJobs({ routes: [ruta({ probes_per_month: 25, weekdays: [] })], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 1, trigger: 'cron' })
    expect(jobs).toHaveLength(3)
    expect(jobs.map((j) => j.payload!.chunk)).toEqual([0, 1, 2])
    expect(jobs.map((j) => (j.payload!.pairs as DatePair[]).length)).toEqual([10, 10, 5])
    expect(new Set(jobs.map((j) => j.dedupeKey)).size).toBe(3)
  })

  it('saltea rutas inactivas, destinos inactivos y rutas sin destino publicado', () => {
    const routes = [ruta(), ruta({ id: 8, active: false }), ruta({ id: 9, destination_code: 'MAD' }), ruta({ id: 10, destination_code: 'CUN' })]
    const destinations = [destino(), destino({ code: 'MAD', slug: 'madrid', name: 'Madrid', tc_code: 'MAD', active: false })]
    const jobs = buildSweepJobs({ routes, destinations, today: HOY, day: DIA, monthsOverride: 1, trigger: 'cron' })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].payload!.routeId).toBe(7)
  })
})

describe('probeResultToInsert', () => {
  const pair: DatePair = { depart: '2026-12-02', return: '2026-12-09', nights: 7 }
  const AHORA = new Date('2026-09-09T01:30:00.000Z')

  const base = { route: ruta(), destination: destino(), pair, jobId: 42, now: AHORA, attempt: 1 }

  const opcion = {
    pricePp: 812.34,
    currency: 'USD',
    airline: 'Aerolíneas Argentinas',
    flightOut: 'AR 1304',
    flightBack: 'AR 1305',
    departOut: '2026-12-02 22:10',
    arriveOut: '2026-12-03 07:25',
    departBack: '2026-12-09 20:00',
    arriveBack: '2026-12-10 06:30',
    durationOut: '9h 15m',
    durationBack: '10h 30m',
    durationOutMin: 555,
    durationBackMin: 630,
    stopsOut: 0,
    stopsBack: 1,
    maxLayoverH: 2.5,
    fareFamily: 'BASIC',
    checkedBag: false,
    carryOn: true,
    personalItem: true,
    fares: [],
  }

  it('mapea una sonda con precio', () => {
    const result: ProbeResult = { status: 'ok', options: [opcion, { ...opcion, pricePp: 900 }], elapsedMs: 1200, originCode: 'BUE', destCode: 'MIA' }
    const row = probeResultToInsert({ ...base, result })

    expect(row).toMatchObject({
      route_id: 7,
      origin: 'BUE',
      destination: 'MIA',
      destination_code: 'MIA',
      departure_date: '2026-12-02',
      return_date: '2026-12-09',
      nights: 7,
      adults: 1,
      status: 'ok',
      source: 'cotizador_probe',
      job_id: 42,
      price_per_pax: 812.34,
      currency: 'USD',
      airline: 'Aerolíneas Argentinas',
      airline_code: 'AR',
      stops: 0,
      stops_back: 1,
      direct: true,
      duration_minutes: 555,
      duration_back_minutes: 630,
      fare_family: 'BASIC',
      checked_bag: false,
      carry_on: true,
      elapsed_ms: 1200,
      error: null,
    })
    expect(row.options).toHaveLength(2)
    expect(row.probed_at).toBe('2026-09-09T01:30:00.000Z')
    // La observación vale 48 h.
    expect(row.expires_at).toBe('2026-09-11T01:30:00.000Z')
  })

  it('guarda como mucho 5 opciones y no marca directo si hay escalas', () => {
    const options = Array.from({ length: 8 }, (_, i) => ({ ...opcion, pricePp: 800 + i, stopsOut: 1 }))
    const result: ProbeResult = { status: 'ok', options, elapsedMs: 1000, originCode: 'BUE', destCode: 'MIA' }
    const row = probeResultToInsert({ ...base, result })

    expect(row.options).toHaveLength(5)
    expect(row.direct).toBe(false)
    expect(row.stops).toBe(1)
  })

  it('sin número de vuelo no inventa el código de aerolínea', () => {
    const result: ProbeResult = { status: 'ok', options: [{ ...opcion, flightOut: '' }], elapsedMs: 1000, originCode: 'BUE', destCode: 'MIA' }
    expect(probeResultToInsert({ ...base, result }).airline_code).toBeNull()
  })

  it('una sonda ok pero sin opciones se guarda como vacía', () => {
    const result: ProbeResult = { status: 'ok', options: [], elapsedMs: 800, originCode: 'BUE', destCode: 'MIA' }
    const row = probeResultToInsert({ ...base, result })
    expect(row.status).toBe('empty')
    expect(row.price_per_pax).toBeNull()
  })

  it('mapea un timeout sin precio pero con el par de fechas', () => {
    const result: ProbeResult = { status: 'timeout', options: [], elapsedMs: 60_000, originCode: 'BUE', destCode: 'MIA' }
    const row = probeResultToInsert({ ...base, result })

    expect(row).toMatchObject({
      status: 'timeout',
      price_per_pax: null,
      airline: null,
      airline_code: null,
      stops: null,
      stops_back: null,
      direct: null,
      duration_minutes: null,
      fare_family: null,
      checked_bag: null,
      carry_on: null,
      error: null,
      elapsed_ms: 60_000,
      departure_date: '2026-12-02',
      return_date: '2026-12-09',
      nights: 7,
      currency: 'USD',
    })
    expect(row.options).toEqual([])
  })

  it('un error guarda el mensaje y anota el reintento', () => {
    const result: ProbeResult = { status: 'error', options: [], elapsedMs: 300, error: 'HTTP 502', httpStatus: 502, retryable: true }
    expect(probeResultToInsert({ ...base, result }).error).toBe('HTTP 502')
    expect(probeResultToInsert({ ...base, result, attempt: 2 }).error).toBe('HTTP 502 (intento 2)')
  })
})
