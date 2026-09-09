import Link from 'next/link'
import { DEFAULT_ORIGIN, type Origin } from '@/lib/vuelos-baratos/config'
import { serializeExplorerFilters } from '@/lib/vuelos-baratos/filters'
import type { ExplorerFilters } from '@/lib/vuelos-baratos/types'

/**
 * Chips de ciudad de salida de la página de destino.
 *
 * Cambiar de origen no debería perder el mes ni los filtros elegidos, así que
 * el link se arma con `?from=` más la query serializada de los filtros.
 */
export function OriginSelect({
  origins,
  active,
  path,
  filters,
}: {
  origins: Origin[]
  active: string
  path: string
  filters: ExplorerFilters
}) {
  const qs = serializeExplorerFilters(filters)

  return (
    <nav aria-label="Ciudad de salida" className="flex gap-2 overflow-x-auto pb-1">
      {origins.map(origin => {
        const activo = origin.code === active
        const partes = [origin.code === DEFAULT_ORIGIN ? '' : `from=${origin.code}`, qs].filter(Boolean)
        return (
          <Link
            key={origin.code}
            href={partes.length > 0 ? `${path}?${partes.join('&')}` : path}
            aria-current={activo ? 'page' : undefined}
            className={`shrink-0 rounded-[4px] border px-3 py-1.5 text-xs font-semibold transition ${
              activo ? 'border-[#1A237E] text-[#1A237E]' : 'border-[#E3E3E3] text-[#495057] hover:border-[#1A237E]'
            }`}
          >
            {origin.name}
          </Link>
        )
      })}
    </nav>
  )
}
