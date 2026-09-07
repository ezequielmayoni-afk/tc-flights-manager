import type { MatchConfidence } from '@/lib/packages/flight-match'

/** Cupo propio con el que está armado un paquete, para marcarlo en la tabla. */
export interface CupoInfoFlight {
  flightId: number
  baseId: string
  startDate: string
  remaining: number
  total: number
  confidence: MatchConfidence
}

/** package_id → cupos que usa. Un paquete de circuito cerrado entra con lista vacía. */
export type CupoInfoMap = Record<number, { flights: CupoInfoFlight[] }>
