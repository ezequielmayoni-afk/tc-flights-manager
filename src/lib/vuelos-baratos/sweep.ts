import { CotizadorBudgetExhausted, type ProbeInput, type ProbeResult } from '@/lib/cotizador/client'
import type { EnqueueInput, JobContext } from '@/lib/jobs/types'
import { invalidatePublicCache } from './cache'
import { DEFAULT_ADULTS, MAX_PROBES_PER_JOB, MIN_LEAD_DAYS, OBSERVATION_WINDOW_HOURS, PROBE_CONCURRENCY, PROBE_RETRY_DELAY_MS, SWEEP_PRIORITY } from './config'
import { generateDatePairs, monthsAhead } from './date-pairs'
import { pickPairsToConfirm } from './estimate'
import type { ProbeInsert } from './queries'
import type { DatePair, EstimateRow, LandingDestinationRow, LandingRouteRow, SweepSummary } from './types'

/**
 * El barrido nocturno de vuelos.siviajo.com.
 *
 * `flights.sweep.plan` arma la lista de jobs con `buildSweepJobs` (uno por
 * ruta × mes × tanda) y cada `flights.sweep` corre `runSweep` sobre sus pares.
 * Acá no se toca la base ni la red: las dependencias entran por `SweepDeps`,
 * así que el pool, los reintentos y el freno por presupuesto se prueban con
 * dobles.
 */

export interface SweepDeps {
  probe: (input: ProbeInput) => Promise<ProbeResult>
  save: (row: ProbeInsert) => Promise<void>
  heartbeat: () => Promise<void>
  log: JobContext['log']
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
}

export interface SweepInput {
  route: LandingRouteRow
  destination: LandingDestinationRow
  pairs: DatePair[]
  jobId: number
  concurrency?: number
}

/** Los pares de un mes para una ruta. `day` rota los exploradores cada noche. */
export function planSweep(route: LandingRouteRow, month: string, opts: { today: Date; day: string }): DatePair[] {
  return generateDatePairs({
    month,
    today: opts.today,
    weekdays: route.weekdays,
    stays: route.stay_nights,
    perMonth: route.probes_per_month,
    minLeadDays: MIN_LEAD_DAYS,
    rotationSeed: opts.day,
  })
}

/** Un job hace hasta `MAX_PROBES_PER_JOB` sondas: el tick del cron corta a los ~8 min. */
export function chunkPairs(pairs: DatePair[], size = MAX_PROBES_PER_JOB): DatePair[][] {
  const tamaño = Math.max(1, size)
  const tandas: DatePair[][] = []
  for (let i = 0; i < pairs.length; i += tamaño) tandas.push(pairs.slice(i, i + tamaño))
  return tandas
}

export interface BuildSweepJobsInput {
  routes: LandingRouteRow[]
  destinations: LandingDestinationRow[]
  today: Date
  /** Día del plan (YYYY-MM-DD): semilla de rotación y sufijo del dedupe. */
  day: string
  monthsOverride?: number
  priority?: number
  trigger: 'cron' | 'manual'
  /**
   * Sondear también rutas o destinos apagados. El plan nocturno nunca; un
   * barrido a mano sí, que es cómo se prueba una ruta antes de publicarla
   * (el handler deja correr las inactivas con prioridad manual).
   */
  includeInactive?: boolean
  /**
   * Estimaciones vigentes de Sabre por ruta. Donde las hay, el barrido confirma
   * las fechas más baratas en vez de sus pares fijos.
   */
  estimatesByRoute?: Map<number, EstimateRow[]>
}

const claveDePar = (p: DatePair): string => `${p.depart}|${p.return}`

/**
 * Un `flights.sweep` por ruta activa × mes × tanda.
 *
 * "Sabre elige, siviajo confirma": si esa ruta y ese mes tienen estimaciones
 * vigentes, se sondean los `confirm_per_month` pares más baratos según Sabre
 * (completando con pares fijos si el estimador devolvió menos) en vez de los
 * `probes_per_month` de siempre. Sin estimaciones —Sabre apagado, caído o una
 * ruta con `scan_per_month` en 0— se cae al plan fijo de `planSweep`, que es
 * lo que hacía antes.
 *
 * Los primeros 4 meses van con un punto más de prioridad: son los que la
 * landing muestra primero y los que más se buscan. La clave de dedupe lleva
 * el día para que dos disparos de la misma noche no dupliquen sondas y para
 * que la noche siguiente sí vuelva a encolar.
 */
