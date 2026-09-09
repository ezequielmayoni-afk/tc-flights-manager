import { describe, expect, it } from 'vitest'
import { catalogSlugMatches, matchCatalogEntries } from '../catalog-matcher'
import type { CatalogEntry, TrendDestination } from '../types'

describe('catalogSlugMatches', () => {
  it('nombres de TC en inglés o con sufijos', () => {
    expect(catalogSlugMatches('roma', 'rome')).toBe(true)
    expect(catalogSlugMatches('estambul', 'istanbul')).toBe(true)
    expect(catalogSlugMatches('bariloche', 'san-carlos-de-bariloche')).toBe(true)
    expect(catalogSlugMatches('orlando', 'orlando-fl')).toBe(true)
    expect(catalogSlugMatches('disney', 'walt-disney-world-resort-fl')).toBe(true)
    expect(catalogSlugMatches('las-vegas', 'las-vegas-nv')).toBe(true)
    expect(catalogSlugMatches('cancun', 'costa-mujeres')).toBe(true)
    expect(catalogSlugMatches('santorini', 'santorini-island')).toBe(true)
  })

  it('un país semilla matchea con sus ciudades', () => {
    expect(catalogSlugMatches('grecia', 'athens')).toBe(true)
    expect(catalogSlugMatches('egipto', 'in-navigation-aswan')).toBe(true)
    expect(catalogSlugMatches('tailandia', 'phuket')).toBe(true)
    expect(catalogSlugMatches('japon', 'kyoto')).toBe(true)
  })

  it('no matchea por prefijos sueltos ni tokens cortos', () => {
    expect(catalogSlugMatches('roma', 'romania')).toBe(false)
    expect(catalogSlugMatches('lima', 'limassol')).toBe(false)
    expect(catalogSlugMatches('bali', 'balikpapan')).toBe(false)
    expect(catalogSlugMatches('natal', 'natal')).toBe(true)
    expect(catalogSlugMatches('salta', 'salta')).toBe(true)
    expect(catalogSlugMatches('cusco', 'cuzco-alto')).toBe(false)
  })
})

function dest(slug: string, name = slug): TrendDestination {
  return {
    destination: name, destinationSlug: slug, region: 'caribe', trendScore: 50, rank: 1,
    signals: { googleTrends: 0, autocomplete: 0, searchConsole: 0, amadeusPrice: 0, newsEvents: 0, reddit: 0 },
    prevWeekScore: null, changePct: null, momentum: 'new', hasPackages: false, matchingPackageCount: 0,
    matchingPackageIds: [], cheapestPackagePrice: null, classification: 'declining', relatedQueries: [], rawSignals: {},
  }
}

describe('matchCatalogEntries', () => {
  const catalog: CatalogEntry[] = [
    { packageId: 1, tcPackageId: 100, title: 'Punta Cana 7 noches', destinationNames: ['Punta Cana'], pricePerPax: 1500 },
    { packageId: 2, tcPackageId: 101, title: 'Punta Cana + Bayahibe', destinationNames: ['Punta Cana', 'Bayahibe'], pricePerPax: 1200 },
    { packageId: 3, tcPackageId: 102, title: 'Roma y Florencia', destinationNames: ['Rome', 'Florence'], pricePerPax: null },
    { packageId: 4, tcPackageId: 103, title: 'Disney', destinationNames: ['Walt Disney World  Resort FL', 'Orlando FL'], pricePerPax: 2400 },
  ]

  it('cuenta paquetes, guarda ids y el precio más barato', () => {
    const [pc, roma, disney, orlando, ushuaia] = matchCatalogEntries(
      [dest('punta-cana', 'Punta Cana'), dest('roma', 'Roma'), dest('disney', 'Disney'), dest('orlando', 'Orlando'), dest('ushuaia', 'Ushuaia')],
      catalog
    )
    expect(pc.matchingPackageIds).toEqual([1, 2])
    expect(pc.cheapestPackagePrice).toBe(1200)
    expect(roma.hasPackages).toBe(true)
    expect(roma.cheapestPackagePrice).toBeNull()
    expect(disney.matchingPackageIds).toEqual([4])
    expect(orlando.matchingPackageIds).toEqual([4])
    expect(ushuaia.hasPackages).toBe(false)
    expect(ushuaia.matchingPackageCount).toBe(0)
  })
})
