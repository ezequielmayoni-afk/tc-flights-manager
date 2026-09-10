import { describe, expect, it } from 'vitest'
import {
  airlinesWithMin,
  applyFilters,
  bestOverall,
  bestPerMonth,
  bestPerPair,
  freshnessLabel,
  lastObservedAt,
  paginate,
  priceLimits,
  probeToPair,
  sortPairs,
  summarizeDestinations,
} from '../aggregates'
import type { BestPair, ExplorerFilters, LandingDestinationRow, LandingRouteRow, ProbeRow } from '../types'

function row(over: Partial<ProbeRow> = {}): ProbeRow {
  return {
    id: 1,
    route_id: 1,
    origin: 'BUE',
    destination: 'Miami',
    destination_code: 'MIA',
    departure_date: '2026-12-01',
    return_date: '2026-12-08',
    nights: 7,
    adults: 1,
    price_per_pax: 800,
    currency: 'USD',
    airline: 'American Airlines',
    airline_code: 'AA',
    stops: 0,
    stops_back: 0,
    direct: true,
    duration_minutes: 555,
    duration_back_minutes: 540,
    fare_family: 'BASIC',
    checked_bag: false,
    carry_on: true,
    options: null,
    status: 'ok',
    source: 'cotizador_probe',
    job_id: null,
    probed_at: '2026-09-09T03:00:00.000Z',
    ...over,
  }
}

function pair(over: Partial<BestPair> = {}): BestPair {
  return {
    probeId: 1,
    routeId: 1,
    depart: '2026-12-01',
    return: '2026-12-08',
    nights: 7,
    pricePp: 800,
    currency: 'USD',
    airline: 'American Airlines',
    airlineCode: 'AA',
    stopsOut: 0,
    stopsBack: 0,
    durationOutMin: 555,
    durationBackMin: 540,
    fareFamily: 'BASIC',
    checkedBag: false,
    carryOn: true,
    observedAt: '2026-09-09T03:00:00.000Z',
    ...over,
  }
}

const FILTROS: ExplorerFilters = { sort: 'price', dir: 'asc', page: 1 }

describe('probeToPair', () => {
  it('convierte una sonda ok', () => {
    const p = probeToPair(row())
    expect(p?.pricePp).toBe(800)
    expect(p?.depart).toBe('2026-12-01')
    expect(p?.nights).toBe(7)
  })

  it('descarta lo que no sirve para la landing', () => {
    expect(probeToPair(row({ status: 'empty' }))).toBeNull()
    expect(probeToPair(row({ status: 'error' }))).toBeNull()
    expect(probeToPair(row({ price_per_pax: null }))).toBeNull()
    expect(probeToPair(row({ price_per_pax: 0 }))).toBeNull()
    expect(probeToPair(row({ return_date: null }))).toBeNull()
  })
})

describe('bestPerPair', () => {
  it('se queda con el precio más bajo por par', () => {
    const pares = bestPerPair(
      [row({ id: 1, price_per_pax: 900 }), row({ id: 2, price_per_pax: 750 }), row({ id: 3, price_per_pax: 820 })],
      { fromDate: '2026-09-09' }
    )
    expect(pares).toHaveLength(1)
    expect(pares[0].pricePp).toBe(750)
    expect(pares[0].probeId).toBe(2)
  })

  it('en empate gana la observación más reciente', () => {
    const pares = bestPerPair(
      [
        row({ id: 1, price_per_pax: 750, probed_at: '2026-09-08T03:00:00.000Z' }),
        row({ id: 2, price_per_pax: 750, probed_at: '2026-09-09T03:00:00.000Z' }),
      ],
      { fromDate: '2026-09-09' }
    )
    expect(pares[0].probeId).toBe(2)
  })

  it('ignora sondas sin precio, con status distinto de ok y salidas anteriores a fromDate', () => {
    const pares = bestPerPair(
      [
        row({ id: 1, departure_date: '2026-09-01', return_date: '2026-09-08' }),
        row({ id: 2, status: 'timeout' }),
        row({ id: 3, price_per_pax: null }),
        row({ id: 4, departure_date: '2026-12-20', return_date: '2026-12-27', price_per_pax: 990 }),
      ],
      { fromDate: '2026-09-09' }
    )
    expect(pares.map((p) => p.probeId)).toEqual([4])
  })
})

