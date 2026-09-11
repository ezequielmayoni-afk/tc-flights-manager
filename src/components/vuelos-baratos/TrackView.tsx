'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { DEFAULT_ORIGIN } from '@/lib/vuelos-baratos/config'
import { track } from '@/lib/vuelos-baratos/track-client'

/**
 * Los eventos de la página de destino. No pinta nada.
 *
 * La página es un server component y se vuelve a renderizar entera con cada
 * cambio de filtro (son links, no estado), así que la interacción se mide
 * mirando la URL: el explorador de fechas no tiene otra señal de que el
 * visitante está buscando en serio.
 */

export interface TrackViewProps {
  slug: string
  /** `tc_code` del destino: es lo que identifica la ruta en Meta. */
  destination: string
  destinationName: string
  /** Código de la ciudad de salida. */
  origin: string
  /** El más barato confirmado de la ruta; null si la página salió vacía. */
  minPrice: number | null
}

/** Claves de la URL que cambiaron entre dos búsquedas. */
function clavesCambiadas(antes: URLSearchParams, ahora: URLSearchParams): string[] {
  const claves = new Set([...antes.keys(), ...ahora.keys()])
  return [...claves].filter(clave => antes.get(clave) !== ahora.get(clave)).sort()
}

export function TrackView({ slug, destination, destinationName, origin, minPrice }: TrackViewProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  // La vista se cuenta una vez por ruta (destino + ciudad de salida): un
  // cambio de mes o de filtro es interacción, no una visita nueva.
  React.useEffect(() => {
    track('view_destination', {
      slug,
      destination,
      destination_name: destinationName,
      origin,
      min_price: minPrice,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el resto de los datos son constantes de la ruta; volver a disparar por un precio nuevo contaría dos veces la misma vista.
  }, [slug, origin])

  const ultima = React.useRef<{ pathname: string; query: string } | null>(null)

  React.useEffect(() => {
    const previa = ultima.current
    ultima.current = { pathname, query }
    // Primer render (la vista ya la contó el effect de arriba) o cambio de
    // página: no hay interacción que medir.
    if (!previa || previa.pathname !== pathname || previa.query === query) return

    const antes = new URLSearchParams(previa.query)
    const ahora = new URLSearchParams(query)
    const cambiadas = clavesCambiadas(antes, ahora)
    if (cambiadas.length === 0) return

    // Un solo evento por cambio de URL, con la señal más fuerte primero: el
    // mes es la decisión de viaje, el origen es otra ruta y el resto es
    // ajuste fino de la grilla.
    if (cambiadas.includes('m')) {
      track('select_month', { slug, origin, month: ahora.get('m') ?? 'all' })
      return
    }
    if (cambiadas.includes('from')) {
      track('change_origin', { slug, origin: ahora.get('from') ?? DEFAULT_ORIGIN })
      return
    }
    track('filter_change', {
      slug,
      origin,
      changed: cambiadas.join(','),
      ...Object.fromEntries(cambiadas.map(clave => [clave, ahora.get(clave)])),
    })
  }, [pathname, query, slug, origin])

  return null
}
