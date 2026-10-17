import { COMPETITORS } from './config'
import { isOwnUrl } from './brand'

/**
 * Lectura de una página de resultados de Google (SerpAPI, engine `google`)
 * para una consulta: dónde aparece siviajo.com, si hay AI Overview y a quién
 * cita, cómo queda el pack local y qué preguntas relacionadas muestra.
 *
 * Funciones puras sobre el JSON de SerpAPI: no hay red acá.
 */

export interface SerpResultEntry {
  position: number
  title: string
  link: string
}

export interface SerpAioSource {
  source: string | null
  link: string | null
}

export interface SerpReading {
  /** Posición orgánica de la primera URL de siviajo.com (1 = primero), o null si no está en la página. */
  position: number | null
  url: string | null
  /** ¿Google mostró un AI Overview para esta consulta? */
  aiOverview: boolean
  /** ¿El AI Overview cita alguna URL de siviajo.com? */
  inAiOverview: boolean
  aiOverviewSources: SerpAioSource[]
  /** Posición en el pack local (1–3), o null. */
  localPackRank: number | null
  localPack: Array<{ title: string; rating: number | null; reviews: number | null }>
  paa: string[]
  top: SerpResultEntry[]
  /** Competidores con URL en el top 10 (nombres de `COMPETITORS`). */
  competitorsInTop: string[]
}

type Json = Record<string, unknown>

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function host(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export function competitorForUrl(url: string | null): string | null {
  const h = host(url)
  if (!h) return null
  for (const c of COMPETITORS) {
    if (c.domains.some(d => h === d || h.endsWith(`.${d}`))) return c.name
  }
  return null
}

/** Las fuentes del AI Overview: SerpAPI las trae en `references[]` (o `sources[]` según versión). */
function aioSources(aio: Json | undefined): SerpAioSource[] {
  if (!aio) return []
  const refs = (Array.isArray(aio.references) ? aio.references : Array.isArray(aio.sources) ? aio.sources : []) as Json[]
  return refs.map(r => ({ source: str(r.source) ?? str(r.title), link: str(r.link) })).filter(r => r.source || r.link)
}

/** Pack local: según la consulta viene como `local_results.places[]` o como `local_results[]`. */
function localPlaces(raw: Json): Json[] {
  const lr = raw.local_results
  if (Array.isArray(lr)) return lr as Json[]
  if (lr && typeof lr === 'object' && Array.isArray((lr as Json).places)) return (lr as Json).places as Json[]
  return []
}

const BRAND_PLACE = /\bs[ií]\s*,?\s*viajo\b/i

export function readSerp(raw: Json): SerpReading {
  const organic = (Array.isArray(raw.organic_results) ? raw.organic_results : []) as Json[]
  const top: SerpResultEntry[] = organic
    .map((r, i) => ({ position: num(r.position) ?? i + 1, title: str(r.title) ?? '', link: str(r.link) ?? '' }))
    .filter(r => r.link)

  const own = top.find(r => isOwnUrl(r.link)) ?? null

  const aio = raw.ai_overview && typeof raw.ai_overview === 'object' ? (raw.ai_overview as Json) : undefined
  const sources = aioSources(aio)

  const places = localPlaces(raw)
  const localPack = places.slice(0, 3).map(p => ({ title: str(p.title) ?? '', rating: num(p.rating), reviews: num(p.reviews) }))
  const localIdx = places.findIndex(p => BRAND_PLACE.test(str(p.title) ?? ''))

  const paa = ((Array.isArray(raw.related_questions) ? raw.related_questions : []) as Json[])
    .map(q => str(q.question))
    .filter((q): q is string => !!q)

  const competitorsInTop = [...new Set(top.slice(0, 10).map(r => competitorForUrl(r.link)).filter((c): c is string => !!c))]

  return {
    position: own?.position ?? null,
    url: own?.link ?? null,
    // SerpAPI devuelve el bloque aunque sólo traiga `page_token` (el contenido
    // se pide aparte): la presencia del bloque ya dice que hubo AI Overview.
    aiOverview: !!aio,
    inAiOverview: sources.some(s => isOwnUrl(s.link ?? '')),
    aiOverviewSources: sources,
    localPackRank: localIdx >= 0 ? localIdx + 1 : null,
    localPack,
    paa,
    top: top.slice(0, 10),
    competitorsInTop,
  }
}
