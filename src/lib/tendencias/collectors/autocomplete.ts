import { CANONICAL_SLUGS, getAllDestinations, slugify } from '../config'
import type { CollectorResult, DestinationSignal } from '../types'

/**
 * Google Autocomplete: motor de descubrimiento (gratis, sin clave).
 *
 * En vez de consultar una lista fija, le preguntamos a Google qué están
 * escribiendo los argentinos ahora. Un destino que aparece en muchas
 * consultas distintas ("viaje a X", "paquete X", "X todo incluido") tiene
 * demanda real. El más mencionado normaliza a 100.
 */

const AUTOCOMPLETE_URL = 'https://suggestqueries.google.com/complete/search'
const REQUEST_TIMEOUT_MS = 10_000
const DELAY_BETWEEN_REQUESTS_MS = 200

export const DISCOVERY_SEEDS = [
  'viaje a ', 'paquete a ', 'vacaciones en ', 'vuelos a ', 'vuelos baratos a ',
  'paquete todo incluido ', 'todo incluido ', 'all inclusive ', 'paquete turístico ', 'viaje barato a ',
  'vacaciones julio ', 'vacaciones invierno ', 'vacaciones verano ', 'viaje semana santa ', 'escapada fin de semana ',
  'luna de miel ', 'viaje de egresados ', 'viaje en grupo ', 'crucero ', 'viaje de 15 a ',
  'viaje al caribe ', 'viaje a europa ', 'viaje a brasil ', 'playas ', 'ski argentina ',
]

/**
 * Semillas que esperan un lugar a continuación. Un destino descubierto sólo
 * cuenta si apareció al menos una vez detrás de una de estas (o si es una
 * semilla conocida): así "personas", "familia" o "la escuela" —que salen de
 * "viaje en grupo", "vacaciones" o "viaje de egresados"— no entran.
 */
export const PLACE_SEEDS = new Set([
  'viaje a', 'paquete a', 'vacaciones en', 'vuelos a', 'vuelos baratos a', 'viaje barato a',
])

const STOPWORDS = new Set([
  'viaje', 'viajes', 'paquete', 'paquetes', 'vacaciones', 'vuelos', 'vuelo',
  'baratos', 'barato', 'todo', 'incluido', 'inclusive', 'turístico', 'turistico',
  'desde', 'buenos', 'aires', 'argentina', 'para', 'con', 'sin', 'mas', 'más',
  'mejor', 'mejores', 'económico', 'economico', 'precio', 'precios',
  'escapada', 'luna', 'miel', 'egresados', 'grupo', 'grupos', 'crucero',
  'semana', 'santa', 'fin', 'invierno', 'verano', 'julio', 'agosto',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'septiembre',
  'octubre', 'noviembre', 'diciembre', '2025', '2026', '2027',
  'que', 'como', 'donde', 'cuando', 'cual', 'por',
  'del', 'los', 'las', 'una', 'uno',
  'all', 'ski', 'playas', 'cerca', 'hotel', 'hoteles', 'resort',
  // Modificadores que no son lugares
  'personas', 'persona', 'familia', 'familias', 'niños', 'ninos', 'chicos', 'bebes', 'bebés', 'adultos', 'mayores',
  'jubilados', 'estudiantes', 'escuela', 'colegio', 'secundaria', 'amigos', 'pareja', 'parejas', 'novios',
  'largo', 'corto', 'claro', 'promo', 'promocion', 'promoción', 'oferta', 'ofertas', 'cuotas', 'pesos', 'dolares', 'dólares',
  'año', 'años', 'quince', 'xv', 'fiesta', 'fiestas', 'mundial', 'caba', 'capital', 'ezeiza', 'aeroparque',
  'hoy', 'ahora', 'ultimo', 'último', 'momento', 'dias', 'días', 'noches', 'noche', 'ingles', 'inglés', 'idioma',
])

export interface Discovered {
  name: string
  slug: string
  mentions: number
  /** Menciones detrás de una semilla de lugar ("viaje a", "vuelos a"…). */
  placeMentions: number
  queries: string[]
  seedTypes: Set<string>
}

/**
 * Google responde con charset ISO-8859-1 para client=chrome: hay que
 * decodificar con el charset del header o "España" llega como "Espa�a".
 */
