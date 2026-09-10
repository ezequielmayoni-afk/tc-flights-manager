import { describe, expect, it, vi } from 'vitest'
import { SabreAuthError, SabreBudgetExhausted, type BfmInput, type BfmItinerary, type BfmResult } from '@/lib/sabre/client'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { ESTIMATE_MONTHS_PER_JOB, ORIGINS, SABRE_MAX_ITINERARIES, originIata } from '../config'
import { buildEstimateJobs, minEstimateByMonth, pickPairsToConfirm, planEstimate, runEstimate } from '../estimate'
import type { DatePair, EstimateInsert, EstimateRow, LandingDestinationRow, LandingRouteRow } from '../types'

/**
 * El estimador de Sabre: qué pares se estiman, cómo se traduce una búsqueda
 * BFM a una fila de `flight_fare_estimates` y cuáles de esas estimaciones
 * termina confirmando el barrido. Todo con dobles: acá no hay red ni base
 * (una llamada a Sabre se cobra).
 */

const HOY = new Date(Date.UTC(2026, 8, 9)) // miércoles 9 de septiembre de 2026
const DIA = '2026-09-09'

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

function itinerario(over: Partial<BfmItinerary> = {}): BfmItinerary {
  return {
    totalUsd: 812.34,
    currency: 'USD',
    airlineCode: 'AA',
    airlineCodes: ['AA'],
    stopsOut: 0,
    stopsBack: 1,
    durationOutMin: null,
    durationBackMin: null,
    flightNumbersOut: ['AA908'],
    flightNumbersBack: ['AA909'],
    departOut: '2026-12-02T22:10:00',
    arriveBack: '2026-12-10T06:30:00',
    ...over,
  }
}

function ok(totalUsd: number, over: Partial<BfmItinerary> = {}): BfmResult {
  const cheapest = itinerario({ totalUsd, ...over })
  return { status: 'ok', itineraries: [cheapest], cheapest, elapsedMs: 2100 }
}

const PARES: DatePair[] = [
  { depart: '2026-12-01', return: '2026-12-08', nights: 7 },
  { depart: '2026-12-04', return: '2026-12-11', nights: 7 },
  { depart: '2026-12-08', return: '2026-12-18', nights: 10 },
]

function deps(shop: (input: BfmInput) => Promise<BfmResult>, over: { save?: (rows: EstimateInsert[]) => Promise<void> } = {}) {
  const guardadas: EstimateInsert[] = []
  const heartbeat = vi.fn(async () => {})
  const log = vi.fn(async () => {})
  const save =
    over.save ??
    (async (rows: EstimateInsert[]) => {
      guardadas.push(...rows)
    })
  return {
    guardadas,
    heartbeat,
    log,
    deps: { shop: vi.fn(shop), save: vi.fn(save), heartbeat, log, now: () => new Date('2026-09-10T00:20:00.000Z') },
  }
}

const entrada = { route: ruta(), destination: destino(), pairs: PARES, jobId: 99 }

describe('originIata', () => {
  it('traduce los 4 orígenes del barrido al IATA de ciudad que usa Sabre', () => {
    expect(originIata('BUE')).toBe('BUE')
    expect(originIata('CRD')).toBe('COR')
    expect(originIata('RO6')).toBe('ROS')
    expect(originIata('MEZ')).toBe('MDZ')
    expect(ORIGINS.every((o) => /^[A-Z]{3}$/.test(o.iata))).toBe(true)
  })

  it('un código que no es de los nuestros no se inventa', () => {
    expect(originIata('XXX')).toBeNull()
    expect(originIata(null)).toBeNull()
  })
})

describe('planEstimate', () => {
  it('usa scan_per_month como tope de pares del mes', () => {
    const pares = planEstimate(ruta({ scan_per_month: 4 }), '2026-12', { today: HOY, day: DIA })
    expect(pares).toHaveLength(4)
    expect(pares.every((p) => p.depart.startsWith('2026-12'))).toBe(true)
    // Las estadías y los días de salida son los de la ruta.
    expect(pares.every((p) => ruta().stay_nights.includes(p.nights))).toBe(true)
  })

  it('con scan_per_month 0 la ruta no se estima', () => {
    expect(planEstimate(ruta({ scan_per_month: 0 }), '2026-12', { today: HOY, day: DIA })).toEqual([])
  })
})

