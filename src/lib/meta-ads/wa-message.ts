import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Etiqueta de destino para el mensaje de WhatsApp de un anuncio.
 * Fuente: package_destinations.destination_name (100% de cobertura en marketing,
 * nombres limpios tipo "Punta Cana", "Aruba"), ordenado por sort_order.
 * - 1 destino  -> "Punta Cana"
 * - 2+ destinos -> "Aruba y Curaçao" (los 2 primeros únicos; tours largos no
 *   inflan el mensaje, y el SIV {id} es el identificador real de tracking).
 * Devuelve '' si el paquete no tiene destinos cargados (fallback sin destino).
 */
export async function getPackageDestinationLabel(
  db: SupabaseClient,
  packageId: number
): Promise<string> {
  const { data } = await db
    .from('package_destinations')
    .select('destination_name, sort_order')
    .eq('package_id', packageId)
    .order('sort_order', { ascending: true })

  const names = [
    ...new Set(
      (data || [])
        .map((d) => (d.destination_name || '').trim())
        .filter(Boolean)
    ),
  ]

  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names[0]} y ${names[1]}`
}

/**
 * Mensaje de autocompletado de WhatsApp para el anuncio.
 * Incluye el destino y MANTIENE "SIV {tc_package_id} (no borrar)" intacto
 * (lo usa el tracking — no tocar ese fragmento).
 */
export function buildWaMessage(destino: string, tcPackageId: number): string {
  return destino
    ? `Hola! Quiero mas info sobre "${destino}" SIV ${tcPackageId} (no borrar)`
    : `Hola! Quiero mas info de la promo SIV ${tcPackageId} (no borrar)`
}
