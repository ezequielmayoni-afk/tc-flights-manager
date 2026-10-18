import { describe, expect, it } from 'vitest'
import { SITE_SEARCH_ALLOWED_ORIGINS, SITE_SEARCH_MAX_OPTIONS, SITE_SEARCH_MIN_PRICE_PP, SITE_SEARCH_PLAUSIBLE } from '../config'
import {
  aggregateSiteSearchStats,
  isPlausiblePrice,
  siteSearchDestinationLabel,
  parseSiteSearch,
  siteSearchBeaconSchema,
  siteSearchKey,
  siteSearchOriginAllowed,
  type SiteSearch,
  type SiteSearchBeacon,
  type SiteSearchStatRow,
} from '../site-search'

/**
 * El beacon de búsquedas reales de siviajo.com: qué se acepta, cómo se saca el
 * destino (TC manda el origen como destino de la búsqueda en "solo vuelo") y
 * qué tarjetas cuentan. Todo puro: sin red ni base.
 */

const HOY = new Date(Date.UTC(2026, 9, 17, 15)) // 17 de octubre de 2026

/** Del dataLayer real del 2026-10-17, recortado. */
const BEACON_REAL = {
  v: 1,
  section: 'ONLY_FLIGHT',
  subsection: 'Transports',
  search: {
    departureCode: 'BUE',
    departureName: 'Buenos Aires',
    destinationCode: 'BUE',
    destinationName: 'Buenos Aires',
    startDate: '2027-09-03',
    endDate: '2027-09-10',
    adults: '1',
    children: '0',
    infants: '0',
  },
  itinerary: [
    { position: 0, type: 'DESTINATION', destinationCode: 'BUE', destinationName: 'Buenos Aires', startDate: '2027-09-03' },
    { position: 1, type: 'DESTINATION', destinationCode: 'MIA', destinationName: 'Miami FL', startDate: '2027-09-03', endDate: '2027-09-10', nights: 7 },
    { position: 2, type: 'DESTINATION', destinationCode: 'BUE', destinationName: 'Buenos Aires', startDate: '2027-09-10' },
  ],
  items: [
    {
      id: 'transport_orchestra_plane_public__eze_bog_2027-09-03t16:50_2027-09-03t21:30_av_av_8396_s__economy',
      price: 886.17,
      brand: 'Avianca',
      variant: 'RT',
      start: '2027-09-03',
      end: '2027-09-03',
    },
    {
      id: 'transport_sabre_flights_plane_public__aep_lim_2027-09-03t09:35_2027-09-03t12:15_h2_h2_5572_x',
      price: 416.32,
      brand: 'Sky Airline',
      variant: 'OW',
      start: '2027-09-03',
      end: '2027-09-03',
    },
    {
      id: 'transport_orchestra_plane_public__eze_bog_2027-09-03t07:10_2027-09-03t11:30_av_av_88_s__economy',
      price: 899.46,
      brand: 'Avianca',
      variant: 'RT',
      start: '2027-09-03',
      end: '2027-09-03',
    },
  ],
  url: '/transport/onlyTransportAvail.xhtml',
  ts: 1792281000000,
}

function beacon(over: Record<string, unknown> = {}): SiteSearchBeacon {
  return siteSearchBeaconSchema.parse({ ...structuredClone(BEACON_REAL), ...over })
}

function conSearch(over: Record<string, unknown>): SiteSearchBeacon {
  return beacon({ search: { ...BEACON_REAL.search, ...over } })
}

function ok(b: SiteSearchBeacon): SiteSearch {
  const r = parseSiteSearch(b, HOY)
  if (r.search === null) throw new Error(`se esperaba una búsqueda, vino ${r.reason}`)
  return r.search
}

function motivo(b: SiteSearchBeacon): string | null {
  const r = parseSiteSearch(b, HOY)
  return r.search === null ? r.reason : null
}

