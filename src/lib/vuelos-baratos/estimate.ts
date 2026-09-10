import { SabreBudgetExhausted, type BfmInput, type BfmResult } from '@/lib/sabre/client'
import type { EnqueueInput, JobContext } from '@/lib/jobs/types'
import {
  DEFAULT_ADULTS,
  ESTIMATE_MONTHS_PER_JOB,
  ESTIMATE_PRIORITY,
  MIN_LEAD_DAYS,
  SABRE_MAX_ITINERARIES,
  originIata,
} from './config'
import { addDays, daysBetween, generateDatePairs, monthOf, monthsAhead, todayIso } from './date-pairs'
import type { DatePair, EstimateInsert, EstimateRow, EstimateSummary, LandingDestinationRow, LandingRouteRow } from './types'

/**
 * El estimador de Sabre: "Sabre elige, siviajo confirma".
 *
 * Cada noche, una hora antes del barrido, `flights.estimate` le pide a Sabre
 * (BargainFinderMax, PCC propio) `scan_per_month` pares por ruta y mes. Esas
 * estimaciones NO se publican como precio: ordenan el mes para que el barrido
 * gaste sus `confirm_per_month` sondas del cotizador en las fechas que valen
 * la pena.
 *
 * Igual que `sweep.ts`, acá no hay red ni base: las dependencias entran por
 * `EstimateDeps` (una llamada a Sabre se cobra, así que los tests van con
 * dobles).
 */

/** `flight_fare_estimates.source`: el CHECK de la tabla sólo acepta este valor. */
export const ESTIMATE_SOURCE = 'sabre_bfm'

/**
 * Un error de credenciales no mejora con el próximo par: corta el job entero.
 *
 * Se mira el texto porque el `BfmResult` no alcanza: `retryable: false` también
 * lo devuelve un fault del BFM (un código de aeropuerto que Sabre no acepta), y
 * eso sí es cosa de una ruta sola. Lo que sí es inconfundible es el mensaje de
 * `SabreAuthError` ("Sabre no abrió la sesión: …"), que es el ÚNICO error de
 * `createSabreShopper().shop()` que viene de crear la sesión; las variantes en
 * inglés cubren el faultstring que manda Sabre (AUTHENTICATION FAILED,
 * "Authorization failed") si llegara por otro camino.
 *
 * Una caída de red vuelve como `retryable: true` y sí se sigue intentando.
 */
const AUTH_ERROR_RE = /^Sabre no abrió la sesión|authoriz|authenticat|credenc|credential/i

export interface EstimateDeps {
  shop: (input: BfmInput) => Promise<BfmResult>
  /** Se llama una sola vez, al final, con todas las filas de la tanda. */
  save: (rows: EstimateInsert[]) => Promise<void>
  heartbeat: () => Promise<void>
  log: JobContext['log']
  now?: () => Date
}

export interface EstimateInput {
  route: LandingRouteRow
  destination: LandingDestinationRow
  pairs: DatePair[]
  jobId: number
}

/**
 * El IATA que Sabre entiende para un destino de la landing.
 *
 * `iata_display` es el aeropuerto/ciudad real (MIA, MAD, GIG, FLN, PUJ, CUN,
 * SCL, JFK, BCN, FCO, MCO); el `tc_code` es el fallback y casi siempre
 * coincide. Si Sabre rechaza el código, la búsqueda vuelve como `error` (no
 * como "sin vuelos"): se ve en el `result` del job y en /logs, y se arregla
 * cargando `iata_display` en el destino.
 */
export function destinationIata(destination: LandingDestinationRow): string {
  return (destination.iata_display ?? destination.tc_code).trim().toUpperCase()
}

/** Los pares de un mes que estima Sabre para una ruta. `day` rota los exploradores. */
export function planEstimate(route: LandingRouteRow, month: string, opts: { today: Date; day: string }): DatePair[] {
  return generateDatePairs({
    month,
    today: opts.today,
    weekdays: route.weekdays,
    stays: route.stay_nights,
    perMonth: route.scan_per_month,
    minLeadDays: MIN_LEAD_DAYS,
    rotationSeed: opts.day,
  })
}

