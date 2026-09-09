import Link from 'next/link'
import { DEFAULT_ORIGIN, type Origin } from '@/lib/vuelos-baratos/config'

/** Solapas de origen de la home. El origen por defecto va sin `?from=`. */
export function OriginTabs({ origins, active }: { origins: Origin[]; active: string }) {
  return (
    <nav aria-label="Ciudad de salida" className="flex gap-2 overflow-x-auto pb-1">
      {origins.map(origin => {
        const activo = origin.code === active
        return (
          <Link
            key={origin.code}
            href={origin.code === DEFAULT_ORIGIN ? '/vuelos-baratos' : `/vuelos-baratos?from=${origin.code}`}
            aria-current={activo ? 'page' : undefined}
            className={`shrink-0 rounded-[8px] border px-4 py-2 text-sm font-semibold transition ${
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
