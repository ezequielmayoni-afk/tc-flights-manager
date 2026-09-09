import Link from 'next/link'
import { monthShort } from '@/lib/vuelos-baratos/date-pairs'
import { filtersWith, filtersWithout } from '@/lib/vuelos-baratos/filters'
import type { ExplorerFilters, MonthSummary } from '@/lib/vuelos-baratos/types'
import { formatUsd, withFilters } from './ui'

const BASE = 'shrink-0 rounded-[100px] border px-4 py-2 text-center text-xs transition'
const ACTIVO = 'border-[#1A237E] bg-[#1A237E] text-white'
const INACTIVO = 'border-[#E3E3E3] text-[#495057] hover:border-[#1A237E]'

/** Tira de 12 meses con el precio más bajo de cada uno. En mobile scrollea. */
export function MonthChips({
  months,
  active,
  filters,
  basePath,
}: {
  months: MonthSummary[]
  active?: string
  filters: ExplorerFilters
  basePath: string
}) {
  return (
    <nav aria-label="Mes de salida" className="flex gap-2 overflow-x-auto pb-1">
      <Link
        href={withFilters(basePath, filtersWithout(filters, 'month'))}
        scroll={false}
        aria-current={active ? undefined : 'page'}
        className={`${BASE} ${active ? INACTIVO : ACTIVO}`}
      >
        <span className="block font-semibold">Todos</span>
        <span className="block">los meses</span>
      </Link>
      {months.map(mes => {
        const activo = mes.month === active
        return (
          <Link
            key={mes.month}
            href={withFilters(basePath, filtersWith(filters, { month: mes.month }))}
            scroll={false}
            aria-current={activo ? 'page' : undefined}
            className={`${BASE} ${activo ? ACTIVO : INACTIVO}`}
          >
            <span className="block font-semibold">{monthShort(mes.month)}</span>
            <span className="block tabular-nums">{mes.minPrice === null ? '—' : `desde ${formatUsd(mes.minPrice)}`}</span>
          </Link>
        )
      })}
    </nav>
  )
}
