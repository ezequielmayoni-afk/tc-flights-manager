import { describe, expect, it } from 'vitest'
import { airlineLogo } from '../airlines'
import { findCity, searchCities } from '../cities'

/**
 * El autocomplete de destinos y la resolución de logos de aerolínea.
 *
 * Los dos datasets vienen de Travel Compositor y tienen las rarezas del
 * proveedor (Córdoba sin tilde, 'Miami FL', 'Aerolineas Argentinas' sin
 * tilde): los tests fijan justamente eso, porque es lo que rompe cuando
 * alguien regenera los archivos.
 */

describe('searchCities', () => {
  it('pone primero la ciudad cuyo nombre empieza con lo escrito', () => {
    const hits = searchCities('mia')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].code).toBe('MIA')
    expect(hits[0].label).toBe('Miami FL, Estados Unidos')
  })

  it('ignora acentos y mayúsculas en los dos sentidos', () => {
    // En el dataset la ciudad está guardada como 'Cordoba', sin tilde.
    for (const query of ['cordoba', 'Córdoba', 'CORDOBA']) {
      const hits = searchCities(query)
      expect(hits.map((h) => h.code)).toContain('CRD')
    }
    // Y al revés: el dato tiene tilde y la búsqueda no.
    expect(searchCities('florianopolis')[0]?.code).toBe('FLO')
  })

  it('devuelve [] si la búsqueda es demasiado corta', () => {
    expect(searchCities('m')).toEqual([])
    expect(searchCities(' ')).toEqual([])
    expect(searchCities('')).toEqual([])
  })

  it('respeta el límite y no devuelve duplicados', () => {
    const hits = searchCities('san', 5)
    expect(hits).toHaveLength(5)
    expect(new Set(hits.map((h) => h.code)).size).toBe(5)
  })

  it('encuentra por código exacto aunque el nombre no matchee', () => {
    // 'RO6' no aparece en ningún nombre: sólo puede salir por código.
    expect(searchCities('mez').map((h) => h.code)).toContain('MEZ')
  })

  it('prioriza el prefijo del nombre sobre el "contiene"', () => {
    const hits = searchCities('madrid')
    expect(hits[0].name.toLowerCase().startsWith('madrid')).toBe(true)
  })
})

describe('findCity', () => {
  it('resuelve el código exacto sin importar mayúsculas ni espacios', () => {
    expect(findCity(' crd ')?.name).toBe('Cordoba')
    expect(findCity('BUE')?.label).toBe('Buenos Aires, Argentina')
  })

  it('devuelve null con un código que no existe', () => {
    expect(findCity('ZZZ')).toBeNull()
    expect(findCity(null)).toBeNull()
  })
})

describe('airlineLogo', () => {
  it('resuelve por código', () => {
    const logo = airlineLogo('AR', null)
    expect(logo.src).toContain('tr2storage.blob.core.windows.net')
    expect(logo.name).toBe('Aerolineas Argentinas')
  })

  it('resuelve por nombre cuando no hay código (el caso normal del barrido)', () => {
    expect(airlineLogo(null, 'American Airlines').src).toBe(
      'https://www.gstatic.com/flights/airline_logos/70px/AA.png'
    )
    // La tilde y las mayúsculas no importan.
    expect(airlineLogo(null, 'Aerolíneas Argentinas').name).toBe('Aerolineas Argentinas')
    expect(airlineLogo(null, 'DELTA AIR LINES').src).toBeTruthy()
  })

  it('resuelve los alias de LATAM', () => {
    const esperado = airlineLogo('LA', null).src
    expect(airlineLogo(null, 'LATAM').src).toBe(esperado)
    expect(airlineLogo(null, 'Latam Airlines').src).toBe(esperado)
    expect(airlineLogo(null, 'Latam Airlines Group').src).toBe(esperado)
  })

  it('aguanta los sufijos societarios del proveedor', () => {
    expect(airlineLogo(null, 'Air Europa, S.A.').src).toBe(airlineLogo('UX', null).src)
  })

  it('sin logo devuelve src null y conserva el nombre que vino', () => {
    expect(airlineLogo(null, 'Aerolínea Inventada')).toEqual({ src: null, name: 'Aerolínea Inventada' })
    expect(airlineLogo('ZZ', null)).toEqual({ src: null, name: 'ZZ' })
    expect(airlineLogo(null, null)).toEqual({ src: null, name: '' })
  })
})
