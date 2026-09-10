import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { RoutesTable, type AdminDestinationGroup, type AdminRouteRow } from '@/components/vuelos-baratos/admin/RoutesTable'
import { checkSectionAccess } from '@/lib/auth'
import { getBudgetStatus } from '@/lib/jobs/budget'
import { FLAGS, isFlagEnabled, loadFlags } from '@/lib/jobs/flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { bestOverall, bestPerPair, freshnessLabel, lastObservedAt } from '@/lib/vuelos-baratos/aggregates'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import {
  countPendingSweepJobs,
  getRecentProbesForRoutes,
  getSweepHealth,
  listLandingDestinations,
  listRoutes,
} from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

/** Ventana de salud del tablero: la noche anterior entera. */
const HEALTH_HOURS = 24
const PROVEEDOR_SONDAS = 'cotizador_probe'

/** El precio se arma acá y no en el cliente: `toLocaleString` no da igual en los dos. */
function money(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  const monto = Math.round(value).toLocaleString('es-AR')
  return currency && currency !== 'USD' ? `${currency} ${monto}` : `US$ ${monto}`
}

async function loadPage() {
  const db = createAdminClient()
  const now = new Date()
  const fromDate = todayIso(now)

  const [destinations, routes, health, jobs, budget, flags] = await Promise.all([
    listLandingDestinations(db),
    listRoutes(db),
    getSweepHealth(db, HEALTH_HOURS),
    countPendingSweepJobs(db),
    getBudgetStatus(db, PROVEEDOR_SONDAS),
    loadFlags(db),
  ])

  // Los pares vigentes hacen falta para el mínimo y la frescura de cada ruta.
  const rowsByRoute = await getRecentProbesForRoutes(
    db,
    routes.map(r => r.id),
    { fromDate }
  )

  const base = publicBaseUrl()
  const routesByDestination = new Map<string, AdminRouteRow[]>()
  for (const route of routes) {
    const salud = health.get(route.id)
    const pairs = bestPerPair(rowsByRoute.get(route.id) ?? [], { fromDate })
    const mejor = bestOverall(pairs)
    const observado = lastObservedAt(pairs)

    const fila: AdminRouteRow = {
      id: route.id,
      originCode: route.origin_tc_code,
      originName: route.origin_name,
      active: route.active,
      probesPerMonth: route.probes_per_month,
      monthsAhead: route.months_ahead,
      stayNights: route.stay_nights,
      weekdays: route.weekdays,
      freshness: observado ? freshnessLabel(observado, now) : null,
      lastProbe: salud?.lastObservedAt ? freshnessLabel(salud.lastObservedAt, now) : null,
      ok: salud?.ok ?? 0,
      empty: salud?.empty ?? 0,
      errors: salud?.errors ?? 0,
      timeouts: salud?.timeouts ?? 0,
      minPriceLabel: money(mejor?.pricePp ?? null, mejor?.currency ?? null),
      pendingJobs: jobs.byRouteId.get(route.id) ?? 0,
    }
    const actuales = routesByDestination.get(route.destination_code)
    if (actuales) actuales.push(fila)
    else routesByDestination.set(route.destination_code, [fila])
  }

  const groups: AdminDestinationGroup[] = destinations.map(d => ({
    code: d.code,
    name: d.name,
    slug: d.slug,
    tcCode: d.tc_code,
    haul: d.haul,
    active: d.active,
    iataDisplay: d.iata_display,
    seoTitle: d.seo_title,
    seoDescription: d.seo_description,
    heroImageUrl: d.hero_image_url,
    faq: d.faq,
    sortOrder: d.sort_order,
    landingUrl: `${base}/vuelos-baratos/${d.slug}`,
    routes: routesByDestination.get(d.code) ?? [],
  }))

  const totales = [...health.values()].reduce(
    (acc, h) => ({ ok: acc.ok + h.ok, empty: acc.empty + h.empty, fallidas: acc.fallidas + h.errors + h.timeouts }),
    { ok: 0, empty: 0, fallidas: 0 }
  )

  return {
    groups,
    budget,
    totales,
    queued: jobs.queued,
    running: jobs.running,
    totalJobs: jobs.total,
    sweepOff: !isFlagEnabled(flags, FLAGS.flightsSweep),
    cotizadorOff: !isFlagEnabled(flags, FLAGS.cotizadorCalls),
  }
}

