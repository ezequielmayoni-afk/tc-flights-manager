import { serializeExplorerFilters } from '@/lib/vuelos-baratos/filters'
import type { ExplorerFilters } from '@/lib/vuelos-baratos/types'

/**
 * Piezas compartidas por los componentes de la landing pública.
 *
 * La identidad de siviajo.com no está en los tokens de `globals.css` (que son
 * los del dashboard), así que los colores van literales: blanco de fondo,
 * `#393939` de texto, `#1A237E` para títulos y `#1DE9B6` SOLO en la acción
 * principal. Nada de sombras: se separa con bordes y fondos.
 */

/** El botón "Seleccionar"/"Buscar": el único lugar donde va el turquesa. */
export const BOTON_PRIMARIO =
  'inline-flex items-center justify-center rounded-[8px] bg-[#1DE9B6] px-4 py-2 text-sm font-semibold text-[#1A237E] transition hover:brightness-95'

/** El mismo botón, apretado: la tabla de tarifas tiene nueve columnas. */
export const BOTON_PRIMARIO_SM =
  'inline-flex items-center justify-center whitespace-nowrap rounded-[8px] bg-[#1DE9B6] px-3 py-1.5 text-xs font-semibold text-[#1A237E] transition hover:brightness-95'

export const CARD = 'rounded-[8px] border border-[#E3E3E3] bg-white'

/**
 * Agrega los filtros a la URL base.
 *
 * `basePath` puede venir con query (la página le mete `?from=CRD` cuando el
 * origen no es el de por defecto), así que el separador se elige mirando la
 * base: así el origen elegido sobrevive a cualquier click de mes, orden o
 * paginado sin tener que pasarlo como prop por todo el árbol.
 */
export function withFilters(basePath: string, filters: ExplorerFilters): string {
  const qs = serializeExplorerFilters(filters)
  if (!qs) return basePath
  return `${basePath}${basePath.includes('?') ? '&' : '?'}${qs}`
}

/** 'US$ 722' (sin decimales: son precios de vidriera). */
export function formatUsd(price: number): string {
  return `US$ ${Math.round(price).toLocaleString('es-AR')}`
}
