import { beforeEach, describe, expect, it, vi } from 'vitest'

// El presupuesto y el registro de llamadas van a la base: se mockean para que
// el test corra sin Supabase.
const mocks = vi.hoisted(() => ({ getBudgetStatus: vi.fn(), recordExternalCall: vi.fn() }))
vi.mock('@/lib/jobs/budget', () => ({
  getBudgetStatus: mocks.getBudgetStatus,
  recordExternalCall: mocks.recordExternalCall,
}))

import { COTIZADOR_PROBE_PROVIDER, CotizadorBudgetExhausted, mapProbeOption, parseDurationMin, probeFlights } from '@/lib/cotizador/client'
import type { Db } from '@/lib/jobs/types'

const db = {} as unknown as Db
const INPUT = { originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-02', returnDate: '2026-12-06' }

const OPCION = {
  precio_pp: 812.34,
  moneda: 'USD',
  aerolinea: 'American Airlines',
  numero_vuelo_ida: 'AA908',
  numero_vuelo_vta: 'AA909',
  salida_ida: '2026-12-02 22:10',
  llegada_ida: '2026-12-03 07:25',
  salida_vta: '2026-12-06 20:00',
  llegada_vta: '2026-12-07 06:30',
  duracion_ida: '9h 15m',
  duracion_vta: '10h 30m',
  escalas_ida: -1,
  escalas_vta: 0,
  espera_max_h: 2.5,
  tarifa_familia: 'BASIC',
  valija_facturada: false,
  carry_on: true,
  bolso_de_mano: true,
  tarifas: [{ codigo: 'BAS', nombre: 'Basic', cabina: 'Economy', precio: 812.34, moneda: 'USD', valija_facturada: false, carry_on: true, reembolsable: false }],
}

function respuesta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => impl())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.COTIZADOR_API_KEY = 'x'
  delete process.env.COTIZADOR_URL
  mocks.getBudgetStatus.mockResolvedValue({ exhausted: false, pct: 12 })
  mocks.recordExternalCall.mockResolvedValue(undefined)
})

describe('parseDurationMin', () => {
  it('lee horas y minutos', () => {
    expect(parseDurationMin('9h 15m')).toBe(555)
    expect(parseDurationMin('9h')).toBe(540)
    expect(parseDurationMin('45m')).toBe(45)
    expect(parseDurationMin('')).toBeNull()
    expect(parseDurationMin(null)).toBeNull()
    expect(parseDurationMin(undefined)).toBeNull()
    expect(parseDurationMin('sin datos')).toBeNull()
  })
})

describe('mapProbeOption', () => {
  it('traduce las claves del bot y normaliza escalas -1', () => {
    const opt = mapProbeOption(OPCION)
    expect(opt.pricePp).toBe(812.34)
    expect(opt.airline).toBe('American Airlines')
    expect(opt.flightOut).toBe('AA908')
    expect(opt.stopsOut).toBeNull()
    expect(opt.stopsBack).toBe(0)
    expect(opt.durationOutMin).toBe(555)
    expect(opt.durationBackMin).toBe(630)
    expect(opt.maxLayoverH).toBe(2.5)
    expect(opt.personalItem).toBe(true)
    expect(opt.fares).toEqual([{ code: 'BAS', name: 'Basic', cabin: 'Economy', price: 812.34, currency: 'USD', checkedBag: false, carryOn: true, refundable: false }])
  })

  it('usa defaults seguros con una opción vacía', () => {
    expect(mapProbeOption({})).toEqual({
      pricePp: 0,
      currency: 'USD',
      airline: '',
      flightOut: '',
      flightBack: '',
      departOut: '',
      arriveOut: '',
      departBack: '',
      arriveBack: '',
      durationOut: '',
      durationBack: '',
      durationOutMin: null,
      durationBackMin: null,
      stopsOut: null,
      stopsBack: null,
      maxLayoverH: 0,
      fareFamily: '',
      checkedBag: false,
      carryOn: false,
      personalItem: false,
      fares: [],
    })
  })
})

