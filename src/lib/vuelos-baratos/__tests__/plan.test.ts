import { describe, expect, it } from 'vitest'
import type { ProbeResult } from '@/lib/cotizador/client'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { SWEEP_PRIORITY } from '../config'
import { MAX_PROBES_PER_JOB } from '../config'
import { buildSweepJobs, chunkPairs, planSweep, probeResultToInsert } from '../sweep'
import type { DatePair, EstimateRow, LandingDestinationRow, LandingRouteRow } from '../types'

/**
 * El plan del barrido: qué jobs se encolan cada noche y cómo se traduce la
 * respuesta de una sonda a la fila que se guarda. Todo determinista: mismo
 * `today` y mismo `day` ⇒ mismos jobs.
 */

const HOY = new Date(Date.UTC(2026, 8, 9)) // miércoles 9 de septiembre de 2026
const DIA = '2026-09-09'
/** El default de `enqueueJob`: con eso se encolan `idea.probe` e `idea.quote`. */
const PRIORIDAD_IDEAS = 5

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
    scan_per_month: 8,
    confirm_per_month: 3,
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

  it('los primeros 4 meses van con un punto más de prioridad, sin llegar a la de las ideas', () => {
    const jobs = buildSweepJobs({ routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 6, trigger: 'cron' })
    const porMes = new Map(jobs.map((j) => [String(j.payload!.month), j.priority]))

    expect(SWEEP_PRIORITY).toBe(3)
    expect(porMes.get('2026-09')).toBe(4)
    expect(porMes.get('2026-12')).toBe(4)
    expect(porMes.get('2027-01')).toBe(3)
    expect(porMes.get('2027-02')).toBe(3)
    // El barrido va SIEMPRE por debajo de las ideas (prioridad 5 por defecto
    // en `enqueueJob`): las cotizaciones reales ganan la noche.
    expect(jobs.every((j) => (j.priority ?? 0) < PRIORIDAD_IDEAS)).toBe(true)
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

  it('con includeInactive barre igual las rutas y los destinos apagados (barrido manual)', () => {
    const routes = [ruta({ id: 8, active: false }), ruta({ id: 9, destination_code: 'MAD' })]
    const destinations = [destino(), destino({ code: 'MAD', slug: 'madrid', name: 'Madrid', tc_code: 'MAD', active: false })]
    const opts = { routes, destinations, today: HOY, day: DIA, monthsOverride: 1, trigger: 'manual' as const }

    expect(buildSweepJobs(opts)).toHaveLength(0)
    const conInactivas = buildSweepJobs({ ...opts, includeInactive: true })
    expect(conInactivas.map((j) => j.payload!.routeId)).toEqual([8, 9])
    // Una ruta sin destino en la landing no se sondea ni así: no hay tc_code.
    expect(buildSweepJobs({ ...opts, routes: [ruta({ id: 10, destination_code: 'CUN' })], includeInactive: true })).toHaveLength(0)
  })

  it('saltea rutas inactivas, destinos inactivos y rutas sin destino publicado', () => {
    const routes = [ruta(), ruta({ id: 8, active: false }), ruta({ id: 9, destination_code: 'MAD' }), ruta({ id: 10, destination_code: 'CUN' })]
    const destinations = [destino(), destino({ code: 'MAD', slug: 'madrid', name: 'Madrid', tc_code: 'MAD', active: false })]
    const jobs = buildSweepJobs({ routes, destinations, today: HOY, day: DIA, monthsOverride: 1, trigger: 'cron' })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].payload!.routeId).toBe(7)
  })
})

