import { DESTINATION_ALIASES, slugify } from './config'
import type { Db } from '@/lib/jobs/types'
import type { CatalogEntry, TrendDestination } from './types'

/** Slugs demasiado cortos o genéricos como para matchear por contención. */
const MIN_CONTAINMENT_LENGTH = 4

function containsToken(haystack: string, needle: string): boolean {
  if (needle.length < MIN_CONTAINMENT_LENGTH) return haystack === needle
  return haystack === needle || haystack.startsWith(`${needle}-`) || haystack.endsWith(`-${needle}`) || haystack.includes(`-${needle}-`)
}

/**
 * ¿El destino del catálogo (slug de TC, ej. "san-carlos-de-bariloche",
 * "orlando-fl", "rome") corresponde al destino trending (slug en castellano)?
 */
export function catalogSlugMatches(trendSlug: string, catalogSlug: string): boolean {
  if (catalogSlug === trendSlug) return true
  if (containsToken(catalogSlug, trendSlug)) return true
  for (const alias of DESTINATION_ALIASES[trendSlug] ?? []) {
    if (containsToken(catalogSlug, alias)) return true
  }
  return false
}

/**
 * Cruza los destinos puntuados con el catálogo. Puro: recibe los paquetes ya
 * leídos, así se prueba sin base.
 */
export function matchCatalogEntries(destinations: TrendDestination[], entries: CatalogEntry[]): TrendDestination[] {
  const catalog = entries.map(e => ({ entry: e, slugs: e.destinationNames.map(slugify).filter(Boolean) }))

  for (const dest of destinations) {
    const matched = catalog.filter(c => c.slugs.some(s => catalogSlugMatches(dest.destinationSlug, s))).map(c => c.entry)
    dest.hasPackages = matched.length > 0
    dest.matchingPackageCount = matched.length
    dest.matchingPackageIds = matched.map(m => m.packageId)
    const prices = matched.map(m => m.pricePerPax).filter((p): p is number => typeof p === 'number' && p > 0)
    dest.cheapestPackagePrice = prices.length ? Math.min(...prices) : null
  }
  return destinations
}

/**
 * Catálogo vigente: paquetes activos en TC que no están vencidos ni ocultos.
 * Lee la base local (media-os lo pedía por HTTP a HUB y nunca matcheó nada
 * porque `packages` no tiene `destination_name`: está en package_destinations).
 */
export async function loadCatalog(db: Db): Promise<CatalogEntry[]> {
  const { data, error } = await db
    .from('packages')
    .select('id, tc_package_id, title, current_price_per_pax, total_price, package_destinations(destination_name)')
    .eq('tc_active', true)
    .not('status', 'in', '("expired","not_visible")')
  if (error) throw new Error(`No se pudo leer el catálogo: ${error.message}`)

  return (data ?? []).map(row => {
    const r = row as {
      id: number; tc_package_id: number; title: string
      current_price_per_pax: number | null; total_price: number | null
      package_destinations: Array<{ destination_name: string | null }> | null
    }
    return {
      packageId: r.id,
      tcPackageId: r.tc_package_id,
      title: r.title,
      destinationNames: (r.package_destinations ?? []).map(d => d.destination_name ?? '').filter(Boolean),
      pricePerPax: r.current_price_per_pax ?? r.total_price ?? null,
    }
  })
}

export async function matchCatalog(db: Db, destinations: TrendDestination[]): Promise<{ destinations: TrendDestination[]; catalogSize: number }> {
  const entries = await loadCatalog(db)
  return { destinations: matchCatalogEntries(destinations, entries), catalogSize: entries.length }
}