describe('probeFlights', () => {
  it('mapea una respuesta ok y registra la llamada', async () => {
    const fetchMock = stubFetch(async () => respuesta({ status: 'ok', origen_code: 'BUE', destino_code: 'MIA', fecha_ida: '2026-12-02', fecha_vta: '2026-12-06', adultos: 1, elapsed_s: 12.5, opciones: [OPCION] }))
    const res = await probeFlights(db, INPUT, { jobId: 7 })

    expect(res.status).toBe('ok')
    expect(res.options).toHaveLength(1)
    expect(res.options[0].pricePp).toBe(812.34)
    expect(res.options[0].stopsOut).toBeNull()
    expect(res.options[0].durationOutMin).toBe(555)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8090/flights/probe')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('x')
    expect(JSON.parse(String(init.body))).toEqual({
      origen: 'Destination::BUE',
      destino: 'Destination::MIA',
      fecha_ida: '2026-12-02',
      fecha_vta: '2026-12-06',
      adultos: 1,
      menores: [],
      top_n: 5,
      only_direct: false,
    })

    expect(mocks.recordExternalCall).toHaveBeenCalledTimes(1)
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ provider: COTIZADOR_PROBE_PROVIDER, endpoint: 'vuelos-baratos:probe', units: 1, status: 'ok', jobId: 7 })
  })

  it('sin_resultados es empty y se registra como ok', async () => {
    stubFetch(async () => respuesta({ status: 'sin_resultados', origen_code: 'BUE', destino_code: 'MIA', opciones: [] }))
    const res = await probeFlights(db, INPUT)
    expect(res.status).toBe('empty')
    expect(res.options).toEqual([])
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'ok' })
  })

  it('timeout del bot es timeout', async () => {
    stubFetch(async () => respuesta({ status: 'timeout', origen_code: 'BUE', destino_code: 'MIA', opciones: [] }))
    const res = await probeFlights(db, INPUT)
    expect(res.status).toBe('timeout')
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'timeout' })
  })

  it('un 422 es un error que no se reintenta', async () => {
    stubFetch(async () => respuesta({ detail: 'origen inválido' }, 422))
    const res = await probeFlights(db, INPUT)
    expect(res).toMatchObject({ status: 'error', retryable: false, httpStatus: 422 })
    expect(res.status === 'error' && res.error).toContain('origen inválido')
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'error' })
  })

  it('un 401 tampoco se reintenta', async () => {
    stubFetch(async () => respuesta({ detail: 'API key inválida' }, 401))
    expect(await probeFlights(db, INPUT)).toMatchObject({ status: 'error', retryable: false, httpStatus: 401 })
  })

  it('un 502 se reintenta', async () => {
    stubFetch(async () => respuesta({ detail: 'bad gateway' }, 502))
    expect(await probeFlights(db, INPUT)).toMatchObject({ status: 'error', retryable: true, httpStatus: 502 })
  })

  it('el timeout del fetch no lanza', async () => {
    stubFetch(async () => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'TimeoutError'
      throw err
    })
    const res = await probeFlights(db, INPUT)
    expect(res.status).toBe('timeout')
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'timeout' })
  })

  it('un error de red devuelve error reintentable', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed')
    })
    const res = await probeFlights(db, INPUT)
    expect(res).toMatchObject({ status: 'error', retryable: true, httpStatus: null })
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'error' })
  })

  it('con el presupuesto agotado lanza y no llama al bot', async () => {
    const fetchMock = stubFetch(async () => respuesta({ status: 'ok', opciones: [] }))
    mocks.getBudgetStatus.mockResolvedValue({ exhausted: true, pct: 104 })
    await expect(probeFlights(db, INPUT)).rejects.toBeInstanceOf(CotizadorBudgetExhausted)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.recordExternalCall).not.toHaveBeenCalled()
  })

  it('con enforceBudget false ni consulta el presupuesto', async () => {
    stubFetch(async () => respuesta({ status: 'ok', origen_code: 'BUE', destino_code: 'MIA', opciones: [] }))
    mocks.getBudgetStatus.mockResolvedValue({ exhausted: true, pct: 104 })
    const res = await probeFlights(db, INPUT, { enforceBudget: false })
    expect(res.status).toBe('ok')
    expect(mocks.getBudgetStatus).not.toHaveBeenCalled()
  })

  it('manda adultos, menores, top_n y only_direct cuando se piden', async () => {
    const fetchMock = stubFetch(async () => respuesta({ status: 'ok', origen_code: 'BUE', destino_code: 'MIA', opciones: [] }))
    await probeFlights(db, { ...INPUT, adults: 2, childrenAges: [5, 9], topN: 3, onlyDirect: true })
    const init = fetchMock.mock.calls[0][1]
    expect(JSON.parse(String(init.body))).toMatchObject({ adultos: 2, menores: [5, 9], top_n: 3, only_direct: true })
  })
})