describe('buildSweepJobs con estimaciones de Sabre', () => {
  function estimacion(depart: string, back: string, price: number): EstimateRow {
    return {
      id: 1,
      route_id: 7,
      depart_date: depart,
      return_date: back,
      price_pp: price,
      currency: 'USD',
      airline_code: 'AA',
      stops_out: 0,
      stops_back: 1,
      duration_out_minutes: null,
      duration_back_minutes: null,
      observed_at: '2026-09-09T00:30:00.000Z',
    }
  }

  const base = { routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 2, trigger: 'cron' as const }

  it('confirma los pares más baratos del mes estimado y deja el resto en fechas fijas', () => {
    const estimates = [
      estimacion('2026-10-06', '2026-10-13', 900),
      estimacion('2026-10-09', '2026-10-19', 610),
      estimacion('2026-10-13', '2026-10-20', 700),
      estimacion('2026-10-20', '2026-10-30', 1100),
    ]
    const jobs = buildSweepJobs({ ...base, estimatesByRoute: new Map([[7, estimates]]) })
    const porMes = new Map(jobs.map((j) => [String(j.payload!.month), j]))

    const octubre = porMes.get('2026-10')!
    expect(octubre.payload!.source).toBe('estimate')
    // confirm_per_month = 3: los tres más baratos que estimó Sabre.
    expect(octubre.payload!.pairs).toEqual([
      { depart: '2026-10-09', return: '2026-10-19', nights: 10 },
      { depart: '2026-10-13', return: '2026-10-20', nights: 7 },
      { depart: '2026-10-06', return: '2026-10-13', nights: 7 },
    ])

    // Septiembre no tiene estimaciones: sigue con los pares fijos de siempre.
    const septiembre = porMes.get('2026-09')!
    expect(septiembre.payload!.source).toBe('fixed')
    expect((septiembre.payload!.pairs as DatePair[]).length).toBe(ruta().probes_per_month)
  })

  it('si Sabre estimó menos pares que el cupo, completa con fechas fijas sin repetir', () => {
    const jobs = buildSweepJobs({ ...base, estimatesByRoute: new Map([[7, [estimacion('2026-10-09', '2026-10-19', 610)]]]) })
    const octubre = jobs.find((j) => j.payload!.month === '2026-10')!
    const pairs = octubre.payload!.pairs as DatePair[]

    expect(octubre.payload!.source).toBe('estimate')
    expect(pairs).toHaveLength(3)
    expect(pairs[0]).toEqual({ depart: '2026-10-09', return: '2026-10-19', nights: 10 })
    expect(new Set(pairs.map((p) => `${p.depart}|${p.return}`)).size).toBe(3)
  })

  it('el relleno fijo no repite un par que ya venía de la estimación', () => {
    // La estimación es, a propósito, el primer par fijo del mes: sin dedupe el
    // barrido sondearía dos veces la misma combinación de fechas.
    const fijos = planSweep(ruta(), '2026-10', { today: HOY, day: DIA })
    const repetido = fijos[0]
    const estimates = [estimacion(repetido.depart, repetido.return, 610)]

    const octubre = buildSweepJobs({ ...base, estimatesByRoute: new Map([[7, estimates]]) }).find((j) => j.payload!.month === '2026-10')!
    const pairs = octubre.payload!.pairs as DatePair[]

    expect(pairs).toHaveLength(3)
    expect(pairs[0]).toEqual(repetido)
    expect(new Set(pairs.map((p) => `${p.depart}|${p.return}`)).size).toBe(3)
    // El relleno sigue por el segundo par fijo, no vuelve a ofrecer el primero.
    expect(pairs.slice(1)).toEqual(fijos.slice(1, 3))
  })

  it('un cupo de confirmaciones más grande que la tanda se parte en varios jobs', () => {
    const estimates = Array.from({ length: 14 }, (_, i) =>
      estimacion(`2026-10-${String(i + 5).padStart(2, '0')}`, `2026-10-${String(i + 12).padStart(2, '0')}`, 500 + i)
    )
    const jobs = buildSweepJobs({
      ...base,
      routes: [ruta({ confirm_per_month: 12 })],
      estimatesByRoute: new Map([[7, estimates]]),
    }).filter((j) => j.payload!.month === '2026-10')

    expect(MAX_PROBES_PER_JOB).toBe(10)
    expect(jobs.map((j) => (j.payload!.pairs as DatePair[]).length)).toEqual([10, 2])
    expect(jobs.every((j) => j.payload!.source === 'estimate')).toBe(true)
    expect(jobs.map((j) => j.payload!.chunk)).toEqual([0, 1])
    expect(new Set(jobs.map((j) => j.dedupeKey)).size).toBe(2)
    // Los 12 pares son los 12 más baratos, en orden de precio.
    expect(jobs.flatMap((j) => (j.payload!.pairs as DatePair[]).map((p) => p.depart))).toEqual(
      estimates.slice(0, 12).map((e) => e.depart_date)
    )
  })

  it('sin estimaciones vigentes el barrido queda igual que antes', () => {
    const conMapaVacio = buildSweepJobs({ ...base, estimatesByRoute: new Map() })
    expect(conMapaVacio).toEqual(buildSweepJobs(base))
    expect(conMapaVacio.every((j) => j.payload!.source === 'fixed')).toBe(true)
  })

  it('una estimación demasiado cerca en el tiempo no se confirma', () => {
    // 2026-09-10 sale antes de hoy + MIN_LEAD_DAYS (12 de septiembre).
    const jobs = buildSweepJobs({ ...base, estimatesByRoute: new Map([[7, [estimacion('2026-09-10', '2026-09-17', 300)]]]) })
    const septiembre = jobs.find((j) => j.payload!.month === '2026-09')!
    expect(septiembre.payload!.source).toBe('fixed')
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

  it('sin dato de escalas no afirma que el vuelo sea directo', () => {
    const result: ProbeResult = { status: 'ok', options: [{ ...opcion, stopsOut: null, stopsBack: null }], elapsedMs: 1000, originCode: 'BUE', destCode: 'MIA' }
    const row = probeResultToInsert({ ...base, result })
    expect(row.stops).toBeNull()
    expect(row.direct).toBeNull()
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
