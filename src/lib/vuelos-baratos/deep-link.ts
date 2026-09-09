import { DEFAULT_ADULTS, siviajoBaseUrl } from './config'

/**
 * Deep links al buscador de siviajo.com.
 *
 * La URL se arma con template literal a propósito: el motor espera
 * `Destination::BUE` y `02/12/2026` literales, y `URLSearchParams` los
 * escaparía (`%3A`, `%2F`) rompiendo la búsqueda directa.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CODE_RE = /^[A-Z0-9-]{2,10}$/

/** '2026-01-05' → '05/01/2026'. */
export function padDate(date: string): string {
  if (!ISO_DATE.test(date)) throw new Error(`Fecha inválida (se espera YYYY-MM-DD): ${date}`)
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

/** Valida que la fecha exista de verdad (no un 2026-02-31). */
function assertFechaReal(date: string): void {
  padDate(date)
  const [year, month, day] = date.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`Fecha inexistente: ${date}`)
  }
}

/** '1~~0' sin menores; '2~~2~~5,9' con dos menores de 5 y 9 años. */
export function buildDistribution(adults: number, childrenAges: number[] = []): string {
  if (!Number.isInteger(adults) || adults < 1) throw new Error(`Cantidad de adultos inválida: ${adults}`)
  const base = `${adults}~~${childrenAges.length}`
  return childrenAges.length > 0 ? `${base}~~${childrenAges.join(',')}` : base
}

export interface SiviajoFlightUrlInput {
  originCode: string
  destCode: string
  departDate: string
  returnDate?: string | null
  adults?: number
  childrenAges?: number[]
}

/** La URL de búsqueda directa de vuelos en siviajo.com. */
export function buildSiviajoFlightUrl(input: SiviajoFlightUrlInput): string {
  const { originCode, destCode, departDate, returnDate, adults = DEFAULT_ADULTS, childrenAges = [] } = input
  if (!CODE_RE.test(originCode)) throw new Error(`Código de origen inválido: ${originCode}`)
  if (!CODE_RE.test(destCode)) throw new Error(`Código de destino inválido: ${destCode}`)
  assertFechaReal(departDate)
  if (returnDate) {
    assertFechaReal(returnDate)
    if (returnDate <= departDate) throw new Error(`La vuelta (${returnDate}) tiene que ser posterior a la ida (${departDate})`)
  }

  const ida = padDate(departDate)
  const vuelta = returnDate ? `&arrivalDate=${padDate(returnDate)}` : ''
  const distribution = buildDistribution(adults, childrenAges)

  return (
    `${siviajoBaseUrl()}/home?latestSearch=true&tripType=ONLY_FLIGHT&directSubmit=true` +
    `&departureDate=${ida}${vuelta}` +
    `&distribution=${distribution}` +
    `&departure=Destination::${originCode}&destination=Destination::${destCode}` +
    `&roundTripFlight=${returnDate ? 'true' : 'false'}`
  )
}

/** Agrega el UTM de la landing al deep link (siempre `utm_source=vuelos`). */
export function withUtm(url: string, params: { campaign: string; content?: string; medium?: string }): string {
  const sep = url.includes('?') ? '&' : '?'
  const partes = [
    'utm_source=vuelos',
    `utm_medium=${encodeURIComponent(params.medium ?? 'landing')}`,
    `utm_campaign=${encodeURIComponent(params.campaign)}`,
  ]
  if (params.content) partes.push(`utm_content=${encodeURIComponent(params.content)}`)
  return `${url}${sep}${partes.join('&')}`
}
