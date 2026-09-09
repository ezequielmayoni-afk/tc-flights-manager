import { TC_CITIES, type TcCity } from './data/tc-cities'
import { normalize } from './text'

/**
 * Búsqueda de ciudades de Travel Compositor para el autocomplete del buscador.
 *
 * Es pura y del lado del servidor: importa el dataset de 2.044 filas, así que
 * sólo la puede usar la API (`/api/vuelos-baratos/cities`) o un server
 * component. El Combobox del navegador consulta la API, nunca este módulo.
 */

/** Cuántos caracteres hacen falta para que la búsqueda tenga sentido. */
export const MIN_QUERY_LENGTH = 2

export interface CityHit {
  /** Código de DESTINO de Travel Compositor (no es el IATA del aeropuerto). */
  code: string
  name: string
  country: string
  /** 'Miami FL, Estados Unidos': lo que se muestra en la lista. */
  label: string
}

function toHit(city: TcCity): CityHit {
  return { code: city.code, name: city.name, country: city.country, label: `${city.name}, ${city.country}` }
}

/** Índice normalizado, armado una sola vez por proceso. */
interface Indexada {
  city: TcCity
  name: string
  code: string
}

let indice: Indexada[] | null = null

function getIndice(): Indexada[] {
  indice ??= TC_CITIES.map((city) => ({ city, name: normalize(city.name), code: city.code.toLowerCase() }))
  return indice
}

/**
 * Ciudades que matchean `q`, ordenadas: primero las que empiezan con lo
 * escrito, después las que lo contienen y al final el código exacto (escribir
 * 'mia' tiene que dar Miami, no una ciudad cuyo código sea MIA de casualidad).
 */
export function searchCities(q: string, limit = 10): CityHit[] {
  const query = normalize(q ?? '')
  if (query.length < MIN_QUERY_LENGTH) return []

  const buckets: Indexada[][] = [[], [], []]
  for (const item of getIndice()) {
    if (item.name.startsWith(query)) buckets[0].push(item)
    else if (item.name.includes(query)) buckets[1].push(item)
    else if (item.code === query) buckets[2].push(item)
  }

  return buckets
    .flatMap((bucket) => bucket.sort((a, b) => a.name.localeCompare(b.name, 'es')))
    .slice(0, Math.max(0, limit))
    .map((item) => toHit(item.city))
}

/** La ciudad de un código exacto ('CRD' → Cordoba). */
export function findCity(code: string | null | undefined): CityHit | null {
  if (!code) return null
  const buscado = code.trim().toUpperCase()
  const city = TC_CITIES.find((c) => c.code === buscado)
  return city ? toHit(city) : null
}