async function getSuggestions(prefix: string): Promise<string[]> {
  const url = new URL(AUTOCOMPLETE_URL)
  url.searchParams.set('client', 'chrome')
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

/** Registra una sugerencia en el mapa de descubiertos. Puro. */
export function registerSuggestion(discovered: Map<string, Discovered>, suggestion: string, seed: string): void {
  const name = extractDestination(suggestion, seed)
  if (!name || name.length < 3) return
  const rawSlug = slugify(name)
  if (!rawSlug || rawSlug.length < 2) return
  const slug = CANONICAL_SLUGS[rawSlug] ?? rawSlug
  const seedType = seed.trim()
  const isPlaceSeed = PLACE_SEEDS.has(seedType)

  const existing = discovered.get(slug)
  if (existing) {
    existing.mentions++
    if (isPlaceSeed) existing.placeMentions++
    existing.seedTypes.add(seedType)
    if (existing.queries.length < 5) existing.queries.push(suggestion)
  } else {
    discovered.set(slug, { name: slug === rawSlug ? name : slug, slug, mentions: 1, placeMentions: isPlaceSeed ? 1 : 0, queries: [suggestion], seedTypes: new Set([seedType]) })
  }
}

/** Descarta lo que no es un lugar y normaliza: el más mencionado vale 100. Puro. */
export function finalizeDiscoveries(discovered: Map<string, Discovered>): Map<string, DestinationSignal> {
  const seedSlugs = new Set(getAllDestinations().map(d => d.slug))
  const seedNames = new Map(getAllDestinations().map(d => [d.slug, d.name]))
  const kept = [...discovered.values()].filter(d => d.placeMentions > 0 || seedSlugs.has(d.slug))
  const maxMentions = Math.max(...kept.map(d => d.mentions), 1)

  const destinations = new Map<string, DestinationSignal>()
  for (const dest of kept) {
    destinations.set(dest.slug, {
      rawScore: dest.mentions,
      normalizedScore: Math.round((dest.mentions / maxMentions) * 100),
      metadata: {
        name: seedNames.get(dest.slug) ?? dest.name,
        mentions: dest.mentions,
        placeMentions: dest.placeMentions,
        maxMentions,
        sampleQueries: dest.queries,
        seedTypesCount: dest.seedTypes.size,
        diversityScore: Math.round((dest.seedTypes.size / DISCOVERY_SEEDS.length) * 100),
      },
    })
  }
  return destinations
}

/** Palabras que unen un nombre compuesto: "Mar del Plata", "Rio de Janeiro". */
const CONNECTORS = new Set(['de', 'del', 'da', 'do', 'la', 'el', 'las', 'los', 'en', 'al', 'a'])
/** Conectores que también pueden abrir un nombre: "La Habana", "Las Vegas", "El Calafate". */
const LEADING_ARTICLES = new Set(['la', 'el', 'las', 'los'])

function isStop(word: string): boolean {
  return /^\d+$/.test(word) || word.length <= 1 || (STOPWORDS.has(word) && !CONNECTORS.has(word))
}

/**
 * "viaje a cancún todo incluido" → "Cancún"; "paquete a punta cana 2027" →
 * "Punta Cana"; "viaje a mar del plata" → "Mar del Plata".
 *
 * Toma la primera secuencia de palabras que no son stopwords, permitiendo
 * conectores adentro ("de", "del") sólo si sigue otra palabra válida. El
 * extractor original devolvía la frase entera ("Cancún Todo Incluido") y
 * repartía las menciones de un mismo destino entre varios slugs.
 */
export function extractDestination(suggestion: string, prefix: string): string | null {
  let cleaned = suggestion.toLowerCase()
  const prefixLower = prefix.toLowerCase().trim()
  if (cleaned.startsWith(prefixLower)) cleaned = cleaned.slice(prefixLower.length).trim()

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
  if (collected.length === 0) return null

  return collected
    .map(w => (CONNECTORS.has(w) && !LEADING_ARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

export async function collectAutocomplete(): Promise<CollectorResult> {
  const started = Date.now()
  const discovered = new Map<string, Discovered>()
  let queriesUsed = 0
  let failures = 0

  for (const seed of DISCOVERY_SEEDS) {
    try {
      const suggestions = await getSuggestions(seed)
      queriesUsed++
      for (const suggestion of suggestions) registerSuggestion(discovered, suggestion, seed)
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS))
    } catch (err) {
      failures++
      console.warn(`[tendencias/autocomplete] falló "${seed}": ${(err as Error).message}`)
    }
  }

  const destinations = finalizeDiscoveries(discovered)

  return {
    source: 'autocomplete',
    destinations,
    queriesUsed,
    durationMs: Date.now() - started,
    error: failures === DISCOVERY_SEEDS.length ? 'Todas las consultas a Autocomplete fallaron' : undefined,
  }
}