describe('bestPerMonth', () => {
  it('devuelve una entrada por mes pedido, con null donde no hay datos', () => {
    const meses = bestPerMonth(
      [pair({ depart: '2026-12-01', return: '2026-12-08', pricePp: 800 }), pair({ depart: '2026-12-15', return: '2026-12-22', pricePp: 700 })],
      ['2026-11', '2026-12', '2027-01']
    )
    expect(meses).toHaveLength(3)
    expect(meses[0]).toEqual({ month: '2026-11', label: 'Noviembre 2026', minPrice: null, pairs: 0 })
    expect(meses[1].minPrice).toBe(700)
    expect(meses[1].pairs).toBe(2)
    expect(meses[2].minPrice).toBeNull()
  })
})

describe('resúmenes simples', () => {
  const pares = [pair({ pricePp: 800 }), pair({ depart: '2026-12-15', return: '2026-12-22', pricePp: 650 })]

  it('bestOverall, lastObservedAt y priceLimits', () => {
    expect(bestOverall(pares)?.pricePp).toBe(650)
    expect(bestOverall([])).toBeNull()
    expect(lastObservedAt([pair({ observedAt: '2026-09-01T00:00:00.000Z' }), pair({ observedAt: '2026-09-05T00:00:00.000Z' })])).toBe('2026-09-05T00:00:00.000Z')
    expect(lastObservedAt([])).toBeNull()
    expect(priceLimits(pares)).toEqual({ min: 650, max: 800 })
    expect(priceLimits([])).toBeNull()
  })

  it('airlinesWithMin agrupa y ordena por precio', () => {
    const lista = airlinesWithMin([
      pair({ airline: 'American Airlines', airlineCode: 'AA', pricePp: 800 }),
      pair({ airline: 'American Airlines', airlineCode: 'AA', pricePp: 900 }),
      pair({ airline: 'Copa', airlineCode: 'CM', pricePp: 700 }),
    ])
    expect(lista).toEqual([
      { airline: 'Copa', code: 'CM', minPrice: 700, count: 1 },
      { airline: 'American Airlines', code: 'AA', minPrice: 800, count: 2 },
    ])
  })
})