describe('parseSiteSearch', () => {
  it('traduce el beacon real: destino del itinerario, sólo tarjetas RT, la más barata primero', () => {
    const s = ok(beacon())
    expect(s).toMatchObject({
      origin: 'BUE',
      destinationCode: 'MIA',
      destinationName: 'Miami FL',
      depart: '2027-09-03',
      return: '2027-09-10',
      nights: 7,
      adults: 1,
      children: 0,
      infants: 0,
      status: 'ok',
      minPricePp: 886.17,
      airline: 'Avianca',
      results: 2,
      url: '/transport/onlyTransportAvail.xhtml',
    })
    // La OW de 416.32 no cuenta (no es ida y vuelta).
    expect(s.options).toEqual([
      { airline: 'Avianca', pricePp: 886.17, itineraryId: BEACON_REAL.items[0].id },
      { airline: 'Avianca', pricePp: 899.46, itineraryId: BEACON_REAL.items[2].id },
    ])
  })

  it('ordena las opciones de menor a mayor y respeta el tope', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `it-${i}`, price: String(1000 - i * 10), brand: `A${i}`, variant: i % 2 ? 'rt' : 'RT' }))
    const s = ok(beacon({ items }))
    expect(s.results).toBe(8)
    expect(s.options).toHaveLength(SITE_SEARCH_MAX_OPTIONS)
    expect(s.options.map(o => o.pricePp)).toEqual([930, 940, 950, 960, 970])
    expect(s.minPricePp).toBe(930)
    expect(s.airline).toBe('A7')
  })

  it('redondea el mínimo a 2 decimales', () => {
    const s = ok(beacon({ items: [{ price: '886.1749', variant: 'RT' }] }))
    expect(s.minPricePp).toBe(886.17)
    expect(s.airline).toBeNull()
    expect(s.options[0].itineraryId).toBeNull()
  })

  it('usa search.destinationCode cuando viene distinto del origen (sin itinerario)', () => {
    const s = ok(beacon({ search: { ...BEACON_REAL.search, destinationCode: 'mia', destinationName: 'Miami' }, itinerary: null }))
    expect(s.destinationCode).toBe('MIA')
    expect(s.destinationName).toBe('Miami')
    expect(s.return).toBe('2027-09-10')
  })

  it('sin endDate en la búsqueda toma la vuelta de la parada del itinerario', () => {
    const b = conSearch({ endDate: undefined })
    expect(ok(b).return).toBe('2027-09-10')
  })

  it('descarta otra sección', () => {
    expect(motivo(beacon({ section: 'FLIGHT_HOTEL' }))).toBe('seccion')
  })

  it('descarta fechas inválidas, vuelta anterior a la ida o ida pasada', () => {
    expect(motivo(conSearch({ startDate: '2027-02-31' }))).toBe('fechas')
    expect(motivo(conSearch({ startDate: '03/09/2027' }))).toBe('fechas')
    expect(motivo(conSearch({ endDate: '2027-09-01' }))).toBe('fechas')
    expect(motivo(conSearch({ startDate: '2026-10-16', endDate: '2026-10-20' }))).toBe('fechas')
    expect(motivo(beacon({ search: { ...BEACON_REAL.search, endDate: undefined }, itinerary: [BEACON_REAL.itinerary[1]].map(e => ({ ...e, endDate: undefined })) }))).toBe('fechas')
    // Hoy mismo sí entra.
    expect(motivo(conSearch({ startDate: '2026-10-17', endDate: '2026-10-24' }))).toBeNull()
  })

  it('descarta la búsqueda sin destino', () => {
    expect(motivo(beacon({ itinerary: null }))).toBe('destino')
    expect(motivo(beacon({ itinerary: [BEACON_REAL.itinerary[0], BEACON_REAL.itinerary[2]] }))).toBe('destino')
    // Una parada en posición 0 no es el destino.
    expect(motivo(beacon({ itinerary: [{ ...BEACON_REAL.itinerary[1], position: 0 }] }))).toBe('destino')
  })

  it('ignora los precios fuera de rango', () => {
    const items = [
      { price: 0, variant: 'RT' },
      { price: -5, variant: 'RT' },
      { price: 20000, variant: 'RT' },
      { price: 'abc', variant: 'RT' },
      { variant: 'RT' },
      { price: 1200, variant: 'RT', brand: 'LATAM' },
    ]
    const s = ok(beacon({ items }))
    expect(s.results).toBe(1)
    expect(s.minPricePp).toBe(1200)
    expect(s.airline).toBe('LATAM')
  })

  it('sin tarjetas RT queda empty y sin precio', () => {
    const s = ok(beacon({ items: [BEACON_REAL.items[1]] }))
    expect(s).toMatchObject({ status: 'empty', minPricePp: null, airline: null, options: [], results: 0 })
    expect(ok(beacon({ items: [] })).status).toBe('empty')
  })

  it('lee menores e infantes por separado y valida los adultos', () => {
    expect(ok(conSearch({ adults: 2, children: '1', infants: 1 }))).toMatchObject({ adults: 2, children: 1, infants: 1 })
    expect(ok(conSearch({ adults: undefined, children: undefined, infants: undefined }))).toMatchObject({ adults: 1, children: 0, infants: 0 })
    expect(motivo(conSearch({ adults: '0' }))).toBe('pasajeros')
    expect(motivo(conSearch({ adults: 10 }))).toBe('pasajeros')
    expect(motivo(conSearch({ children: '1.5' }))).toBe('pasajeros')
    expect(motivo(conSearch({ children: '100000' }))).toBe('pasajeros')
    expect(motivo(conSearch({ children: 9 }))).toBe('pasajeros')
    expect(motivo(conSearch({ infants: 5 }))).toBe('pasajeros')
    expect(ok(conSearch({ adults: 9, children: 8, infants: 4 }))).toMatchObject({ adults: 9, children: 8, infants: 4 })
  })

  it('descarta tarjetas que divididas quedan por debajo del piso por persona', () => {
    expect(SITE_SEARCH_MIN_PRICE_PP).toBe(80)
    // 60 entre 2 adultos son US$ 30: no es una tarifa.
    const s = ok(beacon({ search: { ...BEACON_REAL.search, adults: 2 }, items: [{ price: 60, variant: 'RT' }] }))
    expect(s).toMatchObject({ status: 'empty', minPricePp: null, results: 0 })
    // El piso es inclusivo.
    expect(ok(beacon({ items: [{ price: 80, variant: 'RT' }] })).minPricePp).toBe(80)
    expect(ok(beacon({ items: [{ price: 79.99, variant: 'RT' }] })).status).toBe('empty')
  })

  it('guarda sólo el pathname de la url', () => {
    expect(ok(beacon({ url: '/transport/onlyTransportAvail.xhtml;jsessionid=ABC?email=a@b.com#x' })).url).toBe('/transport/onlyTransportAvail.xhtml')
    expect(ok(beacon({ url: '/a?b=1' })).url).toBe('/a')
    expect(ok(beacon({ url: 'https://www.siviajo.com/a' })).url).toBeNull()
    expect(ok(beacon({ url: undefined })).url).toBeNull()
  })

  it('con destino directo, la vuelta de respaldo sale de la parada de ese destino y no de otra', () => {
    const itinerary = [
      { position: 1, type: 'DESTINATION', destinationCode: 'CUN', startDate: '2027-09-03', endDate: '2027-09-20' },
      { position: 2, type: 'DESTINATION', destinationCode: 'MIA', startDate: '2027-09-03', endDate: '2027-09-12' },
    ]
    const s = ok(beacon({ search: { ...BEACON_REAL.search, destinationCode: 'MIA', endDate: undefined }, itinerary }))
    expect(s.destinationCode).toBe('MIA')
    expect(s.return).toBe('2027-09-12')
  })
})

