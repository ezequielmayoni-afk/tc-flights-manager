'use client'

import { useState } from 'react'
import { ActiveToggle } from './ActiveToggle'
import { DeleteButton } from './DeleteButton'
import { DestinationEditor, type DestinationFormValues } from './DestinationEditor'
import { EstimateNowButton } from './EstimateNowButton'
import { RouteEditor, type RouteFormValues } from './RouteEditor'
import { ResolveCodeButton } from './ResolveCodeButton'
import { RouteNumberInput } from './RouteNumberInput'
import { SweepNowButton } from './SweepNowButton'

/**
 * Una ruta del barrido, ya masticada por el server: los agregados y las
 * etiquetas de frescura se calculan allá para que el cliente no haga cuentas
 * con fechas (y no haya desajuste de hidratación).
 */
export interface AdminRouteRow {
  id: number
  originCode: string
  originName: string
  active: boolean
  probesPerMonth: number
  /** Pares por mes que estima Sabre (BFM); 0 = ruta sin estimador. */
  scanPerMonth: number
  /** De los estimados, cuántos por mes confirma el barrido con una sonda. */
  confirmPerMonth: number
  monthsAhead: number
  stayNights: number[]
  weekdays: number[]
  /** `freshnessLabel` de la observación con precio más nueva; null = nunca. */
  freshness: string | null
  /** Última sonda de cualquier estado en 24 h: distingue "sin datos" de "sin correr". */
  lastProbe: string | null
  /** `freshnessLabel` de la última estimación de Sabre; null = nunca. */
  estimateFreshness: string | null
  ok: number
  empty: number
  errors: number
  timeouts: number
  /** Ya formateado en el server ("US$ 1.234" o "—"): el cliente no hace ICU. */
  minPriceLabel: string
  /** Jobs `flights.sweep` de esta ruta en cola o corriendo. */
  pendingJobs: number
}

export interface AdminDestinationGroup {
  code: string
  name: string
  slug: string
  tcCode: string
  haul: 'short' | 'medium' | 'long'
  active: boolean
  iataDisplay: string | null
  seoTitle: string | null
  seoDescription: string | null
  heroImageUrl: string | null
  faq: Array<{ q: string; a: string }>
  sortOrder: number
  /** URL pública de la landing del destino. */
  landingUrl: string
  routes: AdminRouteRow[]
}

const HAUL_LABEL: Record<AdminDestinationGroup['haul'], string> = {
  short: 'corta distancia',
  medium: 'media distancia',
  long: 'larga distancia',
}

/** OK / vacías / errores / timeouts, con color sólo en lo que duele. */
function Health({ route }: { route: AdminRouteRow }) {
  const fallidas = route.errors + route.timeouts
  return (
    <span className="tabular-nums text-gray-600">
      <span className={route.ok > 0 ? 'font-semibold text-emerald-700' : undefined}>{route.ok}</span>
      {' / '}
      <span className={route.empty > 0 ? 'text-amber-700' : undefined}>{route.empty}</span>
      {' / '}
      <span className={route.errors > 0 ? 'text-red-600' : undefined}>{route.errors}</span>
      {' / '}
      <span className={route.timeouts > 0 ? 'text-red-600' : undefined}>{route.timeouts}</span>
      {fallidas > 0 && route.ok === 0 && <span className="ml-1 text-red-600">✗</span>}
    </span>
  )
}

/**
 * Rutas del barrido agrupadas por destino: qué está publicado, con cuántas
 * sondas, qué tan fresco está y cómo viene rindiendo.
 */
