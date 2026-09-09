import type { HandlerDefinition } from '../types'
import { noopHandler } from './noop'
import { trendRunHandler } from './trend-run'
import { demandSignalsHandler } from './demand-signals'

/**
 * Registro de handlers: un archivo por `kind`. Las fases del loop van sumando
 * entradas acá; el runner sólo conoce este mapa.
 */
const HANDLERS: HandlerDefinition[] = [
  noopHandler,
  // Fase 1 — Tendencias
  trendRunHandler,
  demandSignalsHandler,
]

const byKind = new Map(HANDLERS.map(h => [h.kind, h]))

export function getHandlerDefinition(kind: string): HandlerDefinition | undefined {
  return byKind.get(kind)
}

export function listHandlers(): HandlerDefinition[] {
  return HANDLERS
}