/**
 * Vuelos baratos (vuelos.siviajo.com): qué destinos y rutas barre el trabajo
 * nocturno, cómo viene rindiendo y el botón para probar una ruta a mano.
 *
 * El tablero es el freno look-to-book: acá se ve cuántas llamadas al cotizador
 * está pidiendo la noche (sondas/mes × meses × rutas activas) y cuánto de eso
 * volvió con precio.
 */
export default async function VuelosBaratosAdminPage() {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) redirect('/dashboard')

  const { groups, budget, totales, queued, running, totalJobs, sweepOff, cotizadorOff } = await loadPage()
  const publicados = groups.filter(g => g.active).length
  const rutasActivas = groups.reduce((acc, g) => acc + g.routes.filter(r => r.active).length, 0)

  return (
    <div className="flex flex-col">
      <Header title="Vuelos baratos" />
      <div className="space-y-6 p-6">
        <p className="text-xs text-gray-500">
          vuelos.siviajo.com · barrido nocturno de tarifas en siviajo.com · {publicados} destinos publicados, {rutasActivas} rutas activas
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title={`${totalJobs} jobs flights.* pendientes`}>
            <p className="text-xs uppercase tracking-wide text-gray-500">Jobs en cola / corriendo</p>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">
              {queued} / {running}
            </p>
            <Link href="/automatizacion" className="text-xs text-[#1A237E] underline-offset-2 hover:underline">
              Ver la cola
            </Link>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Observaciones 24 h</p>
            <p className="text-2xl font-semibold tabular-nums text-emerald-700">{totales.ok}</p>
            <p className="text-xs text-gray-500">{totales.empty} sin vuelos</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Errores + timeouts 24 h</p>
            <p className={`text-2xl font-semibold tabular-nums ${totales.fallidas > 0 ? 'text-red-600' : 'text-gray-900'}`}>{totales.fallidas}</p>
            <p className="text-xs text-gray-500">sondas que no devolvieron nada</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Presupuesto sondas hoy</p>
            <p
              className={`text-2xl font-semibold tabular-nums ${
                budget.exhausted ? 'text-red-600' : budget.pct >= budget.alertPct ? 'text-amber-600' : 'text-gray-900'
              }`}
            >
              {budget.spentToday}
              {budget.dailyCap ? ` / ${budget.dailyCap}` : ''}
            </p>
            <p className="text-xs text-gray-500">
              {budget.dailyCap || budget.monthlyCap
                ? `${budget.pct} % del tope más ajustado (diario o mensual)`
                : 'sin topes configurados'}
            </p>
          </div>
        </div>

        {(sweepOff || cotizadorOff) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            El barrido está apagado en{' '}
            <Link href="/automatizacion" className="font-medium underline underline-offset-2">
              /automatizacion
            </Link>{' '}
            ({[sweepOff ? FLAGS.flightsSweep : null, cotizadorOff ? FLAGS.cotizadorCalls : null].filter(Boolean).join(' y ')}). Las rutas siguen
            configurables, pero esta noche no se sondea nada.
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Destinos y rutas</h2>
            <p className="text-xs text-gray-500">
              Publicado saca o pone el destino en la landing; Activa decide si el plan nocturno barre esa ruta. Sondas/mes es cuántas
              cotizaciones pide por cada mes futuro.
            </p>
          </div>
          <RoutesTable groups={groups} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
          <h2 className="text-sm font-semibold text-gray-900">Cómo funciona</h2>
          <ul className="mt-2 space-y-1">
            <li>
              <strong>Una sonda</strong> es una cotización real de ida y vuelta en siviajo.com para un par de fechas: es lo que después la
              landing muestra como precio. Vale 48 h.
            </li>
            <li>
              El plan nocturno corre a la 01:00 UTC y los jobs se ejecutan en la ventana del cotizador,{' '}
              <strong>22:00–07:00 ART</strong>, de a uno: de día el único worker es del bot del CRM.
            </li>
            <li>
              El tope por ruta es <strong>sondas/mes × meses futuros</strong>; el tope global del día vive en el presupuesto del proveedor{' '}
              <code>{PROVEEDOR_SONDAS}</code>. Subir sondas/mes es subir llamadas al cotizador.
            </li>
            <li>
              Los jobs (<code>flights.sweep.plan</code> y <code>flights.sweep</code>) y los interruptores se ven en{' '}
              <Link href="/automatizacion" className="text-[#1A237E] underline underline-offset-2">
                /automatizacion
              </Link>
              ; los eventos, en{' '}
              <Link href="/logs" className="text-[#1A237E] underline underline-offset-2">
                /logs
              </Link>
              .
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