export interface BuildEstimateJobsInput {
  routes: LandingRouteRow[]
  destinations: LandingDestinationRow[]
  today: Date
  /** Día del plan (YYYY-MM-DD): semilla de rotación y sufijo del dedupe. */
  day: string
  monthsOverride?: number
  priority?: number
  trigger: 'cron' | 'manual'
  /** Estimar también rutas o destinos apagados (sólo a mano, para probarlos). */
  includeInactive?: boolean
}

/**
 * Un `flights.estimate` por ruta activa × grupo de meses.
 *
 * Los meses van de a `ESTIMATE_MONTHS_PER_JOB` porque la sesión de Sabre
 * busca de a un par por vez (~3 s cada uno) y el lease del lane es de 15 min:
 * dos meses de 8 pares entran cómodos.
 */
export function buildEstimateJobs(input: BuildEstimateJobsInput): EnqueueInput[] {
  const porCodigo = new Map(input.destinations.map(d => [d.code, d]))
  const jobs: EnqueueInput[] = []

  for (const route of input.routes) {
    // scan_per_month 0 = ruta sin estimador: el barrido usa sus pares fijos.
    if (route.scan_per_month <= 0) continue
    if (!route.active && !input.includeInactive) continue
    const destination = porCodigo.get(route.destination_code)
    if (!destination) continue
    if (!destination.active && !input.includeInactive) continue

    const meses = monthsAhead(input.today, input.monthsOverride ?? route.months_ahead)
    for (let i = 0; i < meses.length; i += ESTIMATE_MONTHS_PER_JOB) {
      const grupo = meses.slice(i, i + ESTIMATE_MONTHS_PER_JOB)
      const pairs = grupo.flatMap(month => planEstimate(route, month, { today: input.today, day: input.day }))
      // Un mes ya empezado puede no tener ninguna fecha candidata.
      if (pairs.length === 0) continue

      jobs.push({
        kind: 'flights.estimate',
        payload: {
          routeId: route.id,
          destinationCode: destination.code,
          originCode: route.origin_tc_code,
          slug: destination.slug,
          months: grupo,
          pairs,
          trigger: input.trigger,
        },
        dedupeKey: `flights.estimate:${route.origin_tc_code}:${destination.slug}:${grupo.join('+')}:${input.day}`,
        priority: input.priority ?? ESTIMATE_PRIORITY,
        maxAttempts: 2,
        entityType: 'flight_route',
        entityId: route.id,
        createdBy: input.trigger === 'cron' ? 'flights.estimate.plan' : 'ui',
      })
    }
  }

  return jobs
}

/**
 * Estima los pares de un job, uno por uno.
 *
 * Secuencial a propósito: la sesión SOAP de Sabre no admite pedidos en
 * paralelo. Un par que falla se cuenta y se sigue (perder una fecha no puede
 * tumbar la noche); lo que sí corta todo es el presupuesto agotado o un error
 * de credenciales. Las filas se guardan en un solo lote al final: son ≤16 por
 * job y así el upsert es una sola ida a la base.
 */
