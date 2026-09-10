import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { GscSyncButton } from '@/components/vuelos-baratos/admin/GscSyncButton'
import { GscUrlTable, type GscUrlRow } from '@/components/vuelos-baratos/admin/GscUrlTable'
import { RoutesTable, type AdminDestinationGroup, type AdminRouteRow } from '@/components/vuelos-baratos/admin/RoutesTable'
import { checkSectionAccess } from '@/lib/auth'
import { GSC_PROVIDER, gscSiteUrl, isGscConfigured } from '@/lib/gsc/client'
import { getGscSummary } from '@/lib/gsc/queries'
import type { GscSummary } from '@/lib/gsc/types'
import { getBudgetStatus } from '@/lib/jobs/budget'
import { FLAGS, isFlagEnabled, loadFlags } from '@/lib/jobs/flags'
import { isSabreConfigured } from '@/lib/sabre/client'
import type { Db } from '@/lib/jobs/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { bestOverall, bestPerPair, freshnessLabel, lastObservedAt } from '@/lib/vuelos-baratos/aggregates'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import {
  countEstimatesSince,
  countPendingSweepJobs,
  getLastEstimateAtByRoute,
  getRecentProbesForRoutes,
  getSweepHealth,
  listLandingDestinations,
  listRoutes,
} from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

/** Ventana de salud del tablero: la noche anterior entera. */
const HEALTH_HOURS = 24
const PROVEEDOR_SONDAS = 'cotizador_probe'
/** Una unidad = una búsqueda BargainFinderMax. */
const PROVEEDOR_SABRE = 'sabre'
/** Una unidad = una llamada a la API de Search Console (100/día). */
const PROVEEDOR_GSC = GSC_PROVIDER
/** Ventana de la card de Search Console (la misma que muestra Google por defecto). */
const GSC_DAYS = 28

/** El precio se arma acá y no en el cliente: `toLocaleString` no da igual en los dos. */
function money(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  const monto = Math.round(value).toLocaleString('es-AR')
  return currency && currency !== 'USD' ? `${currency} ${monto}` : `US$ ${monto}`
}

function numero(value: number): string {
  return Math.round(value).toLocaleString('es-AR')
}

function decimal(value: number, digits = 1): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return '—'
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/** Google devuelve el veredicto en inglés y en mayúsculas; acá se lee en castellano. */
function veredicto(verdict: string | null): { label: string; tone: GscUrlRow['tone'] } {
  switch (verdict) {
    case 'PASS':
      return { label: 'Indexada', tone: 'ok' }
    case 'PARTIAL':
      return { label: 'Con avisos', tone: 'warn' }
    case 'FAIL':
      return { label: 'Excluida', tone: 'warn' }
    case 'NEUTRAL':
      return { label: 'Sin indexar', tone: 'muted' }
    default:
      return { label: 'Sin inspeccionar', tone: 'muted' }
  }
}

/**
 * Search Console de la landing.
 *
 * Va aparte y con `try`: las tablas `gsc_*` se crean con la migración que
 * aplica el controlador, y hasta entonces (o si Supabase se cae) la pantalla
 * de rutas tiene que seguir abriendo — la card muestra "sin datos" y listo.
 */
