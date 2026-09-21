/** Textos en español de las reglas del criterio marketing vs web (UI). */
export const WEIGHT_LABELS: Record<string, string> = {
  cupo: 'Cupo con lugares dentro de la ventana de pauta',
  cupo_risk: 'Cupo en riesgo (más del 40 % sin vender a ≤ 60 días)',
  grupal: 'Salida grupal / charter de operador',
  margin_good: 'Margen bueno',
  margin_great: 'Margen excelente (extra sobre "bueno")',
  margin_bad: 'Margen bajo',
  trend_opportunity: 'Destino en oportunidad según Tendencias',
  trend_rising: 'Búsquedas del destino en alza',
  trend_declining: 'Destino en baja según Tendencias',
  high_season: 'Sale en temporada alta dentro de la ventana de compra',
  hot_window: 'Hoy es ventana de compra caliente (aguinaldo, Travel Sale, diciembre, quincenas)',
  ticket_low: 'Ticket bajo por pasajero',
  ticket_high: 'Ticket alto por pasajero',
  cannibalization: 'Canibalización (ya hay varios del mismo destino en marketing)',
  too_close: 'Salida muy cerca (no llega diseño ni aprendizaje)',
  profile_violation: 'Viola el perfil del destino',
}

export const FAMILY_LABELS: Record<string, string> = {
  caribe: 'Caribe', brasil: 'Brasil', usa: 'Estados Unidos', europa: 'Europa', medio_oriente_asia: 'Medio Oriente y Asia', argentina: 'Argentina',
}

export const TRACK_LABELS: Record<string, string> = {
  undecided: 'Sin evaluar', marketing: 'Marketing', manual: 'Para decidir', web: 'Sólo web', excluded: 'Excluido',
}

export const TRACK_COLORS: Record<string, string> = {
  undecided: 'bg-gray-100 text-gray-600', marketing: 'bg-green-100 text-green-700', manual: 'bg-amber-100 text-amber-700', web: 'bg-slate-100 text-slate-600', excluded: 'bg-red-50 text-red-600',
}