export function buildSweepJobs(input: BuildSweepJobsInput): EnqueueInput[] {
  const porCodigo = new Map(input.destinations.map(d => [d.code, d]))
  const jobs: EnqueueInput[] = []

  for (const route of input.routes) {
    if (!route.active && !input.includeInactive) continue
    const destination = porCodigo.get(route.destination_code)
    if (!destination) continue
    if (!destination.active && !input.includeInactive) continue

    const estimates = input.estimatesByRoute?.get(route.id) ?? []
    const meses = monthsAhead(input.today, input.monthsOverride ?? route.months_ahead)
    meses.forEach((month, monthIndex) => {
      const picks = pickPairsToConfirm({
        estimates,
        month,
        confirmPerMonth: route.confirm_per_month,
        today: input.today,
        minLeadDays: MIN_LEAD_DAYS,
      })
      const source: 'estimate' | 'fixed' = picks.length > 0 ? 'estimate' : 'fixed'
      const pairs = source === 'fixed' ? planSweep(route, month, { today: input.today, day: input.day }) : completar(picks, route, month, input)

      chunkPairs(pairs).forEach((chunk, index) => {
        jobs.push({
          kind: 'flights.sweep',
          payload: {
            routeId: route.id,
            destinationCode: destination.code,
            originCode: route.origin_tc_code,
            slug: destination.slug,
            month,
            chunk: index,
            pairs: chunk,
            // Para diagnóstico: si un mes vuelve a 'fixed' es que esa noche no
            // hubo estimaciones vigentes de Sabre.
            source,
            trigger: input.trigger,
          },
          dedupeKey: `flights.sweep:${route.origin_tc_code}:${destination.slug}:${month}:${index}:${input.day}`,
          priority: (input.priority ?? SWEEP_PRIORITY) + (monthIndex < 4 ? 1 : 0),
          maxAttempts: 2,
          entityType: 'flight_route',
          entityId: route.id,
          createdBy: input.trigger === 'cron' ? 'flights.sweep.plan' : 'ui',
        })
      })
    })
  }

  return jobs
}

/**
 * Si el estimador devolvió menos pares que `confirm_per_month` (un mes con
 * pocas fechas candidatas, búsquedas vacías), se completa con los pares fijos
 * del mes hasta llegar al cupo, sin repetir combinaciones.
 */
function completar(picks: DatePair[], route: LandingRouteRow, month: string, input: BuildSweepJobsInput): DatePair[] {
  if (picks.length >= route.confirm_per_month) return picks

  const pairs = [...picks]
  const vistos = new Set(pairs.map(claveDePar))
  for (const par of planSweep(route, month, { today: input.today, day: input.day })) {
    if (pairs.length >= route.confirm_per_month) break
    if (vistos.has(claveDePar(par))) continue
    vistos.add(claveDePar(par))
    pairs.push(par)
  }
  return pairs
}

/** 'AR 1304' → 'AR'. Sin número de vuelo no se inventa nada. */
function airlineCode(flightOut: string | null | undefined): string | null {
  const limpio = (flightOut ?? '').trim().toUpperCase()
  const prefijo = /^[A-Z0-9]{2}/.exec(limpio)
  return prefijo ? prefijo[0] : null
}

export interface ProbeResultToInsertInput {
  result: ProbeResult
  route: LandingRouteRow
  destination: LandingDestinationRow
  pair: DatePair
  jobId: number
  now: Date
  /** 1 la primera vez, 2 si fue el reintento (queda anotado en `error`). */
  attempt: number
}

/**
 * La respuesta de una sonda como fila de `flight_price_probes`.
 *
 * Se guarda siempre, con precio o sin él: una salida sin vuelos o un timeout
 * también son datos (para el tablero de salud y para no volver a sondear el
 * mismo par esta noche). La opción 0 es la más barata (el bot ya las ordena)
 * y es la que va a las columnas planas; las primeras 5 quedan en `options`
 * para el detalle.
 */
