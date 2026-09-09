'use client'

import { ActiveToggle } from './ActiveToggle'
import { ProbesPerMonthInput } from './ProbesPerMonthInput'
import { ResolveCodeButton } from './ResolveCodeButton'
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
  stayNights: number[]
  /** `freshnessLabel` de la observación con precio más nueva; null = nunca. */
  freshness: string | null
  /** Última sonda de cualquier estado en 24 h: distingue "sin datos" de "sin correr". */
  lastProbe: string | null
  ok: number
  empty: number
  errors: number
  timeouts: number
  minPrice: number | null
  currency: string | null
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
  /** URL pública de la landing del destino. */
  landingUrl: string
  routes: AdminRouteRow[]
}

const HAUL_LABEL: Record<AdminDestinationGroup['haul'], string> = {
  short: 'corta distancia',
  medium: 'media distancia',
  long: 'larga distancia',
}

function money(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  const monto = Math.round(value).toLocaleString('es-AR')
  return currency && currency !== 'USD' ? `${currency} ${monto}` : `US$ ${monto}`
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
  if (groups.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-500">Todavía no hay destinos cargados en la landing.</p>
  }

  return (
    <div className="divide-y divide-gray-200">
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
                    <th className="px-4 py-2 font-medium">Sondas/mes</th>
                    <th className="px-4 py-2 font-medium">Estadías</th>
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
                        />
                      </td>
                      <td className="px-4 py-2">
                        <ProbesPerMonthInput routeId={route.id} value={route.probesPerMonth} entity={`${route.originCode}→${group.code}`} />
                      </td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{route.stayNights.join('/')}</td>
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
                      <td className="px-4 py-2 font-medium tabular-nums text-gray-900">{money(route.minPrice, route.currency)}</td>
                      <td className="px-4 py-2 text-right">
                        <SweepNowButton slug={group.slug} origin={route.originCode} pendingJobs={route.pendingJobs} />
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
