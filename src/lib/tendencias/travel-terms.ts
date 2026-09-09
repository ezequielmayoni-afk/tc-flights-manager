/**
 * Palabras que hacen que una búsqueda genérica sea de viajes. Sirve para
 * filtrar el ruido de "vacaciones" (liquidación de vacaciones, calculadora)
 * y "viajes" (agencias) sin perder aerolíneas, cruceros ni Travel Sale.
 */
const TRAVEL_TERMS = [
  'paquete', 'vuelo', 'viaje', 'viajar', 'pasaje', 'hotel', 'resort', 'all inclusive', 'todo incluido', 'crucero', 'escapada',
  'travel sale', 'aerol', 'airline', 'turismo', 'turistic', 'turístic', 'playa', 'excursion', 'excursión', 'tour', 'hostel', 'cabaña',
  'arajet', 'aireuropa', 'air europa', 'flybondi', 'jetsmart', 'latam', 'iberia', 'level', 'copa airlines', 'avianca', 'gol', 'azul',
  'american airlines', 'united', 'delta', 'emirates', 'turkish', 'qatar', 'air france', 'klm', 'lufthansa', 'british', 'msc', 'costa cruceros', 'royal caribbean', 'norwegian',
]

export function isTravelQuery(query: string): boolean {
  const q = query.toLowerCase()
  return TRAVEL_TERMS.some(t => q.includes(t))
}

/** Términos genéricos que sólo cuentan si la consulta habla de viajes. */
export const AMBIGUOUS_SEEDS = new Set(['viajes', 'vacaciones'])

/** ¿Una consulta relacionada de este término cuenta como demanda de viaje? */
export function countsAsTravelDemand(seed: string, query: string): boolean {
  return AMBIGUOUS_SEEDS.has(seed) ? isTravelQuery(query) : true
}
