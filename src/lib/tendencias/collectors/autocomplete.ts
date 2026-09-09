import { CANONICAL_SLUGS, getAllDestinations, slugify } from '../config'
import type { CollectorResult, DestinationSignal } from '../types'
import type { KnownDestinations } from './known'

/**
 * Autocompletado de Google (web y YouTube): el motor de descubrimiento.
 *
 * Le preguntamos a Google qué completa para "viaje a ", "vuelos a ", etc. en
 * Argentina, y además expandimos las semillas principales letra por letra
 * ("vuelos a a", "vuelos a b"…): cada prefijo devuelve sus 10 búsquedas más
 * populares, así que con 3 semillas × 27 prefijos se descubren cientos de
 * destinos en vez de 30. Gratis, sin clave, sin tope.
 *
 * Cada sugerencia pesa según su posición (la primera 1,0; la décima 0,1):
 * Google las ordena por popularidad dentro del prefijo.
 */

const AUTOCOMPLETE_URL = 'https://suggestqueries.google.com/complete/search'
const REQUEST_TIMEOUT_MS = 10_000
const DELAY_BETWEEN_REQUESTS_MS = 150
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

/** Semillas que esperan un lugar a continuación. */
export const PLACE_SEEDS = new Set([
  'viaje a', 'viajes a', 'paquete a', 'paquetes a', 'vacaciones en', 'vuelos a', 'vuelos baratos a', 'viaje barato a',
  'vuelos desde buenos aires a', 'vuelos desde cordoba a', 'vuelos desde rosario a', 'vuelos desde mendoza a',
  'hoteles en', 'todo incluido en', 'vlog viaje a', 'que hacer en', 'guia de viaje', 'tips para viajar a',
])

/** Semillas de Google web. Las de lugar descubren; las otras suman menciones. */
export const WEB_SEEDS = [
  'viaje a ', 'viajes a ', 'paquete a ', 'paquetes a ', 'vacaciones en ', 'vuelos a ', 'vuelos baratos a ', 'viaje barato a ',
  'vuelos desde buenos aires a ', 'vuelos desde cordoba a ', 'vuelos desde rosario a ', 'vuelos desde mendoza a ',
  'hoteles en ', 'todo incluido en ',
  'paquete todo incluido ', 'todo incluido ', 'all inclusive ', 'paquete turístico ', 'ofertas de viajes ', 'promociones vuelos ',
  'vacaciones julio ', 'vacaciones invierno ', 'vacaciones verano ', 'viaje semana santa ', 'escapada fin de semana ',
  'luna de miel ', 'viaje de egresados ', 'viaje en grupo ', 'crucero ', 'viaje de 15 a ',
  'viaje al caribe ', 'viaje a europa ', 'viaje a brasil ', 'playas ', 'ski argentina ',
]
export const WEB_EXPAND_SEEDS = ['viaje a ', 'paquetes a ', 'vuelos a ']

/** Semillas de YouTube: inspiración, vlogs, guías. */
export const YOUTUBE_SEEDS = ['viaje a ', 'vlog viaje a ', 'vacaciones en ', 'que hacer en ', 'guia de viaje ', 'tips para viajar a ']
export const YOUTUBE_EXPAND_SEEDS = ['viaje a ', 'vlog viaje a ']