describe('buildEstimateJobs', () => {
  it('agrupa los meses de a dos, con la clave de dedupe exacta', () => {
    const jobs = buildEstimateJobs({ routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 4, trigger: 'cron' })

    expect(ESTIMATE_MONTHS_PER_JOB).toBe(2)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].kind).toBe('flights.estimate')
    expect(jobs[0].dedupeKey).toBe('flights.estimate:BUE:miami:2026-09+2026-10:2026-09-09')
    expect(jobs[1].dedupeKey).toBe('flights.estimate:BUE:miami:2026-11+2026-12:2026-09-09')
    expect(jobs[0].entityType).toBe('flight_route')
    expect(jobs[0].entityId).toBe(7)
    expect(jobs[0].maxAttempts).toBe(2)
    expect(jobs[0].createdBy).toBe('flights.estimate.plan')
    expect(jobs[0].payload).toMatchObject({ routeId: 7, destinationCode: 'MIA', originCode: 'BUE', slug: 'miami', months: ['2026-09', '2026-10'], trigger: 'cron' })
    // Las estimaciones tienen que terminar antes de que arranque el barrido.
    expect(jobs.every((j) => (j.priority ?? 0) >= 5)).toBe(true)
    expect((jobs[0].payload!.pairs as DatePair[]).length).toBeGreaterThan(0)
  })

  it('un mes suelto al final va en su propio job', () => {
    const jobs = buildEstimateJobs({ routes: [ruta()], destinations: [destino()], today: HOY, day: DIA, monthsOverride: 3, trigger: 'cron' })
    expect(jobs.map((j) => j.payload!.months)).toEqual([['2026-09', '2026-10'], ['2026-11']])
  })

  it('saltea rutas con scan_per_month 0, inactivas o sin destino publicado', () => {
    const routes = [ruta({ id: 8, scan_per_month: 0 }), ruta({ id: 9, active: false }), ruta({ id: 10, destination_code: 'CUN' })]
    expect(buildEstimateJobs({ routes, destinations: [destino()], today: HOY, day: DIA, monthsOverride: 2, trigger: 'cron' })).toHaveLength(0)

    // A mano se estima una ruta apagada (así se prueba antes de publicarla),
    // pero una con el estimador en 0 sigue sin generar llamadas a Sabre.
    const manuales = buildEstimateJobs({
      routes,
      destinations: [destino()],
      today: HOY,
      day: DIA,
      monthsOverride: 2,
      priority: MANUAL_PRIORITY,
      trigger: 'manual',
      includeInactive: true,
    })
    expect(manuales.map((j) => j.payload!.routeId)).toEqual([9])
    expect(manuales[0].createdBy).toBe('ui')
  })
})

