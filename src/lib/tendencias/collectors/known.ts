import { CANONICAL_SLUGS, getAllDestinations, slugify } from '../config'

/**
 * Destinos "conocidos" en una corrida: las semillas más lo que descubrió el
 * autocompletado de Google. Las fuentes que no descubren (YouTube, consultas
 * relacionadas, tendencias ahora) sólo puntúan destinos de este conjunto;
 * si no, "viaje a la luna" o "seguimiento de paquetes oca" entrarían al ranking.
 */
export interface KnownDestinations {
  /** slug canónico → nombre para mostrar */
  names: Map<string, string>
  /** slug (canónico o variante) → slug canónico */
  variants: Map<string, string>
}

const MIN_SINGLE_TOKEN_LENGTH = 4

export function buildKnown(discovered: Map<string, string> = new Map()): KnownDestinations {
  const names = new Map<string, string>()
  const variants = new Map<string, string>()
  for (const d of getAllDestinations()) {
    names.set(d.slug, d.name)
    variants.set(d.slug, d.slug)
  }
  for (const [slug, name] of discovered) {
    if (!names.has(slug)) names.set(slug, name)
    variants.set(slug, slug)
  }
  for (const [variant, canonical] of Object.entries(CANONICAL_SLUGS)) {
    if (names.has(canonical)) variants.set(variant, canonical)
  }
  return { names, variants }
}

/**
 * Busca un destino conocido dentro de un texto libre ("paquetes a
 * florianopolis 2026" → florianopolis). Compara por tokens del slug, así
 * "rio" no matchea "rio cuarto" y "salta" no matchea "saltar".
 */
const ORIGIN_PHRASES = [' desde ', ' cerca de ', ' saliendo de ', ' saliendo desde ', ' partiendo de ', ' a buenos aires desde ']

/** "vuelos a brasil desde córdoba" → "vuelos a brasil": lo que sigue a "desde" es el origen. */
export function stripOrigin(text: string): string {
  let t = ` ${text.toLowerCase()} `
  for (const phrase of ORIGIN_PHRASES) {
    const i = t.indexOf(phrase)
    if (i >= 0) t = t.slice(0, i + 1)
  }
  return t.trim()
}

export function matchKnownDestination(text: string, known: KnownDestinations): string | null {
  const tokens = slugify(stripOrigin(text)).split('-').filter(Boolean)
  if (tokens.length === 0) return null
  let best: { slug: string; length: number } | null = null

  for (const [variant, canonical] of known.variants) {
    const vt = variant.split('-')
    if (vt.length === 1 && vt[0].length < MIN_SINGLE_TOKEN_LENGTH) continue
    if (best && vt.length <= best.length) continue
    for (let i = 0; i + vt.length <= tokens.length; i++) {
      let ok = true
      for (let j = 0; j < vt.length; j++) if (tokens[i + j] !== vt[j]) { ok = false; break }
      if (ok) { best = { slug: canonical, length: vt.length }; break }
    }
  }
  return best?.slug ?? null
}
