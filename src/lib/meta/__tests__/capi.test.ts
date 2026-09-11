import { describe, expect, it, vi } from 'vitest'
import { buildMetaEvent, sendMetaEvents, type MetaServerEvent } from '../capi'
import { trackBeaconSchema } from '@/lib/vuelos-baratos/tracking'

// Sin red: `sendMetaEvents` recibe el fetch por parámetro (una llamada de
// verdad a graph.facebook.com necesitaría el token de producción).

const AHORA = new Date('2026-09-11T12:00:30.750Z')
const HOSTS = ['vuelos.siviajo.com', 'hub.siviajo.com']

function beacon(extra: Record<string, unknown> = {}) {
  return trackBeaconSchema.parse({
    event: 'view_destination',
    event_id: '5f3d9b1a-0c2e-4a11-9b77-1d2e3f4a5b6c',
    url: 'https://vuelos.siviajo.com/vuelos-baratos/miami',
    fbp: 'fb.1.1700000000000.999',
    fbc: 'fb.1.1700000000000.abc',
    payload: { origin: 'BUE', destination: 'MIA', destination_name: 'Miami', min_price: 812 },
    ...extra,
  })
}

describe('buildMetaEvent', () => {
  it('traduce el beacon al evento de la CAPI', () => {
    const evento = buildMetaEvent(beacon(), { ip: '1.2.3.4', userAgent: 'Mozilla/5.0', now: AHORA, allowedHosts: HOSTS })
    expect(evento).toEqual({
      event_name: 'ViewContent',
      // Segundos, no milisegundos: el .750 se descarta.
      event_time: Math.floor(AHORA.getTime() / 1000),
      event_id: '5f3d9b1a-0c2e-4a11-9b77-1d2e3f4a5b6c',
      action_source: 'website',
      event_source_url: 'https://vuelos.siviajo.com/vuelos-baratos/miami',
      user_data: {
        client_ip_address: '1.2.3.4',
        client_user_agent: 'Mozilla/5.0',
        fbp: 'fb.1.1700000000000.999',
        fbc: 'fb.1.1700000000000.abc',
      },
      custom_data: {
        content_type: 'flight_route',
        content_ids: ['BUE-MIA'],
        content_name: 'Miami',
        currency: 'USD',
        value: 812,
        origin: 'BUE',
        destination: 'MIA',
      },
    })
  })

  it('mapea cada evento de Meta a su nombre', () => {
    const nombre = (event: string) =>
      buildMetaEvent(beacon({ event }), { ip: null, userAgent: null, now: AHORA, allowedHosts: HOSTS })?.event_name
    expect(nombre('view_destination')).toBe('ViewContent')
    expect(nombre('search_submit')).toBe('Search')
    expect(nombre('select_flight')).toBe('SelectFlight')
  })

  it('un evento que es sólo de GA4 no va a Meta', () => {
    for (const event of ['select_month', 'filter_change', 'change_origin']) {
      expect(buildMetaEvent(beacon({ event }), { ip: null, userAgent: null, now: AHORA, allowedHosts: HOSTS })).toBeNull()
    }
  })

  it('descarta el event_source_url de un host que no es nuestro', () => {
    const evento = buildMetaEvent(beacon({ url: 'https://otro-sitio.com/vuelos-baratos/miami' }), {
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      now: AHORA,
      allowedHosts: HOSTS,
    })
    expect(evento?.event_source_url).toBeUndefined()
  })

  it('no manda claves vacías en user_data', () => {
    const evento = buildMetaEvent(beacon({ fbp: undefined, fbc: undefined }), {
      ip: null,
      userAgent: null,
      now: AHORA,
      allowedHosts: HOSTS,
    })
    expect(evento?.user_data).toEqual({})
  })
})

describe('sendMetaEvents', () => {
  const evento: MetaServerEvent = {
    event_name: 'ViewContent',
    event_time: 1_757_592_030,
    event_id: 'abcdefgh',
    action_source: 'website',
    user_data: { client_ip_address: '1.2.3.4' },
  }

  function fetchFalso(status: number, cuerpo: unknown) {
    return vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }))
  }

  it('pega a la URL del dataset y devuelve los eventos recibidos', async () => {
    const fetchImpl = fetchFalso(200, { events_received: 1 })
    const resultado = await sendMetaEvents([evento], {
      datasetId: '1310175447121594',
      accessToken: 'TOKEN-DE-PRUEBA',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(resultado).toEqual({ ok: true, received: 1 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/1310175447121594/events')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.data).toHaveLength(1)
    expect(body.access_token).toBe('TOKEN-DE-PRUEBA')
    expect('test_event_code' in body).toBe(false)
  })

  it('manda el test_event_code sólo cuando se pasa', async () => {
    const fetchImpl = fetchFalso(200, { events_received: 1 })
    await sendMetaEvents([evento], {
      datasetId: '123',
      accessToken: 'TOKEN',
      testEventCode: 'TEST12345',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).test_event_code).toBe('TEST12345')
  })

  it('sin eventos no pega a la red', async () => {
    const fetchImpl = fetchFalso(200, {})
    expect(await sendMetaEvents([], { datasetId: '123', accessToken: 'TOKEN', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({
      ok: true,
      received: 0,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('un 400 de Meta no lanza y devuelve el mensaje sin el token', async () => {
    const fetchImpl = fetchFalso(400, { error: { message: 'Invalid parameter for TOKEN-DE-PRUEBA' } })
    const resultado = await sendMetaEvents([evento], {
      datasetId: '123',
      accessToken: 'TOKEN-DE-PRUEBA',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.received).toBe(0)
    expect(resultado.error).toBe('HTTP 400: Invalid parameter for ***')
    expect(resultado.error).not.toContain('TOKEN-DE-PRUEBA')
  })

  it('aplasta los saltos de línea del mensaje (no se falsifican líneas de log)', async () => {
    const fetchImpl = fetchFalso(400, { error: { message: 'roto\n2026-01-01 [info] todo bien' } })
    const resultado = await sendMetaEvents([evento], {
      datasetId: '123',
      accessToken: 'TOKEN',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(resultado.error).toBe('HTTP 400: roto 2026-01-01 [info] todo bien')
  })

  it('un error que no es JSON se recorta', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(500), { status: 502 }))
    const resultado = await sendMetaEvents([evento], {
      datasetId: '123',
      accessToken: 'TOKEN',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe(`HTTP 502: ${'x'.repeat(200)}`)
  })

  it('un fetch que rechaza (timeout, host caído) tampoco lanza', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('The operation was aborted due to timeout')
    })
    const resultado = await sendMetaEvents([evento], {
      datasetId: '123',
      accessToken: 'TOKEN',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(resultado).toEqual({ ok: false, received: 0, error: 'The operation was aborted due to timeout' })
  })

  it('sin events_received en la respuesta cuenta los que mandó', async () => {
    const fetchImpl = fetchFalso(200, {})
    const resultado = await sendMetaEvents([evento, evento], {
      datasetId: '123',
      accessToken: 'TOKEN',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(resultado).toEqual({ ok: true, received: 2 })
  })
})
