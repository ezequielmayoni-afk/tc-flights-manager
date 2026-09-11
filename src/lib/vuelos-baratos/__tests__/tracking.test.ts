import { describe, expect, it } from 'vitest'
import { MAX_TRACK_VALUE, isMetaEvent, metaCustomData, routeContentId, trackBeaconSchema } from '../tracking'

// El beacon lo manda el navegador de un visitante anónimo: todo lo que entra
// al endpoint pasa por este esquema antes de tocar la Conversions API.
describe('trackBeaconSchema', () => {
  const valido = {
    event: 'select_flight',
    event_id: '5f3d9b1a-0c2e-4a11-9b77-1d2e3f4a5b6c',
    url: 'https://vuelos.siviajo.com/vuelos-baratos/miami',
    fbp: 'fb.1.1700000000000.123456789',
    fbc: 'fb.1.1700000000000.abc',
    payload: { origin: 'BUE', destination: 'MIA', price_pp: 812, airline: null, month: '2026-12' },
  }

  it('acepta un beacon completo', () => {
    const parsed = trackBeaconSchema.parse(valido)
    expect(parsed.event).toBe('select_flight')
    expect(parsed.payload.price_pp).toBe(812)
  })

  it('deja el payload vacío si no viene', () => {
    const parsed = trackBeaconSchema.parse({ event: 'select_month', event_id: 'abcdefgh' })
    expect(parsed.payload).toEqual({})
  })

  it('rechaza un evento que no está en la lista', () => {
    expect(trackBeaconSchema.safeParse({ ...valido, event: 'purchase' }).success).toBe(false)
  })

  it('rechaza un event_id corto o con caracteres raros', () => {
    expect(trackBeaconSchema.safeParse({ ...valido, event_id: 'abc' }).success).toBe(false)
    expect(trackBeaconSchema.safeParse({ ...valido, event_id: 'abcdefg/h' }).success).toBe(false)
  })

  it('rechaza un payload con objetos anidados', () => {
    expect(trackBeaconSchema.safeParse({ ...valido, payload: { ruta: { origin: 'BUE' } } }).success).toBe(false)
    expect(trackBeaconSchema.safeParse({ ...valido, payload: { meses: ['2026-12'] } }).success).toBe(false)
  })

  it('rechaza una url que no es url', () => {
    expect(trackBeaconSchema.safeParse({ ...valido, url: 'vuelos.siviajo.com' }).success).toBe(false)
  })
})

describe('isMetaEvent', () => {
  it('separa los tres eventos de Meta del resto', () => {
    expect(isMetaEvent('view_destination')).toBe(true)
    expect(isMetaEvent('search_submit')).toBe(true)
    expect(isMetaEvent('select_flight')).toBe(true)
    expect(isMetaEvent('select_month')).toBe(false)
    expect(isMetaEvent('filter_change')).toBe(false)
    expect(isMetaEvent('change_origin')).toBe(false)
  })
})

describe('routeContentId', () => {
  it('arma el id de la ruta', () => {
    expect(routeContentId({ origin: 'BUE', destination: 'miami' })).toBe('BUE-miami')
  })

  it('devuelve null si falta alguno de los dos', () => {
    expect(routeContentId({ origin: 'BUE' })).toBeNull()
    expect(routeContentId({ destination: 'miami' })).toBeNull()
    expect(routeContentId({ origin: 'BUE', destination: null })).toBeNull()
    expect(routeContentId({ origin: 'BUE', destination: 12 })).toBeNull()
    expect(routeContentId({})).toBeNull()
  })
})