const STOPWORDS = new Set([
  'viaje', 'viajes', 'viajar', 'paquete', 'paquetes', 'vacaciones', 'vuelos', 'vuelo', 'vlog', 'vlogs', 'guia', 'guía', 'tips',
  'baratos', 'barato', 'todo', 'incluido', 'inclusive', 'turístico', 'turistico', 'turisticos', 'turísticos',
  'desde', 'buenos', 'aires', 'argentina', 'para', 'con', 'sin', 'mas', 'más', 'hacer', 'ver', 'visitar', 'ir', 'llegar',
  'mejor', 'mejores', 'económico', 'economico', 'economicos', 'precio', 'precios', 'costo', 'cuanto', 'cuánto', 'cuesta', 'sale',
  'escapada', 'escapadas', 'luna', 'miel', 'egresados', 'grupo', 'grupos', 'crucero', 'cruceros',
  'semana', 'santa', 'fin', 'invierno', 'verano', 'julio', 'agosto', 'temporada', 'feriado', 'feriados',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'septiembre', 'octubre', 'noviembre', 'diciembre', '2025', '2026', '2027',
  'que', 'qué', 'como', 'cómo', 'donde', 'dónde', 'cuando', 'cuándo', 'cual', 'cuál', 'por', 'del', 'los', 'las', 'una', 'uno',
  'all', 'ski', 'playas', 'cerca', 'hotel', 'hoteles', 'resort', 'resorts', 'airbnb', 'cabañas', 'cabanas',
  'personas', 'persona', 'familia', 'familias', 'niños', 'ninos', 'chicos', 'bebes', 'bebés', 'adultos', 'mayores',
  'jubilados', 'estudiantes', 'escuela', 'colegio', 'secundaria', 'amigos', 'pareja', 'parejas', 'novios', 'solo', 'sola',
  'largo', 'corto', 'claro', 'promo', 'promocion', 'promoción', 'promociones', 'oferta', 'ofertas', 'cuotas', 'pesos', 'dolares', 'dólares',
  'año', 'años', 'quince', 'xv', 'fiesta', 'fiestas', 'mundial', 'caba', 'capital', 'ezeiza', 'aeroparque',
  'hoy', 'ahora', 'ultimo', 'último', 'momento', 'dias', 'días', 'noches', 'noche', 'ingles', 'inglés', 'idioma', 'casa', 'auto',
  'avion', 'avión', 'micro', 'bus', 'colectivo', 'tren', 'barco', 'ferry', 'aeropuerto', 'mapa', 'clima', 'queda', 'sargazo', 'tiene',
  'requisitos', 'visa', 'moneda', 'fotos', 'imagenes', 'imágenes', 'opiniones', 'reseñas', 'ubicacion', 'ubicación', 'wikipedia',
  // Lugares de fantasía y no destinos que devuelve YouTube
  'estrellas', 'marte', 'centro', 'tierra', 'inesperado', 'desconocido', 'pasado', 'futuro', 'tiempo', 'infierno', 'cielo', 'espacio',
  // Marcas y agencias
  'despegar', 'almundo', 'avantrip', 'latam', 'aerolineas', 'aerolíneas', 'flybondi', 'jetsmart', 'arajet', 'msc', 'pezzati', 'ati', 'garbarino', 'turismo', 'city', 'oca',
])

/** Palabras que unen un nombre compuesto: "Mar del Plata", "Rio de Janeiro". */
const CONNECTORS = new Set(['de', 'del', 'da', 'do', 'la', 'el', 'las', 'los', 'en', 'al', 'a'])
/** Conectores que también pueden abrir un nombre: "La Habana", "Las Vegas", "El Calafate". */
const LEADING_ARTICLES = new Set(['la', 'el', 'las', 'los'])

function isStop(word: string): boolean {
  return /^\d+$/.test(word) || word.length <= 1 || (STOPWORDS.has(word) && !CONNECTORS.has(word))
}

/**
 * "viaje a cancún todo incluido" → "Cancún"; "paquete a punta cana 2027" →
 * "Punta Cana"; "viaje a mar del plata" → "Mar del Plata". Toma la primera
 * secuencia de palabras que no son stopwords, con conectores adentro sólo si
 * sigue otra palabra válida.
 */