describe('applyFilters', () => {
  const pares = [
    pair({ depart: '2026-12-01', return: '2026-12-08', nights: 7, pricePp: 800, stopsOut: 0, stopsBack: 0 }),
    pair({ depart: '2027-01-05', return: '2027-01-19', nights: 14, pricePp: 650, stopsOut: 1, stopsBack: 1, airline: 'Copa', airlineCode: 'CM' }),
    pair({ depart: '2027-01-12', return: '2027-01-19', nights: 7, pricePp: 1200, stopsOut: 2, stopsBack: 3, airline: 'Latam', airlineCode: 'LA' }),
    pair({ depart: '2027-02-02', return: '2027-02-09', nights: 7, pricePp: 900, stopsOut: null, stopsBack: null }),
    pair({ depart: '2027-02-05', return: '2027-02-12', nights: 7, pricePp: 1000, stopsOut: 0, stopsBack: null, airline: 'Iberia', airlineCode: 'IB' }),
  ]

  it('filtra por mes', () => {
    expect(applyFilters(pares, { ...FILTROS, month: '2027-01' }).map((p) => p.depart)).toEqual(['2027-01-05', '2027-01-12'])
  })

  it('filtra por directo (la vuelta sin dato de escalas no lo descarta)', () => {
    expect(applyFilters(pares, { ...FILTROS, direct: true }).map((p) => p.depart)).toEqual(['2026-12-01', '2027-02-05'])
  })

  it('filtra por escalas (2 = dos o más, y sin dato no pasa)', () => {
    expect(applyFilters(pares, { ...FILTROS, stops: 0 }).map((p) => p.depart)).toEqual(['2026-12-01', '2027-02-05'])
    expect(applyFilters(pares, { ...FILTROS, stops: 1 }).map((p) => p.depart)).toEqual(['2027-01-05'])
    expect(applyFilters(pares, { ...FILTROS, stops: 2 }).map((p) => p.depart)).toEqual(['2027-01-12'])
  })

  it('filtra por estadía, rangos de fecha, días de semana, precio y aerolínea', () => {
    expect(applyFilters(pares, { ...FILTROS, stayMin: 8 }).map((p) => p.nights)).toEqual([14])
    expect(applyFilters(pares, { ...FILTROS, stayMax: 7 })).toHaveLength(4)
    expect(applyFilters(pares, { ...FILTROS, departFrom: '2027-01-05', departTo: '2027-01-12' })).toHaveLength(2)
    expect(applyFilters(pares, { ...FILTROS, returnFrom: '2027-02-09' })).toHaveLength(2)
    expect(applyFilters(pares, { ...FILTROS, returnTo: '2026-12-08' })).toHaveLength(1)
    expect(applyFilters(pares, { ...FILTROS, departDow: [2] }).map((p) => p.depart)).toEqual(['2026-12-01', '2027-01-05', '2027-01-12', '2027-02-02'])
    expect(applyFilters(pares, { ...FILTROS, returnDow: [5] }).map((p) => p.depart)).toEqual(['2027-02-05'])
    expect(applyFilters(pares, { ...FILTROS, priceMin: 700, priceMax: 900 }).map((p) => p.pricePp)).toEqual([800, 900])
    expect(applyFilters(pares, { ...FILTROS, airlines: ['cm', 'la'] }).map((p) => p.airlineCode)).toEqual(['CM', 'LA'])
    expect(applyFilters(pares, { ...FILTROS, airlines: ['copa'] }).map((p) => p.airlineCode)).toEqual(['CM'])
  })
})

describe('sortPairs', () => {
  const pares = [
    pair({ depart: '2026-12-01', return: '2026-12-08', nights: 7, pricePp: 800, stopsOut: 1, durationOutMin: 700, airline: 'Latam' }),
    pair({ depart: '2027-01-05', return: '2027-01-19', nights: 14, pricePp: 650, stopsOut: 0, durationOutMin: 555, airline: 'Copa' }),
    pair({ depart: '2026-11-10', return: '2026-11-17', nights: 7, pricePp: 900, stopsOut: null, durationOutMin: null, airline: 'Aerolíneas' }),
  ]

  it('ordena por cada clave y no muta', () => {
    const copia = [...pares]
    expect(sortPairs(pares, 'price', 'asc').map((p) => p.pricePp)).toEqual([650, 800, 900])
    expect(sortPairs(pares, 'price', 'desc').map((p) => p.pricePp)).toEqual([900, 800, 650])
    expect(sortPairs(pares, 'depart', 'asc').map((p) => p.depart)).toEqual(['2026-11-10', '2026-12-01', '2027-01-05'])
    expect(sortPairs(pares, 'return', 'asc').map((p) => p.return)).toEqual(['2026-11-17', '2026-12-08', '2027-01-19'])
    expect(sortPairs(pares, 'nights', 'desc').map((p) => p.nights)).toEqual([14, 7, 7])
    expect(sortPairs(pares, 'airline', 'asc').map((p) => p.airline)).toEqual(['Aerolíneas', 'Copa', 'Latam'])
    expect(pares).toEqual(copia)
  })

  it('manda los nulos al final en duración y escalas', () => {
    expect(sortPairs(pares, 'duration', 'asc').map((p) => p.durationOutMin)).toEqual([555, 700, null])
    expect(sortPairs(pares, 'duration', 'desc').map((p) => p.durationOutMin)).toEqual([700, 555, null])
    expect(sortPairs(pares, 'stops', 'asc').map((p) => p.stopsOut)).toEqual([0, 1, null])
    expect(sortPairs(pares, 'stops', 'desc').map((p) => p.stopsOut)).toEqual([1, 0, null])
  })
})

