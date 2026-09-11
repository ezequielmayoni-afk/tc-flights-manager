import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildBeacon, fbcFromUrl, newEventId, readCookie, track } from '../track-client'
import { EVENT_ID_RE, TRACK_PATH } from '../tracking'

// El emisor corre en el navegador de un visitante: acá se simula `window` con
// lo mínimo que usa (`dataLayer`, `location`) para poder testearlo en node.

const HREF = 'https://vuelos.siviajo.com/vuelos-baratos/miami?fbclid=abc'

interface WindowFalso {
  dataLayer?: Array<Record<string, unknown>>
  location: { href: string }
}

function montarWindow(): WindowFalso {
  const ventana: WindowFalso = { location: { href: HREF } }
  vi.stubGlobal('window', ventana)
  return ventana
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newEventId', () => {
  it('devuelve un id que pasa el esquema del beacon', () => {
    expect(newEventId()).toMatch(EVENT_ID_RE)
  })

  it('sin crypto.randomUUID cae al id de respaldo, que también pasa', () => {
    vi.stubGlobal('crypto', {})
    expect(newEventId()).toMatch(EVENT_ID_RE)
  })
})

describe('readCookie', () => {
  it('encuentra la cookie entre varias', () => {
    const cookie = '_ga=GA1.1.123; _fbp=fb.1.1700000000000.999; _fbc=fb.1.1700000000000.abc'
    expect(readCookie('_fbp', cookie)).toBe('fb.1.1700000000000.999')
    expect(readCookie('_fbc', cookie)).toBe('fb.1.1700000000000.abc')
    expect(readCookie('_ga', cookie)).toBe('GA1.1.123')
  })

  it('no confunde una cookie con otra que la contiene', () => {
    expect(readCookie('_fb', '_fbp=fb.1.1.2')).toBeNull()
    expect(readCookie('_fbp', '')).toBeNull()
  })

  it('desescapa el valor', () => {
    expect(readCookie('ruta', 'ruta=BUE%2FMIA')).toBe('BUE/MIA')
  })
})

describe('fbcFromUrl', () => {
  it('arma el _fbc con el formato oficial', () => {
    expect(fbcFromUrl('https://vuelos.siviajo.com/?fbclid=abc', 1700000000000)).toBe('fb.1.1700000000000.abc')
  })

  it('devuelve null sin fbclid o con una url rota', () => {
    expect(fbcFromUrl('https://vuelos.siviajo.com/vuelos-baratos/miami', 1700000000000)).toBeNull()
    expect(fbcFromUrl('no soy una url', 1700000000000)).toBeNull()
  })
})

describe('buildBeacon', () => {
  it('prefiere la cookie _fbc antes que el fbclid de la URL', () => {
    const beacon = buildBeacon('view_destination', 'abcdefgh', { origin: 'BUE', destination: 'MIA' }, {
      href: HREF,
      cookie: '_fbp=fb.1.1.999; _fbc=fb.1.1.desde-cookie',
      now: 1700000000000,
    })
    expect(beacon).toEqual({
      event: 'view_destination',
      event_id: 'abcdefgh',
      url: HREF,
      fbp: 'fb.1.1.999',
      fbc: 'fb.1.1.desde-cookie',
      payload: { origin: 'BUE', destination: 'MIA' },
    })
  })

  it('sin cookie _fbc usa el fbclid del primer click de la campaña', () => {
    const beacon = buildBeacon('search_submit', 'abcdefgh', {}, { href: HREF, cookie: '', now: 1700000000000 })
    expect(beacon.fbc).toBe('fb.1.1700000000000.abc')
    expect('fbp' in beacon).toBe(false)
  })

  it('sin cookies ni fbclid no inventa claves', () => {
    const beacon = buildBeacon('select_flight', 'abcdefgh', {}, {
      href: 'https://vuelos.siviajo.com/vuelos-baratos/miami',
      cookie: '',
      now: 1700000000000,
    })
    expect(Object.keys(beacon).sort()).toEqual(['event', 'event_id', 'payload', 'url'])
  })
})

describe('track', () => {
  it('empuja al dataLayer con el event_id y manda el beacon de los eventos de Meta', () => {
    const ventana = montarWindow()
    // Devuelve true como el navegador cuando encola bien el beacon.
    const sendBeacon = vi.fn((url: string, body?: BodyInit) => Boolean(url) && Boolean(body))
    vi.stubGlobal('navigator', { sendBeacon })

    const eventId = track('select_flight', { origin: 'BUE', destination: 'MIA', price_pp: 812 })

    expect(eventId).toMatch(EVENT_ID_RE)
    expect(ventana.dataLayer).toEqual([
      { event: 'select_flight', event_id: eventId, origin: 'BUE', destination: 'MIA', price_pp: 812 },
    ])
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0][0]).toBe(TRACK_PATH)
  })

  it('los eventos que son sólo de GA4 no pegan en la CAPI', () => {
    const ventana = montarWindow()
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon })

    track('select_month', { slug: 'miami', origin: 'BUE', month: '2026-12' })

    expect(ventana.dataLayer).toHaveLength(1)
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('si sendBeacon devuelve false cae a fetch con keepalive', () => {
    montarWindow()
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) })
    const fetchFalso = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchFalso)

    track('view_destination', { origin: 'BUE', destination: 'MIA' })

    expect(fetchFalso).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(TRACK_PATH)
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(String(init.body)).event).toBe('view_destination')
  })

  it('sin navigator no lanza y devuelve igual el event_id', () => {
    montarWindow()
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))))

    expect(() => track('view_destination', { origin: 'BUE', destination: 'MIA' })).not.toThrow()
    expect(track('view_destination', {})).toMatch(EVENT_ID_RE)
  })

  it('sin window (SSR) devuelve un id y no toca nada', () => {
    vi.stubGlobal('window', undefined)
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon })

    expect(track('view_destination', { origin: 'BUE', destination: 'MIA' })).toMatch(EVENT_ID_RE)
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('un dataLayer que lanza no rompe el click', () => {
    vi.stubGlobal('window', {
      location: { href: HREF },
      dataLayer: {
        push() {
          throw new Error('bloqueador de anuncios')
        },
      },
    })

    expect(() => track('select_flight', { origin: 'BUE', destination: 'MIA' })).not.toThrow()
  })
})
