import { describe, expect, it, vi } from 'vitest'
import { CotizadorBudgetExhausted, type ProbeOption, type ProbeResult } from '@/lib/cotizador/client'
import { runSweep } from '../sweep'
import type { ProbeInsert } from '../queries'
import type { DatePair, LandingDestinationRow, LandingRouteRow } from '../types'

/**
 * `runSweep` es el corazón del barrido: pool de sondas, un reintento para los
 * errores que lo merecen, una fila por par pase lo que pase y freno seco
 * cuando el presupuesto del cotizador se agota. Todo se prueba con dobles
 * (`probe`, `save`, `heartbeat`): no hay red ni base.
 */

const ROUTE: LandingRouteRow = {
  id: 7,
  destination_code: 'MIA',
  origin_tc_code: 'BUE',
  origin_name: 'Buenos Aires',
  stay_nights: [7, 10, 14],
  weekdays: [2, 5],
  probes_per_month: 8,
  months_ahead: 12,
  active: true,
}

const DEST: LandingDestinationRow = {
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
}

function opcion(pricePp: number): ProbeOption {
  return {
    pricePp,
    currency: 'USD',
    airline: 'American Airlines',
    flightOut: 'AA 908',
    flightBack: 'AA 909',
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
}

const OK = (pricePp: number): ProbeResult => ({ status: 'ok', options: [opcion(pricePp)], elapsedMs: 1200, originCode: 'BUE', destCode: 'MIA' })
const VACIO: ProbeResult = { status: 'empty', options: [], elapsedMs: 900, originCode: 'BUE', destCode: 'MIA' }
const TIMEOUT: ProbeResult = { status: 'timeout', options: [], elapsedMs: 60_000, originCode: 'BUE', destCode: 'MIA' }
const ERROR_REINTENTABLE: ProbeResult = { status: 'error', options: [], elapsedMs: 300, error: 'HTTP 502', httpStatus: 502, retryable: true }
const ERROR_FINAL: ProbeResult = { status: 'error', options: [], elapsedMs: 120, error: 'HTTP 422', httpStatus: 422, retryable: false }

function pares(n: number): DatePair[] {
  return Array.from({ length: n }, (_, i) => ({
    depart: `2026-12-${String(i + 1).padStart(2, '0')}`,
    return: `2026-12-${String(i + 8).padStart(2, '0')}`,
    nights: 7,
  }))
}

/** Un `probe` falso que responde según la fecha de salida del par. */
function correr(input: {
  pairs: DatePair[]
  plan: (pair: DatePair, llamada: number) => ProbeResult | Promise<ProbeResult>
  save?: (row: ProbeInsert) => Promise<void>
  concurrency?: number
}) {
  const guardadas: ProbeInsert[] = []
  const llamadasPorPar = new Map<string, number>()
  const heartbeat = vi.fn(async () => {})
  const log = vi.fn(async () => {})
  const sleeps: number[] = []
  let enVuelo = 0
  let maxEnVuelo = 0

  const probe = vi.fn(async (i: { departDate: string; returnDate: string }) => {
    enVuelo++
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
    try {
      // Un tick de espera: sin esto los workers se serializarían solos.
      await new Promise((r) => setTimeout(r, 0))
      const pair = input.pairs.find((p) => p.depart === i.departDate && p.return === i.returnDate)!
      const n = (llamadasPorPar.get(pair.depart) ?? 0) + 1
      llamadasPorPar.set(pair.depart, n)
      return await input.plan(pair, n)
    } finally {
      enVuelo--
    }
  })

  const save = input.save ?? (async (row: ProbeInsert) => { guardadas.push(row) })

  const summary = runSweep(
    {
      probe: probe as never,
      save,
      heartbeat,
      log,
      sleep: async (ms: number) => { sleeps.push(ms) },
      now: () => new Date('2026-09-09T01:30:00.000Z'),
    },
    { route: ROUTE, destination: DEST, pairs: input.pairs, jobId: 42, concurrency: input.concurrency }
  )

  return { summary, guardadas, probe, heartbeat, log, sleeps, llamadasPorPar, enVuelo: () => maxEnVuelo }
}

describe('runSweep', () => {
  it('guarda una fila por par con el status que devolvió la sonda', async () => {
    const pairs = pares(4)
    const plan = (pair: DatePair): ProbeResult => {
      if (pair.depart.endsWith('01')) return OK(812)
      if (pair.depart.endsWith('02')) return VACIO
      if (pair.depart.endsWith('03')) return TIMEOUT
      return ERROR_FINAL
    }
    const corrida = correr({ pairs, plan })
    const summary = await corrida.summary

    expect(corrida.guardadas).toHaveLength(4)
    expect(corrida.guardadas.map((r) => r.status).sort()).toEqual(['empty', 'error', 'ok', 'timeout'])
    expect(summary.probes).toBe(4)
    expect(summary.ok).toBe(1)
    expect(summary.empty).toBe(1)
    expect(summary.timeouts).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.minPrice).toBe(812)
    expect(summary.budgetStopped).toBe(false)
    expect(corrida.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(pairs.length)
  })

  it('reintenta una sola vez y sólo los errores reintentables', async () => {
    const pairs = pares(2)
    const plan = (pair: DatePair, llamada: number): ProbeResult => {
      if (pair.depart.endsWith('01')) return llamada === 1 ? ERROR_REINTENTABLE : OK(700)
      return ERROR_FINAL
    }
    const corrida = correr({ pairs, plan })
    const summary = await corrida.summary

    expect(corrida.llamadasPorPar.get('2026-12-01')).toBe(2)
    expect(corrida.llamadasPorPar.get('2026-12-02')).toBe(1)
    expect(corrida.sleeps).toEqual([5000])
    expect(summary.ok).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.probes).toBe(2)
  })

  it('no reintenta dos veces el mismo par aunque el reintento también falle', async () => {
    const pairs = pares(1)
    const corrida = correr({ pairs, plan: () => ERROR_REINTENTABLE })
    const summary = await corrida.summary

    expect(corrida.llamadasPorPar.get('2026-12-01')).toBe(2)
    expect(summary.errors).toBe(1)
    expect(corrida.guardadas[0].status).toBe('error')
    expect(corrida.guardadas[0].error).toContain('HTTP 502')
  })

  it('nunca tiene más sondas en vuelo que la concurrencia pedida', async () => {
    const corrida = correr({ pairs: pares(8), plan: () => OK(500), concurrency: 2 })
    await corrida.summary
    expect(corrida.enVuelo()).toBe(2)
  })

  it('el presupuesto agotado corta el barrido y deja los pares restantes sin sondear', async () => {
    const pairs = pares(8)
    const plan = (pair: DatePair): ProbeResult => {
      if (pair.depart === '2026-12-03') throw new CotizadorBudgetExhausted(100)
      return OK(600)
    }
    const corrida = correr({ pairs, plan, concurrency: 1 })
    const summary = await corrida.summary

    expect(summary.budgetStopped).toBe(true)
    expect(corrida.probe.mock.calls.length).toBeLessThan(pairs.length)
    expect(corrida.guardadas).toHaveLength(2)
    expect(summary.probes).toBe(2)
  })

  it('una excepción cualquiera de la sonda cuenta como error y el barrido sigue', async () => {
    const pairs = pares(3)
    const plan = (pair: DatePair): ProbeResult => {
      if (pair.depart === '2026-12-02') throw new Error('se cayó la red')
      return OK(400)
    }
    const corrida = correr({ pairs, plan, concurrency: 1 })
    const summary = await corrida.summary

    expect(summary.probes).toBe(3)
    expect(summary.ok).toBe(2)
    expect(summary.errors).toBe(1)
    expect(corrida.guardadas).toHaveLength(2)
    expect(corrida.log).toHaveBeenCalledWith(expect.stringContaining('se cayó la red'), expect.anything(), 'warning')
  })

  it('si save lanza, el par se pierde pero el resto se guarda igual', async () => {
    const pairs = pares(3)
    const guardadas: ProbeInsert[] = []
    const corrida = correr({
      pairs,
      plan: () => OK(300),
      save: async (row) => {
        if (row.departure_date === '2026-12-02') throw new Error('la base dijo que no')
        guardadas.push(row)
      },
      concurrency: 1,
    })
    const summary = await corrida.summary

    expect(guardadas).toHaveLength(2)
    expect(summary.ok).toBe(3)
    expect(summary.errors).toBe(1)
    expect(corrida.log).toHaveBeenCalledWith(expect.stringContaining('la base dijo que no'), expect.anything(), 'warning')
  })

  it('sin pares no sondea nada', async () => {
    const corrida = correr({ pairs: [], plan: () => OK(100) })
    const summary = await corrida.summary
    expect(corrida.probe).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ probes: 0, ok: 0, minPrice: null, budgetStopped: false })
  })
})
