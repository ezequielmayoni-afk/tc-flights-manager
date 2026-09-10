import { describe, expect, it } from 'vitest'
import { buildPackageQuoteRequest, hotelTokens, optionMentionsHotel, pickMatchingOption, starsFromCategory, type PackageForRequote } from '../package-request'

const puntaCana: PackageForRequote = {
  id: 16, tc_package_id: 38204302, origin_code: 'BUE', departure_date: '2026-11-03', flight_departure_date: '2026-11-03',
  nights_count: 9, adults_count: 2, children_count: 0, tours_count: 0, isCupo: false, profile: { cotizador_instance: 'emisivo' },
  hotels: [
    { hotel_name: 'VIK Hotel Arena Blanca', hotel_category: 'S4', stars: null, nights: 5, board_type: 'ALL INCLUSIVE', board_name: 'ALL INCLUSIVE', destination_code: null, check_in_date: '2026-11-03', sort_order: 0 },
    { hotel_name: 'Whala!Bayahibe', hotel_category: 'S4', stars: null, nights: 4, board_type: 'ALL INCLUSIVE', board_name: null, destination_code: null, check_in_date: '2026-11-08', sort_order: 1 },
  ],
  transports: [
    { transport_type: 'FLIGHT', origin_code: 'EZE', departure_date: '2026-11-03', num_segments: 1, sort_order: 0, day: 1 },
    { transport_type: 'FLIGHT', origin_code: 'PUJ', departure_date: '2026-11-12', num_segments: 1, sort_order: 1, day: 10 },
  ],
  destinations: [
    { destination_code: 'PUJ', destination_name: 'Punta Cana', sort_order: 0 },
    { destination_code: 'BAY', destination_name: 'Bayahibe', sort_order: 1 },
  ],
}

describe('buildPackageQuoteRequest', () => {
  it('arma un tramo por hotel con el destino, las noches, el régimen y el hotel del paquete', () => {
    const r = buildPackageQuoteRequest(puntaCana)
    if (!r.ok) throw new Error(r.reason)
    expect(r.request.origen).toBe('EZE')
    expect(r.request.fecha_inicio).toBe('2026-11-03')
    expect(r.request.tramos).toEqual([
      { destino: 'Destination::PUJ', noches: 5, regimen: 'all_inclusive', hotel_preferido: 'VIK Hotel Arena Blanca', estrellas_min: 4 },
      { destino: 'Destination::BAY', noches: 4, regimen: 'all_inclusive', hotel_preferido: 'Whala!Bayahibe', estrellas_min: 4 },
    ])
    expect(r.request.adultos).toBe(2); expect(r.request.menores).toEqual([])
    expect(r.request.vuelo_directo).toBe(true)
    expect(r.request.tipo_paquete).toBe('vuelo_hotel')
    expect(r.instance).toBe('emisivo')
    expect(r.expectedHotels).toEqual(['VIK Hotel Arena Blanca', 'Whala!Bayahibe'])
  })
  it('un solo hotel sin noches propias toma las del paquete; sin nombre no pide hotel preferido; escala si el vuelo tiene escala', () => {
    const r = buildPackageQuoteRequest({ ...puntaCana, nights_count: 7, hotels: [{ ...puntaCana.hotels[0], hotel_name: null, nights: null, hotel_category: null }], transports: [{ ...puntaCana.transports[0], num_segments: 2 }], destinations: [puntaCana.destinations[0]] })
    if (!r.ok) throw new Error(r.reason)
    expect(r.request.tramos[0]).toEqual({ destino: 'Destination::PUJ', noches: 7, regimen: 'all_inclusive', estrellas_min: 3 })
    expect(r.request.vuelo_directo).toBe(false)
    expect(r.expectedHotels).toEqual([])
  })
  it('menores viajan con edad por defecto y el origen cae al del paquete si no hay vuelo', () => {
    const r = buildPackageQuoteRequest({ ...puntaCana, children_count: 2, transports: [] })
    if (!r.ok) throw new Error(r.reason)
    expect(r.request.menores).toEqual([8, 8]); expect(r.request.origen).toBe('BUE'); expect(r.request.tipo_paquete).toBe('solo_hotel')
  })
  it('no recotiza cupos, circuitos ni paquetes sin hotel o sin fecha', () => {
    expect(buildPackageQuoteRequest({ ...puntaCana, isCupo: true })).toMatchObject({ ok: false, reason: expect.stringContaining('cupo') })
    expect(buildPackageQuoteRequest({ ...puntaCana, tours_count: 1 })).toMatchObject({ ok: false, reason: expect.stringContaining('Circuito') })
    expect(buildPackageQuoteRequest({ ...puntaCana, hotels: [] })).toMatchObject({ ok: false })
    expect(buildPackageQuoteRequest({ ...puntaCana, departure_date: null, flight_departure_date: null, hotels: [{ ...puntaCana.hotels[0], check_in_date: null }] })).toMatchObject({ ok: false, reason: expect.stringContaining('fecha') })
  })
  it('la instancia nacional viene del perfil', () => {
    const r = buildPackageQuoteRequest({ ...puntaCana, profile: { cotizador_instance: 'nacional' } })
    expect(r.ok && r.instance).toBe('nacional')
  })
})

describe('hotel matching', () => {
  it('saca palabras vacías y acentos', () => {
    expect(hotelTokens('VIK Hotel Arena Blanca All Inclusive')).toEqual(['vik', 'arena', 'blanca'])
    expect(hotelTokens('Whala!Bayahibe')).toEqual(['whala', 'bayahibe'])
  })
  it('reconoce el hotel aunque el cotizador lo escriba distinto', () => {
    expect(optionMentionsHotel({ hotel: { nombre: 'Vik Arena Blanca Punta Cana' } }, 'VIK Hotel Arena Blanca')).toBe(true)
    expect(optionMentionsHotel({ hotel: { nombre: 'Whala! Bávaro' } }, 'Whala!Bayahibe')).toBe(false)
    expect(optionMentionsHotel({ hotel: { nombre: 'Beach Paradise Apartments' } }, 'VIK Hotel Arena Blanca')).toBe(false)
  })
  it('elige la opción más barata que trae el hotel; si ninguna lo trae, la más barata con matched false', () => {
    const res = { status: 'ok', opciones: [
      { precio_pp_final: 1300, hotel: { nombre: 'Otro Resort' } },
      { precio_pp_final: 1550, hotel: { nombre: 'VIK Arena Blanca' } },
      { precio_pp_final: 1500, hotel: { nombre: 'Vik Hotel Arena Blanca All Inclusive' } },
    ] }
    const p = pickMatchingOption(res, ['VIK Hotel Arena Blanca'])
    expect(p.matched).toBe(true); expect(p.option?.precio_pp_final).toBe(1500)
    const q = pickMatchingOption(res, ['Whala!Bayahibe'])
    expect(q.matched).toBe(false); expect(q.option?.precio_pp_final).toBe(1300)
    expect(pickMatchingOption({ status: 'ok', opciones: [] }, ['x']).option).toBeNull()
  })
  it('starsFromCategory lee S4, 4* y 5 estrellas', () => {
    expect(starsFromCategory('S4')).toBe(4); expect(starsFromCategory('5 estrellas')).toBe(5); expect(starsFromCategory(null)).toBeNull()
  })
})