async function loadGsc(db: Db, base: string): Promise<GscSummary | null> {
  try {
    return await getGscSummary(db, { site: gscSiteUrl(), pagePrefix: base, days: GSC_DAYS })
  } catch (err) {
    console.error('[vuelos-baratos] No se pudo leer Search Console:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Une lo que inspeccionamos con lo que trajo tráfico: una fila por URL. */
function gscRows(gsc: GscSummary | null, base: string, now: Date): GscUrlRow[] {
  if (!gsc) return []

  const sinBarra = (url: string) => url.replace(/\/+$/, '')
  const totales = new Map(gsc.pages.map(p => [sinBarra(p.page), p]))
  const urls = new Set([...gsc.urlStatus.map(u => sinBarra(u.url)), ...totales.keys()])
  const estados = new Map(gsc.urlStatus.map(u => [sinBarra(u.url), u]))

  const filas = [...urls].map(url => {
    const estado = estados.get(url)
    const total = totales.get(url)
    const { label, tone } = veredicto(estado?.verdict ?? null)
    const row: GscUrlRow = {
      url,
      path: url.startsWith(base) ? url.slice(base.length) || '/' : url,
      verdict: label,
      tone,
      coverage: estado?.coverage_state ?? null,
      crawled: estado?.last_crawl_time ? freshnessLabel(estado.last_crawl_time, now) : '—',
      clicks: numero(total?.clicks ?? 0),
      impressions: numero(total?.impressions ?? 0),
      position: total && total.impressions > 0 ? decimal(total.position) : '—',
    }
    return { row, clicks: total?.clicks ?? 0 }
  })

  // Primero lo que trae tráfico; entre las que no traen nada, por URL.
  return filas.sort((a, b) => b.clicks - a.clicks || a.row.path.localeCompare(b.row.path)).map(f => f.row)
}

async function loadPage() {
  const db = createAdminClient()
  const now = new Date()
  const fromDate = todayIso(now)

  const base = publicBaseUrl()

  const [destinations, routes, health, jobs, budget, sabreBudget, estimates24h, lastEstimateAt, flags, gscBudget, gsc] = await Promise.all([
    listLandingDestinations(db),
    listRoutes(db),
    getSweepHealth(db, HEALTH_HOURS),
    countPendingSweepJobs(db),
    getBudgetStatus(db, PROVEEDOR_SONDAS),
    getBudgetStatus(db, PROVEEDOR_SABRE),
    countEstimatesSince(db, HEALTH_HOURS),
    getLastEstimateAtByRoute(db),
    loadFlags(db),
    getBudgetStatus(db, PROVEEDOR_GSC),
    loadGsc(db, base),
  ])

  // Los pares vigentes hacen falta para el mínimo y la frescura de cada ruta.
  const rowsByRoute = await getRecentProbesForRoutes(
    db,
    routes.map(r => r.id),
    { fromDate }
  )

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
      scanPerMonth: route.scan_per_month,
      confirmPerMonth: route.confirm_per_month,
      monthsAhead: route.months_ahead,
      stayNights: route.stay_nights,
      weekdays: route.weekdays,
      freshness: observado ? freshnessLabel(observado, now) : null,
      lastProbe: salud?.lastObservedAt ? freshnessLabel(salud.lastObservedAt, now) : null,
      estimateFreshness: lastEstimateAt.has(route.id) ? freshnessLabel(lastEstimateAt.get(route.id)!, now) : null,
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
    sabreBudget,
    estimates24h,
    totales,
    queued: jobs.queued,
    running: jobs.running,
    totalJobs: jobs.total,
    sweepOff: !isFlagEnabled(flags, FLAGS.flightsSweep),
    cotizadorOff: !isFlagEnabled(flags, FLAGS.cotizadorCalls),
    sabreOff: !isFlagEnabled(flags, FLAGS.sabreCalls),
    sabreUnconfigured: !isSabreConfigured(),
    gscBudget,
    gscOff: !isFlagEnabled(flags, FLAGS.gscWrites),
    gscUnconfigured: !isGscConfigured(),
    gscSite: gscSiteUrl(),
    gscRows: gscRows(gsc, base, now),
    gsc: gsc
      ? {
          clicks: numero(gsc.clicks),
          impressions: numero(gsc.impressions),
          ctr: gsc.impressions > 0 ? `${decimal(gsc.ctr * 100, 2)} %` : '—',
          position: gsc.impressions > 0 ? decimal(gsc.position) : '—',
          sitemap: gsc.sitemap
            ? {
                submitted: fecha(gsc.sitemap.last_submitted),
                pending: gsc.sitemap.is_pending === true,
                indexed: numero(gsc.sitemap.indexed_urls ?? 0),
                urls: numero(gsc.sitemap.submitted_urls ?? 0),
                leido: gsc.sitemap.submitted_urls !== null,
                errores: gsc.sitemap.errors ?? 0,
              }
            : null,
        }
      : null,
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

  const {
    groups,
    budget,
    sabreBudget,
    estimates24h,
    totales,
    queued,
    running,
    totalJobs,
    sweepOff,
    cotizadorOff,
    sabreOff,
    sabreUnconfigured,
    gsc,
    gscRows: urlRows,
    gscBudget,
    gscOff,
    gscUnconfigured,
    gscSite,
  } = await loadPage()
  const publicados = groups.filter(g => g.active).length
  const rutasActivas = groups.reduce((acc, g) => acc + g.routes.filter(r => r.active).length, 0)

  return (
    <div className="flex flex-col">
      <Header title="Vuelos baratos" />
      <div className="space-y-6 p-6">
        <p className="text-xs text-gray-500">
          vuelos.siviajo.com · barrido nocturno de tarifas en siviajo.com · {publicados} destinos publicados, {rutasActivas} rutas activas
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Estimaciones 24 h</p>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{estimates24h}</p>
            <p className="text-xs text-gray-500">pares que Sabre estimó (eligen qué se confirma)</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3" title="Una unidad = una búsqueda BargainFinderMax">
            <p className="text-xs uppercase tracking-wide text-gray-500">Presupuesto Sabre hoy</p>
            <p
              className={`text-2xl font-semibold tabular-nums ${
                sabreBudget.exhausted ? 'text-red-600' : sabreBudget.pct >= sabreBudget.alertPct ? 'text-amber-600' : 'text-gray-900'
              }`}
            >
              {sabreBudget.spentToday}
              {sabreBudget.dailyCap ? ` / ${sabreBudget.dailyCap}` : ''}
            </p>
            <p className="text-xs text-gray-500">
              {sabreBudget.dailyCap || sabreBudget.monthlyCap
                ? `${sabreBudget.pct} % del tope más ajustado (diario o mensual)`
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

        {(sabreOff || sabreUnconfigured) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            El estimador de Sabre no va a correr{' '}
            {sabreUnconfigured ? (
              <>
                (faltan las <code>SABRE_*</code> en <code>/opt/hub/.env.local</code>)
              </>
            ) : (
              <>
                (<code>{FLAGS.sabreCalls}</code> apagado en{' '}
                <Link href="/automatizacion" className="font-medium underline underline-offset-2">
                  /automatizacion
                </Link>
                )
              </>
            )}
            . El barrido sigue funcionando con las fechas fijas de cada ruta.
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Destinos y rutas</h2>
            <p className="text-xs text-gray-500">
              Publicado saca o pone el destino en la landing; Activa decide si el plan nocturno barre esa ruta. Sabre/mes es cuántas fechas
              estima el BFM por mes y Confirmar/mes cuántas de ésas se cotizan de verdad en siviajo.com; Sondas/mes es el plan de respaldo
              cuando no hay estimaciones.
            </p>
          </div>
          <RoutesTable groups={groups} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Search Console ({GSC_DAYS} días)</h2>
              <p className="text-xs text-gray-500">
                Propiedad <code>{gscSite}</code> · {gscBudget.spentToday}
                {gscBudget.dailyCap ? ` / ${gscBudget.dailyCap}` : ''} llamadas hoy · el job diario reenvía el sitemap e inspecciona hasta 20 URLs
              </p>
            </div>
            <GscSyncButton />
          </div>

          {(gscOff || gscUnconfigured) && (
            <p className="border-b border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {gscUnconfigured ? (
                <>
                  Falta <code>GOOGLE_DRIVE_CREDENTIALS</code> en <code>/opt/hub/.env.local</code>: el job termina omitido y estos números no se
                  actualizan.
                </>
              ) : (
                <>
                  <code>{FLAGS.gscWrites}</code> está apagado en{' '}
                  <Link href="/automatizacion" className="font-medium underline underline-offset-2">
                    /automatizacion
                  </Link>
                  : el job termina omitido y estos números no se actualizan.
                </>
              )}
            </p>
          )}

          <div className="grid gap-4 border-b border-gray-200 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Clics</p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{gsc ? gsc.clicks : '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Impresiones</p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{gsc ? gsc.impressions : '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">CTR</p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{gsc ? gsc.ctr : '—'}</p>
            </div>
            <div title="Ponderada por impresiones, como la calcula Google">
              <p className="text-xs uppercase tracking-wide text-gray-500">Posición media</p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{gsc ? gsc.position : '—'}</p>
            </div>
          </div>

          <p className="border-b border-gray-200 px-4 py-2 text-xs text-gray-600">
            {gsc?.sitemap ? (
              <>
                <strong>Sitemap</strong>: enviado {gsc.sitemap.submitted} · {gsc.sitemap.pending ? 'pendiente de procesar' : 'procesado'}
                {gsc.sitemap.leido ? (
                  <>
                    {' '}
                    · {gsc.sitemap.indexed}/{gsc.sitemap.urls} URLs indexadas
                  </>
                ) : (
                  ' · Google todavía no lo descargó'
                )}
                {gsc.sitemap.errores > 0 ? ` · ${gsc.sitemap.errores} errores` : ''}
              </>
            ) : (
              <>
                <strong>Sitemap</strong>: sin datos todavía. El job diario lo reenvía y guarda acá lo que responde Google.
              </>
            )}
          </p>

          <GscUrlTable rows={urlRows} />

          <p className="px-4 py-3 text-xs text-gray-500">
            Un dominio nuevo tarda días o semanas en indexarse: mientras tanto la inspección dice &ldquo;sin indexar&rdquo; y no es un error.
            Lo que acelera es que le lleguen enlaces desde siviajo.com y el blog.
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
          <h2 className="text-sm font-semibold text-gray-900">Cómo funciona</h2>
          <ul className="mt-2 space-y-1">
            <li>
              <strong>Sabre elige, siviajo confirma</strong>: a las <strong>23:00 UTC</strong> (20:00 ART) el estimador le pide a Sabre (BFM, PCC propio){' '}
              <strong>Sabre/mes</strong> pares por ruta y mes; a la <strong>01:00 UTC</strong> el barrido cotiza en siviajo.com los{' '}
              <strong>Confirmar/mes</strong> más baratos de cada mes. La estimación nunca se publica como precio (la landing la muestra como
              &ldquo;≈ US$&rdquo;); el precio de la grilla siempre sale de una sonda real.
            </li>
            <li>
              <strong>Una sonda</strong> es una cotización real de ida y vuelta en siviajo.com para un par de fechas: es lo que después la
              landing muestra como precio. Vale 48 h.
            </li>
            <li>
              Los jobs del barrido se ejecutan en la ventana del cotizador, <strong>22:00–07:00 ART</strong>, de a uno: de día el único worker
              es del bot del CRM. Las estimaciones van por el lane <code>sabre</code>, también de a una.
            </li>
            <li>
              El tope por ruta es <strong>Sabre/mes × meses futuros</strong> en el presupuesto <code>{PROVEEDOR_SABRE}</code> y{' '}
              <strong>Confirmar/mes × meses futuros</strong> en <code>{PROVEEDOR_SONDAS}</code>. Sin estimaciones vigentes el barrido cae a{' '}
              <strong>sondas/mes</strong>, que es más caro en llamadas al cotizador.
            </li>
            <li>
              Los jobs (<code>flights.estimate.plan</code>, <code>flights.estimate</code>, <code>flights.sweep.plan</code> y{' '}
              <code>flights.sweep</code>) y los interruptores se ven en{' '}
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
