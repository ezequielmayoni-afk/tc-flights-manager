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
  signals: {
    googleTrends: number
    autocomplete: number
    searchConsole: number
    amadeusPrice: number
    newsEvents: number
    reddit: number
  }
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

export interface TrendRunResult {
  runId: string | null
  weekLabel: string
  status: 'completed' | 'failed'
  destinations: TrendDestination[]
  alerts: TrendAlert[]
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