describe('parseSiteSearch con varios pasajeros (el price del dataLayer es el total)', () => {
  const tarjeta = (price: number) => [{ id: 'x', price, brand: 'Avianca', variant: 'RT' }]

  it('2 adultos: divide el total por 2', () => {
    const s = ok(beacon({ search: { ...BEACON_REAL.search, adults: '2' }, items: tarjeta(1772.34) }))
    expect(s.minPricePp).toBe(886.17)
    expect(s.options[0].pricePp).toBe(886.17)
  })

  it('1 adulto: el precio queda igual', () => {
    expect(ok(beacon()).minPricePp).toBe(886.17)
  })

  it('2 adultos + 1 menor: divide por 3', () => {
    const s = ok(beacon({ search: { ...BEACON_REAL.search, adults: 2, children: 1 }, items: tarjeta(2658.51) }))
    expect(s.minPricePp).toBe(886.17)
  })

  it('los infantes no dividen', () => {
    const s = ok(beacon({ search: { ...BEACON_REAL.search, adults: 2, infants: '1' }, items: tarjeta(1772.34) }))
    expect(s.minPricePp).toBe(886.17)
  })

  it('el tope de rango se mide por persona', () => {
    // 30.000 entre 2 son 15.000 por persona: entra.
    expect(ok(beacon({ search: { ...BEACON_REAL.search, adults: 2 }, items: tarjeta(30000) })).minPricePp).toBe(15000)
  })
})

