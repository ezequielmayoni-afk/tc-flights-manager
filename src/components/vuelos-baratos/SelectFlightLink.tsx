'use client'

import { track } from '@/lib/vuelos-baratos/track-client'
import { BOTON_PRIMARIO, BOTON_PRIMARIO_SM } from './ui'

export interface SelectFlightLinkProps {
  /** Deep link ya armado (con UTM) del lado del servidor. */
  href: string
  /** Código de destino de Travel Compositor de la ciudad de salida. */
  origin: string
  /**
   * Código de destino de Travel Compositor del destino (NO el slug).
   *
   * `origin`-`destination` es el `content_ids` con el que Meta une este evento
   * al `ViewContent` de la página y al `Search` del buscador: si acá viajara
   * el slug, el embudo quedaría partido en dos productos distintos.
   */
  destination: string
  /** Slug de la landing, sólo para los informes de GA4. */
  slug: string
  depart: string
  returnDate: string
  nights: number
  pricePp: number
  airline: string | null
  /** La tabla de escritorio usa la versión apretada del botón. */
  compact?: boolean
}

/**
 * El CTA de cada fila: abre la búsqueda en vivo en siviajo.com.
 *
 * Es cliente sólo por el `onClick` que avisa al tracking: si GTM está apagado
 * o bloqueado el click igual navega, `track` nunca lanza.
 */
export function SelectFlightLink({
  href,
  origin,
  destination,
  slug,
  depart,
  returnDate,
  nights,
  pricePp,
  airline,
  compact = false,
}: SelectFlightLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        track('select_flight', {
          origin,
          destination,
          slug,
          depart,
          return: returnDate,
          nights,
          price_pp: pricePp,
          airline,
          month: depart.slice(0, 7),
        })
      }
      className={compact ? BOTON_PRIMARIO_SM : BOTON_PRIMARIO}
    >
      Seleccionar
    </a>
  )
}