describe('metaCustomData', () => {
  it('arma el custom_data de view_destination', () => {
    expect(
      metaCustomData('view_destination', {
        slug: 'miami',
        origin: 'BUE',
        destination: 'MIA',
        destination_name: 'Miami',
        min_price: 812,
      })
    ).toEqual({
      content_type: 'flight_route',
      content_ids: ['BUE-MIA'],
      content_name: 'Miami',
      currency: 'USD',
      value: 812,
      origin: 'BUE',
      destination: 'MIA',
    })
  })

  it('sin precio confirmado no manda value, y el nombre cae al código', () => {
    const data = metaCustomData('view_destination', { origin: 'BUE', destination: 'MIA', min_price: null })
    expect(data).toEqual({
      content_type: 'flight_route',
      content_ids: ['BUE-MIA'],
      content_name: 'MIA',
      currency: 'USD',
      origin: 'BUE',
      destination: 'MIA',
    })
    expect('value' in data).toBe(false)
  })

  it('arma el custom_data de search_submit', () => {
    expect(
      metaCustomData('search_submit', {
        origin: 'BUE',
        destination: 'MIA',
        depart: '2026-12-02',
        return: '2026-12-10',
        adults: 2,
        children: 1,
      })
    ).toEqual({
      content_type: 'flight_route',
      content_ids: ['BUE-MIA'],
      search_string: 'BUE-MIA 2026-12-02/2026-12-10',
      origin: 'BUE',
      destination: 'MIA',
      depart: '2026-12-02',
      return: '2026-12-10',
      adults: 2,
      children: 1,
    })
  })

  it('en solo ida el search_string queda con la ruta y sin la clave return', () => {
    const data = metaCustomData('search_submit', {
      origin: 'BUE',
      destination: 'MIA',
      depart: '2026-12-02',
      return: null,
      adults: 1,
      children: 0,
    })
    expect(data.search_string).toBe('BUE-MIA')
    expect('return' in data).toBe(false)
  })

  it('arma el custom_data de select_flight', () => {
    expect(
      metaCustomData('select_flight', {
        origin: 'BUE',
        destination: 'MIA',
        depart: '2026-12-02',
        return: '2026-12-10',
        nights: 8,
        price_pp: 812,
        airline: 'AA',
        month: '2026-12',
      })
    ).toEqual({
      content_type: 'flight_route',
      content_ids: ['BUE-MIA'],
      contents: [{ id: 'BUE-MIA', quantity: 1, item_price: 812 }],
      currency: 'USD',
      value: 812,
      origin: 'BUE',
      destination: 'MIA',
      depart: '2026-12-02',
      return: '2026-12-10',
      nights: 8,
      airline: 'AA',
      month: '2026-12',
    })
  })

  it('airline en null viaja igual; el resto de los huecos se omiten', () => {
    const data = metaCustomData('select_flight', {
      origin: 'BUE',
      destination: 'MIA',
      price_pp: 500,
      airline: null,
    })
    expect(data.airline).toBeNull()
    expect(Object.keys(data).sort()).toEqual(
      ['airline', 'content_ids', 'content_type', 'contents', 'currency', 'destination', 'origin', 'value'].sort()
    )
  })

  it('sin ruta no manda content_ids ni contents', () => {
    const data = metaCustomData('select_flight', { price_pp: 500 })
    expect('content_ids' in data).toBe(false)
    expect('contents' in data).toBe(false)
    expect(data.value).toBe(500)
  })

  it('descarta los montos imposibles: el payload lo escribe el navegador', () => {
    // `value` es lo que Meta usa para repartir presupuesto: un monto inventado
    // desde afuera no puede llegar al dataset.
    for (const min_price of [-1, MAX_TRACK_VALUE + 1, Number.POSITIVE_INFINITY, Number.NaN]) {
      const data = metaCustomData('view_destination', { origin: 'BUE', destination: 'MIA', min_price })
      expect('value' in data).toBe(false)
    }
    expect(metaCustomData('view_destination', { origin: 'BUE', destination: 'MIA', min_price: 0 }).value).toBe(0)
    expect(
      metaCustomData('view_destination', { origin: 'BUE', destination: 'MIA', min_price: MAX_TRACK_VALUE }).value
    ).toBe(MAX_TRACK_VALUE)
  })

  it('un price_pp fuera de rango no manda value ni item_price', () => {
    const data = metaCustomData('select_flight', { origin: 'BUE', destination: 'MIA', price_pp: 999_999 })
    expect('value' in data).toBe(false)
    expect(data.contents).toEqual([{ id: 'BUE-MIA', quantity: 1 }])
  })

  it('nunca deja claves en undefined', () => {
    for (const data of [
      metaCustomData('view_destination', { origin: 'BUE' }),
      metaCustomData('search_submit', { destination: 'MIA' }),
      metaCustomData('select_flight', {}),
    ]) {
      expect(Object.values(data).every(valor => valor !== undefined)).toBe(true)
    }
  })
})