describe('isPlausiblePrice', () => {
  const cfg = SITE_SEARCH_PLAUSIBLE

  it('acepta dentro de la banda, con límites inclusivos', () => {
    expect(cfg).toEqual({ min: 0.5, max: 4, refDays: 7 })
    expect(isPlausiblePrice(500, 1000, cfg)).toBe(true)
    expect(isPlausiblePrice(4000, 1000, cfg)).toBe(true)
    expect(isPlausiblePrice(900, 1000, cfg)).toBe(true)
  })

  it('rechaza fuera de la banda', () => {
    expect(isPlausiblePrice(499.99, 1000, cfg)).toBe(false)
    expect(isPlausiblePrice(4000.01, 1000, cfg)).toBe(false)
    expect(isPlausiblePrice(80, 1000, cfg)).toBe(false)
  })

  it('sin referencia acepta', () => {
    expect(isPlausiblePrice(1, null, cfg)).toBe(true)
    expect(isPlausiblePrice(1, 0, cfg)).toBe(true)
  })
})

describe('siteSearchDestinationLabel', () => {
  it('nunca devuelve el código pelado', () => {
    expect(siteSearchDestinationLabel({ destinationCode: 'MIA', destinationName: 'Miami FL' }, 'Miami')).toBe('Miami FL')
    expect(siteSearchDestinationLabel({ destinationCode: 'MIA', destinationName: null }, 'Miami')).toBe('Miami')
    expect(siteSearchDestinationLabel({ destinationCode: 'MIA', destinationName: null }, null)).toBe('MIA (búsqueda web)')
  })
})

describe('siteSearchKey', () => {
  it('es estable y cambia con la ruta, las fechas o los pasajeros', () => {
    const a = ok(beacon())
    expect(siteSearchKey(a)).toBe(siteSearchKey(ok(beacon())))
    expect(siteSearchKey(a)).toBe('BUE|MIA|2027-09-03|2027-09-10|1|0|0')
    expect(siteSearchKey(a)).not.toBe(siteSearchKey(ok(conSearch({ infants: 1 }))))
    expect(siteSearchKey(a)).not.toBe(siteSearchKey(ok(conSearch({ adults: 2 }))))
    expect(siteSearchKey(a)).not.toBe(siteSearchKey(ok(conSearch({ endDate: '2027-09-11' }))))
  })
})

