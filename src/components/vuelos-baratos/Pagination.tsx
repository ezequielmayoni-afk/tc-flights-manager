import Link from 'next/link'
import { filtersWith } from '@/lib/vuelos-baratos/filters'
import type { ExplorerFilters } from '@/lib/vuelos-baratos/types'
import { withFilters } from './ui'

const BASE = 'rounded-[4px] border px-3 py-1.5 text-xs font-semibold transition'
const ACTIVO = 'border-[#1A237E] bg-[#1A237E] text-white'
const INACTIVO = 'border-[#E3E3E3] text-[#495057] hover:border-[#1A237E]'
const APAGADO = 'rounded-[4px] border border-[#E3E3E3] px-3 py-1.5 text-xs font-semibold text-[#B2B2B2]'

/** Primera, última y una ventana de ±1 alrededor de la actual; el resto, '…'. */
function ventana(page: number, pages: number): Array<number | null> {
  const visibles = new Set<number>([1, pages, page - 1, page, page + 1])
  const ordenadas = [...visibles].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b)
  const salida: Array<number | null> = []
  for (const n of ordenadas) {
    const previa = salida[salida.length - 1]
    if (typeof previa === 'number' && n - previa > 1) salida.push(null)
    salida.push(n)
  }
  return salida
}

export function Pagination({
  page,
  pages,
  filters,
  basePath,
}: {
  page: number
  pages: number
  filters: ExplorerFilters
  basePath: string
}) {
  if (pages <= 1) return null
  const href = (n: number): string => withFilters(basePath, filtersWith(filters, { page: n }))

  return (
    <nav aria-label="Paginado" className="flex flex-wrap items-center gap-2 px-4 py-3">
      {page > 1 ? (
        <Link href={href(page - 1)} scroll={false} className={`${BASE} ${INACTIVO}`} rel="prev">
          Anterior
        </Link>
      ) : (
        <span className={APAGADO}>Anterior</span>
      )}
      {ventana(page, pages).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-[#6C757D]">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            scroll={false}
            aria-current={n === page ? 'page' : undefined}
            className={`${BASE} ${n === page ? ACTIVO : INACTIVO}`}
          >
            {n}
          </Link>
        )
      )}
      {page < pages ? (
        <Link href={href(page + 1)} scroll={false} className={`${BASE} ${INACTIVO}`} rel="next">
          Siguiente
        </Link>
      ) : (
        <span className={APAGADO}>Siguiente</span>
      )}
    </nav>
  )
}
