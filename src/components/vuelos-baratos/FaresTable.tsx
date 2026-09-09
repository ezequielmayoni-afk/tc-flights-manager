import Link from 'next/link'
import { parseDate } from '@/lib/dates'
import { buildSiviajoFlightUrl, withUtm } from '@/lib/vuelos-baratos/deep-link'
import { filtersWith } from '@/lib/vuelos-baratos/filters'
import type { BestPair, ExplorerFilters, SortKey } from '@/lib/vuelos-baratos/types'
import { SelectFlightLink } from './SelectFlightLink'
import { formatUsd, withFilters } from './ui'

const ORDENES: Array<{ key: SortKey; label: string }> = [
  { key: 'price', label: 'Precio' },
  { key: 'depart', label: 'Ida' },
  { key: 'return', label: 'Vuelta' },
  { key: 'nights', label: 'Estadía' },
  { key: 'duration', label: 'Duración' },
  { key: 'stops', label: 'Escalas' },
  { key: 'airline', label: 'Aerolínea' },
]

/** 'mié. 02/12/2026'. Nunca `new Date('YYYY-MM-DD')`: ver `src/lib/dates.ts`. */
function fechaLarga(iso: string): string {
  const fecha = parseDate(iso)
  if (!fecha) return '—'
  const dia = fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace(/\.$/, '')
  return `${dia}. ${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

function duracion(minutos: number | null): string {
  if (minutos === null || minutos <= 0) return '—'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${resto} m`
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} m`
}

function escalas(stops: number | null): string {
  if (stops === null) return '—'
  if (stops === 0) return 'Directo'
  return stops === 1 ? '1 escala' : `${stops} escalas`
}

function estadia(nights: number): string {
  return nights === 1 ? '1 noche' : `${nights} noches`
}

/** ✓ incluido, — no incluido o sin dato (el `title` lo aclara). */
function equipaje(incluido: boolean | null, nombre: string): { simbolo: string; title: string } {
  if (incluido === null) return { simbolo: '—', title: `${nombre}: sin dato en esta tarifa` }
  return incluido ? { simbolo: '✓', title: `${nombre} incluido` } : { simbolo: '—', title: `${nombre} no incluido` }
}

/** El deep link puede fallar si la observación trae fechas raras: mejor sin botón que con una URL rota. */
function deepLink(pair: BestPair, originCode: string, destCode: string, slug: string): string | null {
  try {
    const url = buildSiviajoFlightUrl({
      originCode,
      destCode,
      departDate: pair.depart,
      returnDate: pair.return,
      adults: 1,
    })
    return withUtm(url, { campaign: slug, content: `${pair.depart}_${pair.return}` })
  } catch {
    return null
  }
}

function Equipaje({ pair }: { pair: BestPair }) {
  const carry = equipaje(pair.carryOn, 'Equipaje de mano')
  const valija = equipaje(pair.checkedBag, 'Valija despachada')
  return (
    <div className="text-xs text-[#495057]">
      {pair.fareFamily ? <p className="font-semibold text-[#393939]">{pair.fareFamily}</p> : null}
      <span className="mt-0.5 block whitespace-nowrap" title={carry.title}>
        Mano {carry.simbolo}
      </span>
      <span className="block whitespace-nowrap" title={valija.title}>
        Valija {valija.simbolo}
      </span>
    </div>
  )
}

export interface FaresTableProps {
  pairs: BestPair[]
  total: number
  filters: ExplorerFilters
  /** Base de los links de orden; puede traer `?from=` (ver `withFilters`). */
  basePath: string
  /** Código de destino de Travel Compositor de la ciudad de salida. */
  originCode: string
  /** Código de destino de Travel Compositor del destino. */
  destCode: string
  destinationSlug: string
}

/** El explorador de fechas: tabla en escritorio, tarjetas en mobile. */
export function FaresTable({ pairs, total, filters, basePath, originCode, destCode, destinationSlug }: FaresTableProps) {
  const filas = pairs.map(pair => ({ pair, href: deepLink(pair, originCode, destCode, destinationSlug) }))

  return (
    <div className="rounded-[8px] border border-[#E3E3E3] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#E3E3E3] px-4 py-3">
        <p className="text-sm font-semibold text-[#1A237E]">
          {total} {total === 1 ? 'combinación de fechas' : 'combinaciones de fechas'}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6C757D]">
          <span>Ordenar por</span>
          {ORDENES.map(orden => {
            const activo = filters.sort === orden.key
            const dir = activo && filters.dir === 'asc' ? 'desc' : 'asc'
            return (
              <Link
                key={orden.key}
                href={withFilters(basePath, filtersWith(filters, { sort: orden.key, dir }))}
                scroll={false}
                aria-current={activo ? 'true' : undefined}
                className={`rounded-[4px] border px-2 py-1 font-semibold transition ${
                  activo ? 'border-[#1A237E] text-[#1A237E]' : 'border-[#E3E3E3] text-[#495057] hover:border-[#1A237E]'
                }`}
              >
                {orden.label}
                {activo ? (filters.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </Link>
            )
          })}
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[#6C757D]">
          Ningún vuelo cumple con los filtros elegidos. Probá quitando alguno.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E3E3E3] bg-[#F8F9FA] text-left text-[10px] uppercase tracking-wide text-[#6C757D]">
                  <th className="px-2 py-2 font-semibold">Ida</th>
                  <th className="px-2 py-2 font-semibold">Vuelta</th>
                  <th className="px-2 py-2 font-semibold">Estadía</th>
                  <th className="px-2 py-2 font-semibold">Duración</th>
                  <th className="px-2 py-2 font-semibold">Escalas</th>
                  <th className="px-2 py-2 font-semibold">Aerolínea</th>
                  <th className="px-2 py-2 font-semibold">Precio</th>
                  <th className="px-2 py-2 font-semibold">Tarifa</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filas.map(({ pair, href }) => (
                  <tr key={`${pair.depart}|${pair.return}`} className="border-b border-[#E3E3E3] last:border-b-0">
                    <td className="whitespace-nowrap px-2 py-3 text-[#393939]">{fechaLarga(pair.depart)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-[#393939]">{fechaLarga(pair.return)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-[#495057]">{estadia(pair.nights)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-[#495057]">{duracion(pair.durationOutMin)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-[#495057]">{escalas(pair.stopsOut)}</td>
                    <td className="px-2 py-3 text-[#495057]">{pair.airline ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <span className="block text-sm font-bold tabular-nums text-[#1A237E]">{formatUsd(pair.pricePp)}</span>
                      <span className="block text-[10px] text-[#6C757D]">por persona</span>
                    </td>
                    <td className="px-2 py-3">
                      <Equipaje pair={pair} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      {href ? (
                        <SelectFlightLink
                          href={href}
                          origin={originCode}
                          destination={destinationSlug}
                          depart={pair.depart}
                          returnDate={pair.return}
                          nights={pair.nights}
                          pricePp={pair.pricePp}
                          airline={pair.airline}
                          compact
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[#E3E3E3] md:hidden">
            {filas.map(({ pair, href }) => (
              <li key={`${pair.depart}|${pair.return}`} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#393939]">{fechaLarga(pair.depart)}</p>
                    <p className="text-sm text-[#495057]">vuelve {fechaLarga(pair.return)}</p>
                    <p className="mt-1 text-xs text-[#6C757D]">
                      {estadia(pair.nights)} · {escalas(pair.stopsOut)} · {duracion(pair.durationOutMin)}
                    </p>
                    <p className="text-xs text-[#6C757D]">{pair.airline ?? 'Aerolínea sin dato'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-lg font-bold tabular-nums text-[#1A237E]">{formatUsd(pair.pricePp)}</span>
                    <span className="block text-xs text-[#6C757D]">por persona</span>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <Equipaje pair={pair} />
                  {href ? (
                    <SelectFlightLink
                      href={href}
                      origin={originCode}
                      destination={destinationSlug}
                      depart={pair.depart}
                      returnDate={pair.return}
                      nights={pair.nights}
                      pricePp={pair.pricePp}
                      airline={pair.airline}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