describe('siteSearchOriginAllowed', () => {
  const con = (origin: string | null) => new Headers(origin === null ? {} : { Origin: origin })

  it('acepta los orígenes de siviajo.com, con o sin barra final', () => {
    expect(siteSearchOriginAllowed(con('https://www.siviajo.com'), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(true)
    expect(siteSearchOriginAllowed(con('https://www.siviajo.com/'), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(true)
    expect(siteSearchOriginAllowed(con('https://siviajo.com'), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(true)
  })

  it('rechaza lo demás', () => {
    expect(siteSearchOriginAllowed(con('https://www.siviajo.com.evil.com'), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(false)
    expect(siteSearchOriginAllowed(con('http://www.siviajo.com'), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(false)
    expect(siteSearchOriginAllowed(con('null'), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(false)
    expect(siteSearchOriginAllowed(con(null), SITE_SEARCH_ALLOWED_ORIGINS)).toBe(false)
  })
})

describe('siteSearchBeaconSchema', () => {
  it('rechaza otra versión y más de 60 tarjetas', () => {
    expect(siteSearchBeaconSchema.safeParse({ ...BEACON_REAL, v: 2 }).success).toBe(false)
    const items = Array.from({ length: 61 }, () => BEACON_REAL.items[0])
    expect(siteSearchBeaconSchema.safeParse({ ...BEACON_REAL, items }).success).toBe(false)
  })

  it('las claves de más no rompen (zod las ignora)', () => {
    const r = siteSearchBeaconSchema.safeParse({ ...BEACON_REAL, cosa: { rara: true }, search: { ...BEACON_REAL.search, extra: 1 } })
    expect(r.success).toBe(true)
    expect(r.success && 'cosa' in r.data).toBe(false)
  })
})

describe('aggregateSiteSearchStats', () => {
  const fila = (over: Partial<SiteSearchStatRow>): SiteSearchStatRow => ({
    probed_at: '2026-10-17T10:00:00.000Z',
    origin: 'BUE',
    destination: 'Miami FL',
    destination_code: 'MIA',
    route_id: 7,
    price_per_pax: 900,
    status: 'ok',
    ...over,
  })

  it('cuenta por día (con ceros) y arma el top de rutas', () => {
    const rows = [
      fila({}),
      fila({ probed_at: '2026-10-17T11:00:00.000Z', price_per_pax: '850.5' }),
      fila({ probed_at: '2026-10-15T09:00:00.000Z', status: 'empty', price_per_pax: null }),
      fila({ probed_at: '2026-10-16T09:00:00.000Z', destination: 'Cancún', destination_code: 'CUN', route_id: null, price_per_pax: 700 }),
      fila({ probed_at: '2026-10-16T09:30:00.000Z', destination: 'MAD', destination_code: 'MAD', route_id: null, price_per_pax: 1100 }),
      // Fuera de la ventana: no se cuenta.
      fila({ probed_at: '2026-10-01T09:00:00.000Z' }),
    ]
    const stats = aggregateSiteSearchStats(rows, 7, HOY)

    expect(stats.perDay.map(d => d.day)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(stats.perDay.find(d => d.day === '2026-10-17')).toEqual({ day: '2026-10-17', searches: 2, withRoute: 2 })
    expect(stats.perDay.find(d => d.day === '2026-10-16')).toEqual({ day: '2026-10-16', searches: 2, withRoute: 0 })
    expect(stats.perDay.find(d => d.day === '2026-10-12')).toEqual({ day: '2026-10-12', searches: 0, withRoute: 0 })

    expect(stats.topRoutes).toEqual([
      { origin: 'BUE', destinationCode: 'MIA', destinationName: 'Miami FL', searches: 3, minPricePp: 850.5, routeId: 7 },
      // Empate en búsquedas: primero la más barata.
      { origin: 'BUE', destinationCode: 'CUN', destinationName: 'Cancún', searches: 1, minPricePp: 700, routeId: null },
      // Sin nombre (vino sólo el código): null.
      { origin: 'BUE', destinationCode: 'MAD', destinationName: null, searches: 1, minPricePp: 1100, routeId: null },
    ])
  })

  it('sin filas devuelve los días en cero y ninguna ruta', () => {
    const stats = aggregateSiteSearchStats([], 3, HOY)
    expect(stats.perDay).toEqual([
      { day: '2026-10-15', searches: 0, withRoute: 0 },
      { day: '2026-10-16', searches: 0, withRoute: 0 },
      { day: '2026-10-17', searches: 0, withRoute: 0 },
    ])
    expect(stats.topRoutes).toEqual([])
  })

  it('el top se corta en 10', () => {
    const rows = Array.from({ length: 15 }, (_, i) => fila({ destination_code: `D${String(i).padStart(2, '0')}`, destination: null }))
    expect(aggregateSiteSearchStats(rows, 7, HOY).topRoutes).toHaveLength(10)
  })
})
