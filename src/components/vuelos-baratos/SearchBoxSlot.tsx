import { siviajoBaseUrl } from '@/lib/vuelos-baratos/config'
import type { LandingDestinationRow } from '@/lib/vuelos-baratos/types'
import { BOTON_PRIMARIO, CARD } from './ui'

/**
 * Punto de enganche del buscador con autocomplete (Tarea 5b).
 *
 * Por ahora sólo manda al buscador de siviajo.com: la landing nunca deja al
 * visitante sin salida aunque todavía no haya buscador propio.
 */
export function SearchBoxSlot({ originCode, destination }: { originCode: string; destination?: LandingDestinationRow }) {
  return (
    <div
      data-slot="search-box"
      data-origin={originCode}
      data-destination={destination?.slug ?? ''}
      className={`${CARD} flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between`}
    >
      <p className="text-sm text-[#495057]">
        ¿Ya tenés fechas? Buscá {destination ? `vuelos a ${destination.name}` : 'tu vuelo'} en el buscador de siviajo.com.
      </p>
      <a
        href={`${siviajoBaseUrl()}/es/?tripType=ONLY_FLIGHT`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BOTON_PRIMARIO} shrink-0`}
      >
        Buscar mis fechas en siviajo.com
      </a>
    </div>
  )
}
