import Link from 'next/link'
import { filtersWithout, hasActiveFilters } from '@/lib/vuelos-baratos/filters'
import type { ExplorerFilters } from '@/lib/vuelos-baratos/types'
import { CARD, withFilters } from './ui'

/** Todo lo que se puede filtrar; el mes se maneja aparte con la tira de chips. */
const CLAVES = [
  'stops',
  'direct',
  'stayMin',
  'stayMax',
  'departFrom',
  'departTo',
  'returnFrom',
  'returnTo',
  'departDow',
  'returnDow',
  'priceMin',
  'priceMax',
  'airlines',
] as const

export interface FilterSidebarSlotProps {
  filters: ExplorerFilters
  priceLimits: { min: number; max: number } | null
  airlines: Array<{ airline: string; code: string | null; minPrice: number; count: number }>
  /** Base de los links; puede traer `?from=` (ver `withFilters`). */
  basePath: string
}

/**
 * Punto de enganche de la barra de filtros (Tarea 5b).
 *
 * Sólo muestra "Quitar filtros" cuando hay alguno puesto: sin eso la columna
 * sería una caja vacía que ocupa 280 px al pedo.
 */
export function FilterSidebarSlot({ filters, priceLimits, airlines, basePath }: FilterSidebarSlotProps) {
  const activos = hasActiveFilters(filters)

  return (
    <aside
      data-slot="filter-sidebar"
      data-airlines={airlines.length}
      data-price-min={priceLimits?.min ?? ''}
      data-price-max={priceLimits?.max ?? ''}
      className={`${CARD} px-4 py-4`}
    >
      <p className="text-sm font-semibold text-[#1A237E]">Filtros</p>
      {activos ? (
        <Link
          href={withFilters(basePath, filtersWithout(filters, ...CLAVES))}
          scroll={false}
          className="mt-3 inline-block text-sm font-semibold text-[#1A237E] underline"
        >
          Quitar filtros
        </Link>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-[#6C757D]">
          Muy pronto vas a poder filtrar por escalas, estadía, precio y aerolínea.
        </p>
      )}
    </aside>
  )
}
