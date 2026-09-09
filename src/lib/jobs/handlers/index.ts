import type { HandlerDefinition } from '../types'
import { noopHandler } from './noop'
import { trendRunHandler } from './trend-run'
import { demandSignalsHandler } from './demand-signals'
import { insightsSyncHandler } from './insights-sync'
import { marketingGuardHandler } from './marketing-guard'
import { adsApplyDecisionHandler } from './ads-apply-decision'
import { cupoLinkRefreshHandler } from './cupo-link-refresh'
import { cupoSoldOutHandler } from './cupo-sold-out'
import { tcWriteHandler } from './tc-write'
import { tcReconcileHandler } from './tc-reconcile'
import { healthCheckHandler } from './health-check'
import { healthDigestHandler } from './health-digest'
import { ideaProbeHandler } from './idea-probe'
import { ideaQuoteHandler } from './idea-quote'
import { profileAuditHandler } from './profile-audit'
import { flightsSweepPlanHandler } from './flights-sweep-plan'
import { flightsSweepHandler } from './flights-sweep'

/**
 * Registro de handlers: un archivo por `kind`. Las fases del loop van sumando
 * entradas acá; el runner sólo conoce este mapa.
 */
const HANDLERS: HandlerDefinition[] = [
  noopHandler,
  // Fase 1 — Tendencias
  trendRunHandler,
  demandSignalsHandler,
  // Fase 2 — Guard de marketing
  insightsSyncHandler,
  marketingGuardHandler,
  adsApplyDecisionHandler,
  cupoLinkRefreshHandler,
  cupoSoldOutHandler,
  tcWriteHandler,
  tcReconcileHandler,
  healthCheckHandler,
  healthDigestHandler,
  // Fase 3 — Producto
  ideaProbeHandler,
  ideaQuoteHandler,
  profileAuditHandler,
  // Vuelos baratos (vuelos.siviajo.com)
  flightsSweepPlanHandler,
  flightsSweepHandler,
]

const byKind = new Map(HANDLERS.map(h => [h.kind, h]))

export function getHandlerDefinition(kind: string): HandlerDefinition | undefined {
  return byKind.get(kind)
}

export function listHandlers(): HandlerDefinition[] {
  return HANDLERS
}
