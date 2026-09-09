import { google } from 'googleapis'
import { getAllDestinations } from '../config'
import type { CollectorResult, DestinationSignal } from '../types'

/**
 * Google Search Console: qué buscan antes de llegar a siviajo.com.
 *
 * Mide SEO propio, no demanda de mercado: por eso su peso en el score es 0.
 * Se guarda como señal por destino (impresiones y clics de 28 días). Usa la
 * Service Account de Drive, que ya es usuario de la propiedad.
 */

const DEFAULT_SITE_URL = 'https://www.siviajo.com/'

export interface SearchConsoleRow {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export function searchConsoleSiteUrl(): string {
  return process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || DEFAULT_SITE_URL
}

export function hasSearchConsoleCredentials(): boolean {
  return Boolean(process.env.GOOGLE_DRIVE_CREDENTIALS)
}

export async function querySearchConsole(days = 28): Promise<SearchConsoleRow[]> {
  const credentials = process.env.GOOGLE_DRIVE_CREDENTIALS
  if (!credentials) throw new Error('GOOGLE_DRIVE_CREDENTIALS no está configurada')
  const creds = JSON.parse(credentials) as { client_email: string; private_key: string }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  })
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  // Search Console publica con ~2 días de retraso.
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 2)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)

  const response = await searchconsole.searchanalytics.query({
    siteUrl: searchConsoleSiteUrl(),
    requestBody: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      dimensions: ['query'],
      rowLimit: 1000,
      dataState: 'all',
    },
  })

  return (response.data.rows ?? []).map(r => ({
    query: r.keys?.[0] ?? '',
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }))
}

/** Agrupa las consultas de Search Console por destino semilla. Puro. */
export function aggregateByDestination(rows: SearchConsoleRow[]): Map<string, { name: string; impressions: number; clicks: number; topQueries: string[] }> {
  const seeds = getAllDestinations().map(d => ({ ...d, needle: d.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }))
  const byDest = new Map<string, { name: string; impressions: number; clicks: number; topQueries: string[] }>()

  for (const row of rows) {
    const q = row.query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (const seed of seeds) {
      if (!q.includes(seed.needle)) continue
      const current = byDest.get(seed.slug) ?? { name: seed.name, impressions: 0, clicks: 0, topQueries: [] }
      current.impressions += row.impressions
      current.clicks += row.clicks
      if (current.topQueries.length < 5) current.topQueries.push(row.query)
      byDest.set(seed.slug, current)
    }
  }
  return byDest
}

export async function collectSearchConsole(): Promise<CollectorResult> {
  const started = Date.now()
  const destinations = new Map<string, DestinationSignal>()
  let error: string | undefined
  let queriesUsed = 0

  if (!hasSearchConsoleCredentials()) {
    return { source: 'search_console', destinations, queriesUsed, durationMs: 0, error: 'Sin credenciales de Google' }
  }

  try {
    const rows = await querySearchConsole()
    queriesUsed = 1
    const byDest = aggregateByDestination(rows)
    const maxImpressions = Math.max(...[...byDest.values()].map(d => d.impressions), 1)
    for (const [slug, data] of byDest) {
      destinations.set(slug, {
        rawScore: data.impressions,
        normalizedScore: Math.round((data.impressions / maxImpressions) * 100),
        metadata: { name: data.name, impressions: data.impressions, clicks: data.clicks, topQueries: data.topQueries },
      })
    }
  } catch (err) {
    error = (err as Error).message
    console.warn(`[tendencias/search-console] ${error}`)
  }

  return { source: 'search_console', destinations, queriesUsed, durationMs: Date.now() - started, error }
}