export function extractDestination(suggestion: string, prefix: string): string | null {
  let cleaned = suggestion.toLowerCase()
  const prefixLower = prefix.toLowerCase().trim()
  if (prefixLower && cleaned.startsWith(prefixLower)) cleaned = cleaned.slice(prefixLower.length).trim()

  const words = cleaned.split(/\s+/).filter(Boolean)
  let i = 0
  while (i < words.length && (isStop(words[i]) || (CONNECTORS.has(words[i]) && !LEADING_ARTICLES.has(words[i])))) i++

  const collected: string[] = []
  while (i < words.length && collected.length < 4) {
    const word = words[i]
    if (CONNECTORS.has(word) && !(collected.length === 0 && LEADING_ARTICLES.has(word))) {
      const next = words[i + 1]
      if (collected.length === 0 || !next || isStop(next) || CONNECTORS.has(next)) break
      collected.push(word)
      i++
      continue
    }
    if (isStop(word)) break
    collected.push(word)
    i++
  }
  // Sólo artículos o conectores ("viaje a las estrellas" → "Las") no es un lugar.
  if (collected.length === 0 || collected.every(w => CONNECTORS.has(w))) return null

  return collected
    .map(w => (CONNECTORS.has(w) && !LEADING_ARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const SEED_SLUGS = getAllDestinations().map(d => d.slug).filter(slug => slug.length >= 4).sort((a, b) => b.length - a.length)

/**
 * Lleva un slug a su forma canónica: variantes conocidas (curazao → curacao)
 * y nombres con cola ("bayahibe-republica-dominicana", "rio-de-janeiro-brasil")
 * que empiezan con un destino semilla. Puro.
 */
export function canonicalizeSlug(rawSlug: string): string {
  const direct = CANONICAL_SLUGS[rawSlug]
  if (direct) return direct
  for (const seed of SEED_SLUGS) {
    if (rawSlug === seed) return seed
    if (rawSlug.startsWith(`${seed}-`)) return seed
  }
  return rawSlug
}

/**
 * Una letra "saturada" es la que Google llena con dos o tres destinos
 * gigantes ("paquetes a b" → Brasil, Bariloche, Búzios): lo que queda atrás
 * (Bayahibe, Bahía) no tiene lugar. Puro.
 */
export function isCrowded(slugs: string[]): boolean {
  if (slugs.length < 8) return false
  const counts = new Map<string, number>()
  for (const s of slugs) counts.set(s, (counts.get(s) ?? 0) + 1)
  const top2 = [...counts.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0)
  return top2 / slugs.length >= 0.7
}

const VOWELS = ['a', 'e', 'i', 'o', 'u']

export interface Discovered {
  name: string
  slug: string
  /** Sugerencias distintas en las que apareció. */
  mentions: number
  /** Suma de pesos por posición. */
  weight: number
  /** Menciones detrás de una semilla de lugar ("viaje a", "vuelos a"…). */
  placeMentions: number
  queries: string[]
  seedTypes: Set<string>
}

/**
 * Google responde con charset ISO-8859-1 para algunos clientes: hay que
 * decodificar con el charset del header o "España" llega como "Espa�a".
 */
async function getSuggestions(prefix: string, ds?: 'yt'): Promise<string[]> {
  const url = new URL(AUTOCOMPLETE_URL)
  url.searchParams.set('client', 'firefox')
  if (ds) url.searchParams.set('ds', ds)
  url.searchParams.set('hl', 'es-419')
  url.searchParams.set('gl', 'ar')
  url.searchParams.set('q', prefix)
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) return []
  const charset = /charset=([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ?? 'utf-8'
  const text = new TextDecoder(charset).decode(await response.arrayBuffer())
  const data = JSON.parse(text) as unknown[]
  return Array.isArray(data[1]) ? (data[1] as string[]) : []
}

/** Peso por posición: la primera sugerencia vale 1, la décima 0,1. */
export function positionWeight(position: number): number {
  return Math.max(0.1, (11 - Math.min(position, 10)) / 10)
}

/** Registra una sugerencia y devuelve el slug. `seedType` es la semilla base (sin la letra de expansión). Puro. */
export function registerSuggestion(discovered: Map<string, Discovered>, suggestion: string, prefix: string, seedType: string, position: number): string | null {
  void prefix // el prefijo puede llevar la letra de expansión: se recorta la semilla base
  const name = extractDestination(suggestion, seedType)
  if (!name || name.length < 3) return null
  const rawSlug = slugify(name)
  if (!rawSlug || rawSlug.length < 2) return null
  const slug = canonicalizeSlug(rawSlug)
  const isPlaceSeed = PLACE_SEEDS.has(seedType)
  const weight = positionWeight(position)

  const existing = discovered.get(slug)
  if (existing) {
    existing.mentions++
    existing.weight += weight
    if (isPlaceSeed) existing.placeMentions++
    existing.seedTypes.add(seedType)
    if (existing.queries.length < 6) existing.queries.push(suggestion)
  } else {
    discovered.set(slug, { name: slug === rawSlug ? name : slug, slug, mentions: 1, weight, placeMentions: isPlaceSeed ? 1 : 0, queries: [suggestion], seedTypes: new Set([seedType]) })
  }
  return slug
}

/**
 * Descarta lo que no es un lugar y normaliza (el de más peso vale 100).
 * La normalización es por raíz cuadrada: los diez lugares de cada prefijo
 * los copan dos o tres gigantes, así que las menciones crudas exageran la
 * distancia (Punta Cana 21 contra Bayahibe 2,8 cuando en Trends es 55 contra
 * 19). Con `known`, sólo pasan destinos ya conocidos: es el modo de YouTube,
 * que corrobora pero no descubre. Puro.
 */
export function finalizeDiscoveries(discovered: Map<string, Discovered>, known?: KnownDestinations): Map<string, DestinationSignal> {
  const seeds = getAllDestinations()
  const seedSlugs = new Set(seeds.map(d => d.slug))
  const seedNames = new Map(seeds.map(d => [d.slug, d.name]))
  const kept = [...discovered.values()].filter(d => known ? known.names.has(d.slug) : d.placeMentions > 0 || seedSlugs.has(d.slug))
  const maxWeight = Math.max(...kept.map(d => d.weight), 0.1)

  const destinations = new Map<string, DestinationSignal>()
  for (const dest of kept) {
    destinations.set(dest.slug, {
      rawScore: Math.round(dest.weight * 10) / 10,
      normalizedScore: Math.round(Math.sqrt(dest.weight / maxWeight) * 100),
      metadata: {
        name: seedNames.get(dest.slug) ?? known?.names.get(dest.slug) ?? dest.name,
        mentions: dest.mentions,
        weight: Math.round(dest.weight * 10) / 10,
        placeMentions: dest.placeMentions,
        sampleQueries: dest.queries,
        seedTypesCount: dest.seedTypes.size,
      },
    })
  }
  return destinations
}

export interface SuggestCollectorOptions {
  source: string
  seeds: string[]
  expandSeeds?: string[]
  ds?: 'yt'
  known?: KnownDestinations
  heartbeat?: () => Promise<void>
}

export interface SuggestCollectorResult extends CollectorResult {
  discovered: Map<string, Discovered>
}

export async function collectSuggestions(options: SuggestCollectorOptions): Promise<SuggestCollectorResult> {
  const started = Date.now()
  const discovered = new Map<string, Discovered>()
  const queue: Array<{ prefix: string; seedType: string; expandable: boolean }> = options.seeds.map(s => ({ prefix: s, seedType: s.trim(), expandable: false }))
  for (const seed of options.expandSeeds ?? []) {
    for (const letter of LETTERS) queue.push({ prefix: `${seed}${letter}`, seedType: seed.trim(), expandable: true })
  }
  let queriesUsed = 0
  let failures = 0
  let index = 0

  while (index < queue.length) {
    const { prefix, seedType, expandable } = queue[index]
    try {
      const suggestions = await getSuggestions(prefix, options.ds)
      queriesUsed++
      const slugs = suggestions.map((suggestion, i) => registerSuggestion(discovered, suggestion, prefix, seedType, i + 1)).filter((x): x is string => Boolean(x))
      // Letra saturada por dos gigantes: se baja un nivel ("paquetes a ba", "be", "bi"…).
      if (expandable && isCrowded(slugs)) {
        for (const vowel of VOWELS) queue.push({ prefix: `${prefix}${vowel}`, seedType, expandable: false })
      }
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS))
    } catch (err) {
      failures++
      console.warn(`[tendencias/${options.source}] falló "${prefix}": ${(err as Error).message}`)
    }
    index++
    if (index % 25 === 0) await options.heartbeat?.()
  }
  const prefixes = queue

  const destinations = finalizeDiscoveries(discovered, options.known)
  return {
    source: options.source,
    destinations,
    discovered,
    queriesUsed,
    durationMs: Date.now() - started,
    error: failures === prefixes.length ? `Todas las consultas de ${options.source} fallaron` : undefined,
  }
}

/** Google web: descubre destinos. */
export function collectAutocomplete(heartbeat?: () => Promise<void>): Promise<SuggestCollectorResult> {
  return collectSuggestions({ source: 'autocomplete', seeds: WEB_SEEDS, expandSeeds: WEB_EXPAND_SEEDS, heartbeat })
}

/** YouTube: corrobora destinos conocidos con lo que la gente mira. */
export function collectYoutube(known: KnownDestinations, heartbeat?: () => Promise<void>): Promise<SuggestCollectorResult> {
  return collectSuggestions({ source: 'youtube', seeds: YOUTUBE_SEEDS, expandSeeds: YOUTUBE_EXPAND_SEEDS, ds: 'yt', known, heartbeat })
}