export async function runEstimate(deps: EstimateDeps, input: EstimateInput): Promise<EstimateSummary> {
  const now = deps.now ?? (() => new Date())
  const empezo = Date.now()
  const { route, destination, pairs, jobId } = input

  const summary: EstimateSummary = {
    pairs: 0,
    ok: 0,
    empty: 0,
    errors: 0,
    minPrice: null,
    durationMs: 0,
    budgetStopped: false,
    fatalError: null,
  }

  const etiqueta = `${route.origin_tc_code}→${destination.code}`
  const origen = originIata(route.origin_tc_code)
  if (!origen) {
    // Sabre no entiende los códigos de destino de TC: sin IATA no hay búsqueda
    // posible y reintentar no lo arregla (falta mapear el origen en config.ts).
    summary.fatalError = `El origen ${route.origin_tc_code} no tiene IATA mapeado para Sabre`
    summary.durationMs = Date.now() - empezo
    await deps.log(`Estimación ${etiqueta}: ${summary.fatalError}`, { routeId: route.id }, 'warning')
    return summary
  }
  const destino = destinationIata(destination)

  const rows: EstimateInsert[] = []

  for (const pair of pairs) {
    if (summary.budgetStopped || summary.fatalError) break

    // El heartbeat va en el finally: un par que falló también consumió tiempo
    // del lease, y sin renovarlo el job se reencola solo.
    try {
      let res: BfmResult
      try {
        res = await deps.shop({
          originIata: origen,
          destIata: destino,
          departDate: pair.depart,
          returnDate: pair.return,
          adults: DEFAULT_ADULTS,
          maxItineraries: SABRE_MAX_ITINERARIES,
        })
      } catch (err) {
        if (err instanceof SabreBudgetExhausted) {
          summary.budgetStopped = true
          break
        }
        summary.pairs++
        summary.errors++
        await deps.log(
          `Estimación ${etiqueta} ${pair.depart}/${pair.return} falló: ${err instanceof Error ? err.message : String(err)}`,
          { routeId: route.id, pair },
          'warning'
        )
        continue
      }

      summary.pairs++

      if (res.status === 'ok') {
        const mejor = res.cheapest
        summary.ok++
        if (summary.minPrice === null || mejor.totalUsd < summary.minPrice) summary.minPrice = mejor.totalUsd
        rows.push({
          route_id: route.id,
          depart_date: pair.depart,
          return_date: pair.return,
          price_pp: mejor.totalUsd,
          currency: mejor.currency || 'USD',
          airline_code: mejor.airlineCode,
          stops_out: mejor.stopsOut,
          stops_back: mejor.stopsBack,
          // BFM no manda `ElapsedTime`: quedan en null. No se calculan por
          // diferencia de horarios (son horas locales de husos distintos).
          duration_out_minutes: mejor.durationOutMin,
          duration_back_minutes: mejor.durationBackMin,
          itineraries: res.itineraries.slice(0, SABRE_MAX_ITINERARIES),
          source: ESTIMATE_SOURCE,
          job_id: jobId,
          elapsed_ms: res.elapsedMs,
          observed_at: now().toISOString(),
        })
      } else if (res.status === 'empty') {
        summary.empty++
      } else {
        summary.errors++
        if (!res.retryable && AUTH_ERROR_RE.test(res.error)) summary.fatalError = res.error
        await deps.log(
          `Estimación ${etiqueta} ${pair.depart}/${pair.return}: ${res.error}`,
          { routeId: route.id, pair, retryable: res.retryable },
          'warning'
        )
      }
    } finally {
      await deps.heartbeat()
    }
  }

  if (rows.length > 0) {
    try {
      await deps.save(rows)
    } catch (err) {
      // Perder el lote es feo pero no es motivo para reventar el job: queda
      // contado como error y el plan de mañana vuelve a estimar.
      summary.errors++
      await deps.log(
        `No se pudieron guardar las estimaciones de ${etiqueta}: ${err instanceof Error ? err.message : String(err)}`,
        { routeId: route.id, rows: rows.length },
        'warning'
      )
    }
  }

  summary.durationMs = Date.now() - empezo
  return summary
}

export interface PickPairsInput {
  estimates: EstimateRow[]
  month: string
  confirmPerMonth: number
  today: Date
  minLeadDays: number
}

/**
 * Los pares del mes que el barrido confirma contra siviajo.com: los más
 * baratos según Sabre, sin repetir combinación de fechas.
 */
export function pickPairsToConfirm(input: PickPairsInput): DatePair[] {
  const { estimates, month, confirmPerMonth, today, minLeadDays } = input
  if (confirmPerMonth <= 0) return []

  const desde = addDays(todayIso(today), minLeadDays)
  const candidatas = estimates
    .filter(e => monthOf(e.depart_date) === month && e.depart_date >= desde)
    // Desempate completo (precio → ida → vuelta): dos estimaciones al mismo
    // precio tienen que elegirse igual en cada corrida.
    .sort((a, b) => a.price_pp - b.price_pp || a.depart_date.localeCompare(b.depart_date) || a.return_date.localeCompare(b.return_date))

  const elegidos: DatePair[] = []
  const vistos = new Set<string>()
  for (const e of candidatas) {
    if (elegidos.length >= confirmPerMonth) break
    const clave = `${e.depart_date}|${e.return_date}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    elegidos.push({ depart: e.depart_date, return: e.return_date, nights: daysBetween(e.depart_date, e.return_date) })
  }
  return elegidos
}

/** El mínimo estimado de cada mes, para los chips de la landing. */
export function minEstimateByMonth(estimates: EstimateRow[]): Map<string, number> {
  const porMes = new Map<string, number>()
  for (const e of estimates) {
    const mes = monthOf(e.depart_date)
    const actual = porMes.get(mes)
    if (actual === undefined || e.price_pp < actual) porMes.set(mes, e.price_pp)
  }
  return porMes
}