describe('paginate', () => {
  it('corta y clampea la página', () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    expect(paginate(items, 1, 10)).toEqual({ items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], page: 1, pages: 3, total: 25 })
    expect(paginate(items, 9, 10).page).toBe(3)
    expect(paginate(items, -3, 10).page).toBe(1)
    expect(paginate([], 2, 10)).toEqual({ items: [], page: 1, pages: 1, total: 0 })
  })
})

describe('freshnessLabel', () => {
  const ahora = new Date('2026-09-09T12:00:00.000Z')

  it('describe la antigüedad en minutos, horas y días', () => {
    expect(freshnessLabel('2026-09-09T11:55:00.000Z', ahora)).toBe('hace 5 min')
    expect(freshnessLabel('2026-09-09T06:00:00.000Z', ahora)).toBe('hace 6 h')
    expect(freshnessLabel('2026-09-07T10:00:00.000Z', ahora)).toBe('hace 2 días')
  })

  it('futuro o inválido es "recién"', () => {
    expect(freshnessLabel('2026-09-09T13:00:00.000Z', ahora)).toBe('recién')
    expect(freshnessLabel('no es una fecha', ahora)).toBe('recién')
  })
})

describe('summarizeDestinations', () => {
  const destinos: LandingDestinationRow[] = [
    { code: 'MIA', slug: 'miami', name: 'Miami', tc_code: 'MIA', iata_display: 'MIA', haul: 'long', seo_title: null, seo_description: null, hero_image_url: null, faq: [], active: true, sort_order: 10 },
    { code: 'RIO', slug: 'rio-de-janeiro', name: 'Río de Janeiro', tc_code: 'RIO', iata_display: 'GIG', haul: 'short', seo_title: null, seo_description: null, hero_image_url: null, faq: [], active: true, sort_order: 30 },
    { code: 'MAD', slug: 'madrid', name: 'Madrid', tc_code: 'MAD', iata_display: 'MAD', haul: 'long', seo_title: null, seo_description: null, hero_image_url: null, faq: [], active: false, sort_order: 20 },
  ]
  const rutas: LandingRouteRow[] = [
    { id: 1, destination_code: 'MIA', origin_tc_code: 'BUE', origin_name: 'Buenos Aires', stay_nights: [7], weekdays: [2], probes_per_month: 8, scan_per_month: 8, confirm_per_month: 3, months_ahead: 12, active: true },
    { id: 2, destination_code: 'RIO', origin_tc_code: 'BUE', origin_name: 'Buenos Aires', stay_nights: [4], weekdays: [2], probes_per_month: 8, scan_per_month: 8, confirm_per_month: 3, months_ahead: 12, active: true },
    { id: 3, destination_code: 'MAD', origin_tc_code: 'BUE', origin_name: 'Buenos Aires', stay_nights: [7], weekdays: [2], probes_per_month: 8, scan_per_month: 8, confirm_per_month: 3, months_ahead: 12, active: true },
    { id: 4, destination_code: 'MIA', origin_tc_code: 'CRD', origin_name: 'Córdoba', stay_nights: [7], weekdays: [2], probes_per_month: 4, scan_per_month: 4, confirm_per_month: 3, months_ahead: 12, active: false },
  ]

  it('resume por ruta activa e incluye las rutas sin datos', () => {
    const resumen = summarizeDestinations({
      rowsByRoute: new Map([[1, [row({ id: 1, route_id: 1, price_per_pax: 800 }), row({ id: 2, route_id: 1, price_per_pax: 700, probed_at: '2026-09-09T04:00:00.000Z' })]]]),
      routes: rutas,
      destinations: destinos,
      fromDate: '2026-09-09',
    })
    expect(resumen.map((d) => d.code)).toEqual(['MIA', 'RIO'])
    expect(resumen[0]).toEqual({ code: 'MIA', slug: 'miami', name: 'Miami', originCode: 'BUE', routeId: 1, minPrice: 700, observedAt: '2026-09-09T04:00:00.000Z', pairs: 1 })
    expect(resumen[1]).toEqual({ code: 'RIO', slug: 'rio-de-janeiro', name: 'Río de Janeiro', originCode: 'BUE', routeId: 2, minPrice: null, observedAt: null, pairs: 0 })
  })
})