export function probeResultToInsert(input: ProbeResultToInsertInput): ProbeInsert {
  const { result, route, destination, pair, jobId, now, attempt } = input
  const probedAt = now.toISOString()

  const base = {
    route_id: route.id,
    origin: route.origin_tc_code,
    destination: destination.tc_code,
    destination_code: destination.code,
    departure_date: pair.depart,
    return_date: pair.return,
    nights: pair.nights,
    adults: DEFAULT_ADULTS,
    source: 'cotizador_probe',
    job_id: jobId,
    probed_at: probedAt,
    expires_at: new Date(now.getTime() + OBSERVATION_WINDOW_HOURS * 3_600_000).toISOString(),
    elapsed_ms: result.elapsedMs,
  }

  const mejor = result.status === 'ok' ? result.options[0] : undefined
  if (mejor) {
    return {
      ...base,
      status: 'ok',
      price_per_pax: mejor.pricePp,
      currency: mejor.currency || 'USD',
      airline: mejor.airline || null,
      airline_code: airlineCode(mejor.flightOut),
      stops: mejor.stopsOut,
      stops_back: mejor.stopsBack,
      // El bot manda -1 cuando no pudo leer las escalas (acá, null): eso no
      // es "tiene escalas", es "no sé".
      direct: mejor.stopsOut === null ? null : mejor.stopsOut === 0,
      duration_minutes: mejor.durationOutMin,
      duration_back_minutes: mejor.durationBackMin,
      fare_family: mejor.fareFamily || null,
      checked_bag: mejor.checkedBag,
      carry_on: mejor.carryOn,
      options: result.options.slice(0, 5),
      error: null,
    }
  }

  const mensaje = result.status === 'error' ? (attempt > 1 ? `${result.error} (intento ${attempt})` : result.error) : null
  return {
    ...base,
    // Un 'ok' sin opciones es una salida sin vuelos: 'empty', no 'ok' sin precio.
    status: result.status === 'ok' ? 'empty' : result.status,
    price_per_pax: null,
    currency: 'USD',
    airline: null,
    airline_code: null,
    stops: null,
    stops_back: null,
    direct: null,
    duration_minutes: null,
    duration_back_minutes: null,
    fare_family: null,
    checked_bag: null,
    carry_on: null,
    options: [],
    error: mensaje,
  }
}

const dormir = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Sondea los pares de un job con un pool de workers.
 *
 * Cada par termina en una fila: se reintenta una sola vez si el error lo
 * permite (un 502 sí, un 422 no) y cualquier otra falla se cuenta y se sigue,
 * porque perder una fecha no puede tumbar el resto del barrido. Si el
 * presupuesto de `cotizador_probe` se agotó, los workers dejan de tomar pares
 * y el job termina `skipped`: mañana se vuelve a encolar.
 */
export async function runSweep(deps: SweepDeps, input: SweepInput): Promise<SweepSummary> {
  const sleep = deps.sleep ?? dormir
  const now = deps.now ?? (() => new Date())
  const empezo = Date.now()

  const summary: SweepSummary = { probes: 0, ok: 0, empty: 0, errors: 0, timeouts: 0, minPrice: null, durationMs: 0, budgetStopped: false }
  const cola = [...input.pairs]
  const etiqueta = `${input.route.origin_tc_code}→${input.destination.code}`

  const sondaDe = (pair: DatePair): ProbeInput => ({
    originCode: input.route.origin_tc_code,
    destCode: input.destination.tc_code,
    departDate: pair.depart,
    returnDate: pair.return,
    adults: DEFAULT_ADULTS,
  })

  const worker = async (): Promise<void> => {
    for (;;) {
      if (summary.budgetStopped) return
      const pair = cola.shift()
      if (!pair) return

      // El heartbeat va en el finally: un par que falló también consumió
      // tiempo del lease, y sin renovarlo el job se reencola solo.
      try {
        let attempt = 1
        let result: ProbeResult
        try {
          result = await deps.probe(sondaDe(pair))
          if (result.status === 'error' && result.retryable && !summary.budgetStopped) {
            await sleep(PROBE_RETRY_DELAY_MS)
            attempt = 2
            result = await deps.probe(sondaDe(pair))
          }
        } catch (err) {
          if (err instanceof CotizadorBudgetExhausted) {
            summary.budgetStopped = true
            return
          }
          summary.probes++
          summary.errors++
          await deps.log(`Sonda ${etiqueta} ${pair.depart}/${pair.return} falló: ${err instanceof Error ? err.message : String(err)}`, { routeId: input.route.id, pair }, 'warning')
          continue
        }

        const row = probeResultToInsert({ result, route: input.route, destination: input.destination, pair, jobId: input.jobId, now: now(), attempt })
        summary.probes++
        if (row.status === 'ok') {
          summary.ok++
          if (row.price_per_pax !== null && (summary.minPrice === null || row.price_per_pax < summary.minPrice)) summary.minPrice = row.price_per_pax
        } else if (row.status === 'empty') summary.empty++
        else if (row.status === 'timeout') summary.timeouts++
        else summary.errors++

        try {
          await deps.save(row)
        } catch (err) {
          summary.errors++
          await deps.log(`No se pudo guardar la sonda ${etiqueta} ${pair.depart}/${pair.return}: ${err instanceof Error ? err.message : String(err)}`, { routeId: input.route.id, pair }, 'warning')
        }
      } finally {
        await deps.heartbeat()
      }
    }
  }

  const workers = Math.min(Math.max(1, input.concurrency ?? PROBE_CONCURRENCY), cola.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))

  // La landing cachea 10 minutos: lo recién sondeado tiene que verse ya.
  invalidatePublicCache()
  summary.durationMs = Date.now() - empezo
  return summary
}