describe('runEstimate', () => {
  it('guarda una fila por par con precio y cuenta vacíos y errores', async () => {
    const respuestas: BfmResult[] = [
      ok(812.34),
      { status: 'empty', itineraries: [], elapsedMs: 900 },
      { status: 'error', itineraries: [], elapsedMs: 800, error: 'Sabre HTTP 503', retryable: true, sessionLost: false },
    ]
    const { deps: d, guardadas, heartbeat, log } = deps(async () => respuestas.shift()!)

    const summary = await runEstimate(d, entrada)

    expect(summary).toMatchObject({ pairs: 3, ok: 1, empty: 1, errors: 1, minPrice: 812.34, budgetStopped: false, fatalError: null })
    // Las llamadas a Sabre las cuenta el shopper (el handler), no el resumen.
    expect('sabreCalls' in summary).toBe(false)
    expect(heartbeat).toHaveBeenCalledTimes(3)
    // El error de una fecha se avisa, pero no corta la tanda.
    expect(log).toHaveBeenCalledTimes(1)

    expect(d.save).toHaveBeenCalledTimes(1)
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0]).toMatchObject({
      route_id: 7,
      depart_date: '2026-12-01',
      return_date: '2026-12-08',
      price_pp: 812.34,
      currency: 'USD',
      airline_code: 'AA',
      stops_out: 0,
      stops_back: 1,
      duration_out_minutes: null,
      duration_back_minutes: null,
      source: 'sabre_bfm',
      job_id: 99,
      elapsed_ms: 2100,
      observed_at: '2026-09-10T00:20:00.000Z',
    })
    expect(guardadas[0].itineraries).toHaveLength(1)
  })

  it('le pide a Sabre el IATA del origen y del destino, con el tope de itinerarios', async () => {
    const { deps: d } = deps(async () => ok(700))
    await runEstimate(d, { ...entrada, route: ruta({ origin_tc_code: 'RO6' }), destination: destino({ tc_code: 'MIA', iata_display: null }) })

    expect(d.shop).toHaveBeenCalledWith({
      originIata: 'ROS',
      destIata: 'MIA',
      departDate: '2026-12-01',
      returnDate: '2026-12-08',
      adults: 1,
      maxItineraries: SABRE_MAX_ITINERARIES,
    })
  })

  it('el presupuesto agotado corta la tanda y guarda lo que ya se había estimado', async () => {
    const { deps: d, guardadas } = deps(async (input) => {
      if (input.departDate === '2026-12-01') return ok(650)
      throw new SabreBudgetExhausted(100)
    })

    const summary = await runEstimate(d, entrada)

    expect(summary.budgetStopped).toBe(true)
    expect(summary.pairs).toBe(1)
    expect(summary.ok).toBe(1)
    expect(guardadas).toHaveLength(1)
    // No se siguen pidiendo pares después del corte.
    expect(d.shop).toHaveBeenCalledTimes(2)
  })

  it('un error de credenciales corta el job entero', async () => {
    // El mensaje sale de la clase real: si `SabreAuthError` cambia de forma,
    // este test avisa antes de que el estimador se pase la noche abriendo
    // sesiones que Sabre va a rechazar una por una.
    const mensaje = new SabreAuthError('USG_AUTHENTICATION_FAILED - Authentication failed').message
    const { deps: d, log } = deps(async () => ({
      status: 'error',
      itineraries: [],
      elapsedMs: 120,
      error: mensaje,
      retryable: false,
      sessionLost: false,
    }))

    const summary = await runEstimate(d, entrada)

    expect(summary.fatalError).toBe(mensaje)
    expect(summary.errors).toBe(1)
    expect(d.shop).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalled()
  })

  it('un fault del BFM que no se reintenta NO corta el job (es cosa de esa fecha)', async () => {
    // Mismo `retryable: false`, pero es un código de aeropuerto que Sabre no
    // acepta: las otras fechas de la tanda se estiman igual.
    const { deps: d } = deps(async (input) =>
      input.departDate === '2026-12-01'
        ? { status: 'error', itineraries: [], elapsedMs: 90, error: 'ERR.SWS.HOST: INVALID CITY CODE', retryable: false, sessionLost: false }
        : ok(700)
    )

    const summary = await runEstimate(d, entrada)

    expect(summary.fatalError).toBeNull()
    expect(summary.errors).toBe(1)
    expect(summary.ok).toBe(2)
    expect(d.shop).toHaveBeenCalledTimes(3)
  })

  it('un origen sin IATA no le pide nada a Sabre', async () => {
    const { deps: d } = deps(async () => ok(700))
    const summary = await runEstimate(d, { ...entrada, route: ruta({ origin_tc_code: 'XXX' }) })

    expect(summary.fatalError).toContain('XXX')
    expect(summary.pairs).toBe(0)
    expect(d.shop).not.toHaveBeenCalled()
    expect(d.save).not.toHaveBeenCalled()
  })

  it('si no se pueden guardar las filas se cuenta el error y no revienta', async () => {
    const { deps: d, log } = deps(async () => ok(500), { save: async () => { throw new Error('PostgREST 500') } })

    const summary = await runEstimate(d, entrada)

    expect(summary.ok).toBe(3)
    expect(summary.errors).toBe(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('PostgREST 500'), expect.anything(), 'warning')
  })

  it('sin pares no le pide nada a Sabre ni escribe', async () => {
    const { deps: d } = deps(async () => ok(500))
    const summary = await runEstimate(d, { ...entrada, pairs: [] })

    expect(summary).toMatchObject({ pairs: 0, ok: 0, errors: 0 })
    expect(d.shop).not.toHaveBeenCalled()
    expect(d.save).not.toHaveBeenCalled()
  })
})

