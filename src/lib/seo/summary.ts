import { isBrandQuery } from './brand'
import { classifyPage, type PageType } from './page-types'

/**
 * Agregaciones puras para el tablero de posicionamiento (`/producto/seo`).
 * Reciben filas crudas de las tablas `gsc_*`, `serp_checks` y `geo_probes` y
 * devuelven lo que la pantalla muestra. Sin base ni red: se testean con
 * fixtures.
 */

export interface Totals {
  clicks: number
  impressions: number
  /** 0–1. */
  ctr: number
  /** Posición media ponderada por impresiones (como la calcula Google). */
  position: number
}

interface Metric {
  clicks: number
  impressions: number
  position: number
}

export function totals(rows: Metric[]): Totals {
  let clicks = 0
  let impressions = 0
  let posWeighted = 0
  for (const r of rows) {
    clicks += r.clicks
    impressions += r.impressions
    posWeighted += r.position * r.impressions
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posWeighted / impressions : 0,
  }
}

export interface QueryStat extends Metric {
  query: string
}

export interface BrandSplit {
  brand: Totals & { queries: number }
  nonBrand: Totals & { queries: number }
}

/** Marca vs. no-marca sobre filas por consulta (ya sumadas por consulta). */
export function splitBrand(rows: QueryStat[]): BrandSplit {
  const brand = rows.filter(r => isBrandQuery(r.query))
  const nonBrand = rows.filter(r => !isBrandQuery(r.query))
  return {
    brand: { ...totals(brand), queries: brand.length },
    nonBrand: { ...totals(nonBrand), queries: nonBrand.length },
  }
}

/** Suma filas (date, query) en una por consulta. */
export function sumByQuery(rows: Array<QueryStat & { date?: string }>): QueryStat[] {
  const map = new Map<string, { clicks: number; impressions: number; posWeighted: number }>()
  for (const r of rows) {
    const acc = map.get(r.query) ?? { clicks: 0, impressions: 0, posWeighted: 0 }
    acc.clicks += r.clicks
    acc.impressions += r.impressions
    acc.posWeighted += r.position * r.impressions
    map.set(r.query, acc)
  }
  return [...map.entries()].map(([query, a]) => ({
    query,
    clicks: a.clicks,
    impressions: a.impressions,
    position: a.impressions > 0 ? a.posWeighted / a.impressions : 0,
  }))
}

export interface PageStat extends Metric {
  page: string
}

/** Suma filas (date, page) en una por página. */
export function sumByPage(rows: Array<PageStat & { date?: string }>): PageStat[] {
  const map = new Map<string, { clicks: number; impressions: number; posWeighted: number }>()
  for (const r of rows) {
    const acc = map.get(r.page) ?? { clicks: 0, impressions: 0, posWeighted: 0 }
    acc.clicks += r.clicks
    acc.impressions += r.impressions
    acc.posWeighted += r.position * r.impressions
    map.set(r.page, acc)
  }
  return [...map.entries()].map(([page, a]) => ({
    page,
    clicks: a.clicks,
    impressions: a.impressions,
    position: a.impressions > 0 ? a.posWeighted / a.impressions : 0,
  }))
}

export interface PageTypeStat extends Totals {
  type: PageType
  pages: number
}

/** Clics e impresiones por plantilla (home, fichas, temáticas, blog…), de más a menos clics. */
export function byPageType(pages: PageStat[]): PageTypeStat[] {
  const groups = new Map<PageType, PageStat[]>()
  for (const p of pages) {
    const t = classifyPage(p.page)
    const list = groups.get(t) ?? []
    list.push(p)
    groups.set(t, list)
  }
  return [...groups.entries()]
    .map(([type, list]) => ({ type, pages: list.length, ...totals(list) }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
}

export interface OpportunityOptions {
  minImpressions?: number
  minPosition?: number
  maxPosition?: number
  limit?: number
}

/**
 * Consultas no-marca con muchas impresiones y posición entre 4 y 15: la
 * página ya existe y Google ya la considera; con título, contenido y enlaces
 * internos puede subir al top 3, que es donde están los clics.
 */
export function opportunities(rows: QueryStat[], opts: OpportunityOptions = {}): QueryStat[] {
  const { minImpressions = 150, minPosition = 3.5, maxPosition = 15, limit = 30 } = opts
  return rows
    .filter(r => !isBrandQuery(r.query) && r.impressions >= minImpressions && r.position >= minPosition && r.position <= maxPosition)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
}

/** Top de consultas no-marca por clics. */
export function topNonBrand(rows: QueryStat[], limit = 30): QueryStat[] {
  return rows
    .filter(r => !isBrandQuery(r.query))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit)
}

export interface SerpCheckLite {
  keyword: string
  position: number | null
  aiOverview: boolean
  inAiOverview: boolean
  localPackRank: number | null
}

export interface SerpSummary {
  keywords: number
  top3: number
  top10: number
  notRanking: number
  withAiOverview: number
  citedInAiOverview: number
  inLocalPack: number
}

export function serpSummary(checks: SerpCheckLite[]): SerpSummary {
  const s: SerpSummary = { keywords: checks.length, top3: 0, top10: 0, notRanking: 0, withAiOverview: 0, citedInAiOverview: 0, inLocalPack: 0 }
  for (const c of checks) {
    if (c.position === null) s.notRanking++
    else {
      if (c.position <= 3) s.top3++
      if (c.position <= 10) s.top10++
    }
    if (c.aiOverview) s.withAiOverview++
    if (c.inAiOverview) s.citedInAiOverview++
    if (c.localPackRank !== null) s.inLocalPack++
  }
  return s
}

export interface GeoProbeLite {
  engine: string
  mentioned: boolean
  cited: boolean
  competitors: string[]
  error?: string | null
}

export interface EngineShare {
  engine: string
  asked: number
  answered: number
  mentioned: number
  cited: number
  /** mencionado / respondidas, 0–1. */
  share: number
}

/** "Share of voice" por motor: en cuántas respuestas aparece la marca. */
export function aiShareOfVoice(probes: GeoProbeLite[]): EngineShare[] {
  const map = new Map<string, EngineShare>()
  for (const p of probes) {
    const e = map.get(p.engine) ?? { engine: p.engine, asked: 0, answered: 0, mentioned: 0, cited: 0, share: 0 }
    e.asked++
    if (!p.error) {
      e.answered++
      if (p.mentioned) e.mentioned++
      if (p.cited) e.cited++
    }
    map.set(p.engine, e)
  }
  return [...map.values()].map(e => ({ ...e, share: e.answered > 0 ? e.mentioned / e.answered : 0 }))
}

/** Qué competidores aparecen más en las respuestas de IA (todas las sondas). */
export function competitorMentions(probes: GeoProbeLite[], limit = 10): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const p of probes) for (const c of p.competitors) counts.set(c, (counts.get(c) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}