export function RoutesTable({ groups }: { groups: AdminDestinationGroup[] }) {
  const [destEditor, setDestEditor] = useState<{ mode: 'create' | 'edit'; values?: DestinationFormValues } | null>(null)
  const [routeEditor, setRouteEditor] = useState<{ mode: 'create' | 'edit'; destinationCode: string; destinationName: string; values?: RouteFormValues } | null>(null)
  const existingCodes = groups.map(g => g.code)

  const editDestination = (g: AdminDestinationGroup) =>
    setDestEditor({ mode: 'edit', values: { code: g.code, name: g.name, slug: g.slug, tc_code: g.tcCode, iata_display: g.iataDisplay, haul: g.haul, seo_title: g.seoTitle, seo_description: g.seoDescription, hero_image_url: g.heroImageUrl, faq: g.faq, active: g.active, sort_order: g.sortOrder } })
  const editRoute = (g: AdminDestinationGroup, r: AdminRouteRow) =>
    setRouteEditor({ mode: 'edit', destinationCode: g.code, destinationName: g.name, values: { id: r.id, origin_tc_code: r.originCode, origin_name: r.originName, stay_nights: r.stayNights, weekdays: r.weekdays, probes_per_month: r.probesPerMonth, months_ahead: r.monthsAhead, active: r.active } })

  return (
    <div className="divide-y divide-gray-200">
      {destEditor && <DestinationEditor mode={destEditor.mode} initial={destEditor.values} existingCodes={existingCodes} onClose={() => setDestEditor(null)} />}
      {routeEditor && <RouteEditor mode={routeEditor.mode} destinationCode={routeEditor.destinationCode} destinationName={routeEditor.destinationName} initial={routeEditor.values} onClose={() => setRouteEditor(null)} />}

      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-xs text-gray-500">{groups.length} destinos en la landing</p>
        <button type="button" onClick={() => setDestEditor({ mode: 'create' })} className="rounded-md bg-[#1A237E] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#283593]">
          Nuevo destino
        </button>
      </div>

      {groups.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">Todavía no hay destinos cargados en la landing.</p>}

      {groups.map(group => (
        <section key={group.code}>
          <header className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{group.name}</h3>
              <span className="text-xs text-gray-500">
                /{group.slug} · TC {group.tcCode} · {HAUL_LABEL[group.haul]}
              </span>
              {!group.active && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600">Sin publicar</span>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ActiveToggle
                url={`/api/vuelos-baratos/destinations/${group.code}`}
                active={group.active}
                label="Publicado"
                entity={group.name}
              />
              <a
                href={group.landingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-[#1A237E] underline-offset-2 hover:underline"
              >
                Ver landing
              </a>
              <ResolveCodeButton name={group.name} tcCode={group.tcCode} />
              <button type="button" onClick={() => editDestination(group)} className="text-xs font-medium text-[#1A237E] underline-offset-2 hover:underline">
                Editar
              </button>
              <button type="button" onClick={() => setRouteEditor({ mode: 'create', destinationCode: group.code, destinationName: group.name })} className="text-xs font-medium text-[#1A237E] underline-offset-2 hover:underline">
                Nueva ruta
              </button>
              <DeleteButton
                url={`/api/vuelos-baratos/destinations/${group.code}`}
                entity={group.name}
                description={`Se saca ${group.name} de vuelos.siviajo.com con sus ${group.routes.length} ruta(s). Las sondas ya guardadas quedan. El perfil de destino en Producto no se toca.`}
              />
            </div>
          </header>

          {group.routes.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500">Sin rutas de origen cargadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2 font-medium">Origen</th>
                    <th className="px-4 py-2 font-medium">Activa</th>
                    <th className="px-4 py-2 font-medium" title="Pares de fechas que estima Sabre por mes (0 = sin estimador)">
                      Sabre/mes
                    </th>
                    <th className="px-4 py-2 font-medium" title="De los estimados, cuántos confirma el barrido en siviajo.com">
                      Confirmar/mes
                    </th>
                    <th className="px-4 py-2 font-medium" title="Sondas por mes cuando la ruta no tiene estimaciones vigentes">
                      Sondas/mes
                    </th>
                    <th className="px-4 py-2 font-medium">Estadías</th>
                    <th className="px-4 py-2 font-medium">Última estimación</th>
                    <th className="px-4 py-2 font-medium">Última observación</th>
                    <th className="px-4 py-2 font-medium" title="Sondas de las últimas 24 h por estado">
                      OK / vacías / errores / timeouts 24 h
                    </th>
                    <th className="px-4 py-2 font-medium" title="El precio por pasajero más bajo de las observaciones vigentes">
                      Mínimo 48 h
                    </th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {group.routes.map(route => (
                    <tr key={route.id} className={route.active ? undefined : 'bg-gray-50/60 text-gray-500'}>
                      <td className="px-4 py-2">
                        <span className="text-gray-900">{route.originName}</span>{' '}
                        <span className="text-xs text-gray-500">{route.originCode}</span>
                      </td>
                      <td className="px-4 py-2">
                        <ActiveToggle
                          url={`/api/vuelos-baratos/routes/${route.id}`}
                          active={route.active}
                          label="Activa"
                          entity={`${route.originCode}→${group.code}`}
                          confirmActivation={{ probesPerMonth: route.probesPerMonth, monthsAhead: route.monthsAhead }}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <RouteNumberInput
                          routeId={route.id}
                          field="scan_per_month"
                          value={route.scanPerMonth}
                          min={0}
                          max={62}
                          label="Estimaciones de Sabre por mes"
                          entity={`${route.originCode}→${group.code}`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <RouteNumberInput
                          routeId={route.id}
                          field="confirm_per_month"
                          value={route.confirmPerMonth}
                          min={1}
                          max={31}
                          label="Confirmaciones por mes"
                          entity={`${route.originCode}→${group.code}`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <RouteNumberInput
                          routeId={route.id}
                          field="probes_per_month"
                          value={route.probesPerMonth}
                          min={1}
                          max={31}
                          label="Sondas por mes"
                          entity={`${route.originCode}→${group.code}`}
                        />
                      </td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{route.stayNights.join('/')}</td>
                      <td className="px-4 py-2">
                        {route.estimateFreshness ? (
                          <span className="text-gray-700">{route.estimateFreshness}</span>
                        ) : (
                          <span className="text-gray-400">nunca</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {route.freshness ? (
                          <span className="text-gray-700">{route.freshness}</span>
                        ) : (
                          <span className="text-gray-400">nunca</span>
                        )}
                        {!route.freshness && route.lastProbe && (
                          <span className="block text-[11px] text-amber-700">sondada {route.lastProbe}, sin precio</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Health route={route} />
                      </td>
                      <td className="px-4 py-2 font-medium tabular-nums text-gray-900">{route.minPriceLabel}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <EstimateNowButton slug={group.slug} origin={route.originCode} scanPerMonth={route.scanPerMonth} />
                          <SweepNowButton slug={group.slug} origin={route.originCode} pendingJobs={route.pendingJobs} />
                          <button type="button" onClick={() => editRoute(group, route)} className="text-xs font-medium text-[#1A237E] underline-offset-2 hover:underline">
                            Editar
                          </button>
                          <DeleteButton
                            url={`/api/vuelos-baratos/routes/${route.id}`}
                            entity={`${route.originCode}→${group.code}`}
                            description="La ruta sale del barrido nocturno. Las sondas ya guardadas quedan, sin ruta."
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