describe('pickPairsToConfirm', () => {
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

  const estimates = [
    estimacion('2026-12-01', '2026-12-08', 900),
    estimacion('2026-12-04', '2026-12-14', 640),
    estimacion('2026-12-11', '2026-12-18', 710),
    estimacion('2026-12-18', '2026-12-25', 1200),
    estimacion('2027-01-05', '2027-01-12', 300),
  ]

  it('elige los más baratos del mes, sin repetir el par', () => {
    const picks = pickPairsToConfirm({ estimates: [...estimates, estimacion('2026-12-04', '2026-12-14', 655)], month: '2026-12', confirmPerMonth: 3, today: HOY, minLeadDays: 3 })

    expect(picks).toEqual([
      { depart: '2026-12-04', return: '2026-12-14', nights: 10 },
      { depart: '2026-12-11', return: '2026-12-18', nights: 7 },
      { depart: '2026-12-01', return: '2026-12-08', nights: 7 },
    ])
  })

  it('a igual precio y misma ida, desempata por la vuelta (siempre igual)', () => {
    const mismoPrecio = [estimacion('2026-12-04', '2026-12-18', 640), estimacion('2026-12-04', '2026-12-11', 640)]
    const picks = pickPairsToConfirm({ estimates: mismoPrecio, month: '2026-12', confirmPerMonth: 2, today: HOY, minLeadDays: 3 })

    expect(picks.map((p) => p.return)).toEqual(['2026-12-11', '2026-12-18'])
    // Y no depende del orden en que vengan de la base.
    expect(pickPairsToConfirm({ estimates: [...mismoPrecio].reverse(), month: '2026-12', confirmPerMonth: 2, today: HOY, minLeadDays: 3 })).toEqual(picks)
  })

  it('respeta la anticipación mínima y no mira otros meses', () => {
    const cerca = [estimacion('2026-09-10', '2026-09-17', 200), estimacion('2026-09-20', '2026-09-27', 800)]
    const picks = pickPairsToConfirm({ estimates: cerca, month: '2026-09', confirmPerMonth: 3, today: HOY, minLeadDays: 3 })

    // El 10 de septiembre sale antes del 12 (hoy + 3): no se confirma.
    expect(picks).toEqual([{ depart: '2026-09-20', return: '2026-09-27', nights: 7 }])
    expect(pickPairsToConfirm({ estimates, month: '2026-11', confirmPerMonth: 3, today: HOY, minLeadDays: 3 })).toEqual([])
  })
})

describe('minEstimateByMonth', () => {
  it('deja el mínimo estimado de cada mes', () => {
    const rows: EstimateRow[] = [
      { id: 1, route_id: 7, depart_date: '2026-12-04', return_date: '2026-12-11', price_pp: 900, currency: 'USD', airline_code: null, stops_out: null, stops_back: null, duration_out_minutes: null, duration_back_minutes: null, observed_at: '2026-09-09T00:30:00.000Z' },
      { id: 2, route_id: 7, depart_date: '2026-12-18', return_date: '2026-12-25', price_pp: 640, currency: 'USD', airline_code: null, stops_out: null, stops_back: null, duration_out_minutes: null, duration_back_minutes: null, observed_at: '2026-09-09T00:30:00.000Z' },
      { id: 3, route_id: 7, depart_date: '2027-01-05', return_date: '2027-01-12', price_pp: 300, currency: 'USD', airline_code: null, stops_out: null, stops_back: null, duration_out_minutes: null, duration_back_minutes: null, observed_at: '2026-09-09T00:30:00.000Z' },
    ]
    const porMes = minEstimateByMonth(rows)
    expect(porMes.get('2026-12')).toBe(640)
    expect(porMes.get('2027-01')).toBe(300)
    expect(porMes.get('2026-11')).toBeUndefined()
  })
})
