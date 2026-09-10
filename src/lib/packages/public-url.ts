/**
 * URLs públicas de siviajo.com. Puro y sin env: se usa desde componentes
 * cliente y desde el servidor.
 */

const SIVIAJO = 'https://www.siviajo.com'

/** La página pública de un paquete (idea) en siviajo.com: mismo formato que el sitemap. */
export function publicPackageUrl(tcPackageId: number, title?: string | null): string {
  const slug = (title ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug ? `${SIVIAJO}/es/idea/${tcPackageId}/${slug}` : `${SIVIAJO}/es/idea/${tcPackageId}`
}

/** Códigos de ciudad de Travel Compositor para los orígenes que usa HUB (IATA → TC). */
const ORIGIN_TC_CODE: Record<string, string> = { BUE: 'BUE', EZE: 'BUE', AEP: 'BUE', COR: 'CRD', ROS: 'RO6', MDZ: 'MEZ', SLA: 'SLT', TUC: 'TUC' }

export function originTcCode(origin: string): string {
  const key = origin.trim().toUpperCase()
  return ORIGIN_TC_CODE[key] ?? key
}

/** '2027-03-09' → '09/03/2027' (el buscador de siviajo.com espera dd/mm/aaaa literal). */
function padDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export interface PackageSearchUrlInput {
  origin: string
  /** Código de destino de Travel Compositor (PUJ, BAY, ROE…); sin él el buscador abre sin destino. */
  destinationTcCode?: string | null
  departDate?: string | null
  returnDate?: string | null
  adults: number
  childrenAges?: number[]
}

/**
 * Búsqueda de vuelo + hotel en siviajo.com prellenada, para corregir a mano
 * lo que cotizó una idea. Mismo formato que usa el cotizador-bot
 * (search/flighthotel.py) y la landing de vuelos baratos.
 */
export function siviajoPackageSearchUrl(input: PackageSearchUrlInput): string {
  const kids = input.childrenAges ?? []
  const distribution = `${Math.max(1, input.adults)}~~${kids.length}${kids.length ? `~~${kids.join(',')}` : ''}`
  const parts = [`${SIVIAJO}/home?latestSearch=true&tripType=FLIGHT_HOTEL&directSubmit=true`]
  if (input.departDate && /^\d{4}-\d{2}-\d{2}$/.test(input.departDate)) parts.push(`&departureDate=${padDate(input.departDate)}`)
  if (input.returnDate && /^\d{4}-\d{2}-\d{2}$/.test(input.returnDate)) parts.push(`&arrivalDate=${padDate(input.returnDate)}`)
  parts.push(`&distribution=${distribution}`)
  parts.push(`&departure=Destination::${originTcCode(input.origin)}`)
  if (input.destinationTcCode) parts.push(`&destination=Destination::${input.destinationTcCode.trim().toUpperCase()}`)
  parts.push('&roundTripFlight=true')
  return parts.join('')
}
