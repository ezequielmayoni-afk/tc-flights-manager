import type { Db } from '@/lib/jobs/types'
import type { SerpApiClient } from '@/lib/serpapi/client'

/** Lo que cada colector devuelve: un score por destino (slug) más metadata. */
export interface CollectorResult {
  source: string
  destinations: Map<string, DestinationSignal>
  queriesUsed: number
  durationMs: number
  error?: string
}

export interface DestinationSignal {
  rawScore: number
  normalizedScore: number
  metadata: Record<string, unknown>
}

export interface RelatedQuery {
  query: string
  /** Tal como lo da Google Trends: "+170 %" o "Aumento puntual". */
  value: string
  intent: 'buy' | 'info' | 'brand' | 'other'
}

export type Momentum = 'surging' | 'rising' | 'stable' | 'falling' | 'new'
export type Classification = 'opportunity' | 'gap' | 'saturated' | 'declining'

export interface TrendDestination {
  destination: string
  destinationSlug: string
  region: string
  trendScore: number
  rank: number
  /** Score normalizado 0–100 por fuente (google_trends, google_related, autocomplete, youtube, trending_now). */
  signals: Record<string, number>
  prevWeekScore: number | null
  changePct: number | null
  momentum: Momentum
  hasPackages: boolean
  matchingPackageCount: number
  matchingPackageIds: number[]
  cheapestPackagePrice: number | null
  classification: Classification
  relatedQueries: RelatedQuery[]
  rawSignals: Record<string, unknown>
}

export type AlertType = 'demand_spike' | 'disaster' | 'event' | 'price_drop' | 'competitor_gap'
export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface TrendAlert {
  destination: string
  alertType: AlertType
  severity: AlertSeverity
  title: string
  description: string
  source: string
  data: Record<string, unknown>
}

/** Lo que se busca y de lo que se habla, a nivel corrida (no por destino). */
export interface TrendBuzz {
  /** "Tendencias ahora" de Google en Argentina, últimos 7 días: viajes y destinos conocidos. */
  trendingNow: TrendingItem[]
  /** Consultas relacionadas de los términos genéricos ("paquetes", "vuelos"…). */
  related: GenericRelatedList[]
  /** Qué completa YouTube para "viaje a", "vlog viaje a"… */
  youtube: Array<{ name: string; slug: string; weight: number; sampleQueries: string[] }>
}

export interface TrendingItem {
  query: string
  volume: number | null
  increasePct: number | null
  categories: string[]
  travel: boolean
  slug: string | null
  breakdown: string[]
}

export interface GenericRelatedList {
  seed: string
  rising: Array<{ query: string; value: string; slug: string | null }>
  top: Array<{ query: string; value: number; slug: string | null }>
  error?: string
}

export interface TrendRunResult {
  runId: string | null
  weekLabel: string
  status: 'completed' | 'failed'
  destinations: TrendDestination[]
  alerts: TrendAlert[]
  buzz: TrendBuzz
  sourcesCollected: Record<string, boolean>
  catalogSnapshotCount: number
  serpApiCalls: number
  durationMs: number
  error?: string
}

/** Contexto que reciben los colectores y el orquestador desde el job. */
export interface TendenciasContext {
  db: Db
  jobId: number | null
  serpapi: SerpApiClient
  log: (message: string, details?: Record<string, unknown>, level?: 'info' | 'warning' | 'error') => Promise<void>
  heartbeat?: () => Promise<void>
  /** Slugs semilla que tienen paquetes en el catálogo: siempre se comparan en Trends. */
  catalogSlugs?: Set<string>
}

export interface TrendRunOptions extends TendenciasContext {
  trigger: 'cron' | 'manual'
  /** Corre todo pero no escribe en la base. Para probar colectores y scoring. */
  dryRun?: boolean
}

/** Paquete del catálogo tal como lo ve el matcher (viene de packages + package_destinations). */
export interface CatalogEntry {
  packageId: number
  tcPackageId: number
  title: string
  destinationNames: string[]
  pricePerPax: number | null
}
