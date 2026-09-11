'use client'

import { track } from '@/lib/vuelos-baratos/track-client'
import { BOTON_PRIMARIO, BOTON_PRIMARIO_SM } from './ui'

export interface SelectFlightLinkProps {
  /** Deep link ya armado (con UTM) del lado del servidor. */
  href: string
  /** Código de la ciudad de salida, para el `dataLayer`. */
  origin: string
  /** Slug del destino, para el `dataLayer`. */
  destination: string
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
