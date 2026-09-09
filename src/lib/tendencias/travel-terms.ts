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

/**
 * ¿Una consulta relacionada cuenta como demanda de viaje al destino que
 * nombra? Sí cuando habla de viajes ("paquetes a florianopolis 2026") o
 * cuando es el destino a secas ("villa traful", "punta cana 2027"). No cuando
 * el destino aparece dentro de otra cosa ("nuestra señora de la asuncion").
 */
export function countsAsTravelDemand(query: string, slug: string | null): boolean {
  if (!slug) return false
  if (isTravelQuery(query)) return true
  const bare = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b20\d\d\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return bare === slug || bare.replace(/^(la|el|las|los)-/, '') === slug.replace(/^(la|el|las|los)-/, '')
}
