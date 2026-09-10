import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El presupuesto y el registro de llamadas van a la base: se mockean para que
// el test corra sin Supabase.
const mocks = vi.hoisted(() => ({ getBudgetStatus: vi.fn(), recordExternalCall: vi.fn() }))
vi.mock('@/lib/jobs/budget', () => ({
  getBudgetStatus: mocks.getBudgetStatus,
  recordExternalCall: mocks.recordExternalCall,
}))

import {
  SABRE_PROVIDER,
  SESSION_TTL_MS,
  SabreAuthError,
  SabreBudgetExhausted,
  bargainFinderMax,
  closeSabreSession,
  createSabreSession,
  createSabreShopper,
} from '@/lib/sabre/client'
import type { SabreSession } from '@/lib/sabre/client'
import type { Db } from '@/lib/jobs/types'

const BFM_OK = readFileSync(path.join(__dirname, 'fixtures', 'bfm-rt-bue-mia.xml'), 'utf8')

const db = {} as unknown as Db
const SESSION: SabreSession = { token: 'Shared/IDL:IceSess!ICESMS!FAKE', conversationId: 'hub-test-1', createdAt: Date.now() }
const INPUT = { originIata: 'EZE', destIata: 'MIA', departDate: '2026-12-02', returnDate: '2026-12-06' }

const SESSION_OK = `<Envelope><Header><wsse:Security xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext"><wsse:BinarySecurityToken valueType="String" EncodingType="wsse:Base64Binary">Shared/IDL:IceSess!ICESMS!TOKEN-NUEVO</wsse:BinarySecurityToken></wsse:Security></Header><Body><SessionCreateRS status="Approved"/></Body></Envelope>`
const SIN_ITINERARIOS = `<Envelope><Body><OTA_AirLowFareSearchRS><Success/><PricedItineraries/></OTA_AirLowFareSearchRS></Body></Envelope>`
const SIN_DISPONIBILIDAD = `<Envelope><Body><OTA_AirLowFareSearchRS><Errors><Error Type="Application" Code="ERR.2SG.SEC" ShortText="NO AVAILABILITY FOR THIS REQUEST"/></Errors></OTA_AirLowFareSearchRS></Body></Envelope>`
const FAULT = `<Envelope><Body><Fault><faultstring>Invalid Request: schema validation failed</faultstring></Fault></Body></Envelope>`
const SESION_PERDIDA = `<Envelope><Body><Fault><faultstring>USG_INVALID_SESSION: session token is not valid</faultstring></Fault></Body></Envelope>`

function soap(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { 'Content-Type': 'text/xml' } })
}

function stub(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

/** Un Sabre de mentira que responde según el SOAPAction del pedido. */
function fakeSabre(bfm: () => Response) {
  return stub(async (_url, init) => {
    const action = String((init.headers as Record<string, string>).SOAPAction)
    if (action === '"OTA"') return soap(SESSION_OK)
    if (action === '"SessionCloseRQ"') return soap('<Envelope><Body><SessionCloseRS status="Approved"/></Body></Envelope>')
    return bfm()
  })
}

function acciones(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => String((c[1] as RequestInit & { headers: Record<string, string> }).headers.SOAPAction))
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SABRE_USERNAME = 'usuario'
  process.env.SABRE_PASSWORD = 'clave'
  process.env.SABRE_PCC = '6U9L'
  process.env.SABRE_CLIENT_ID = 'id-falso'
  process.env.SABRE_CLIENT_SECRET = 'secreto-falso'
  delete process.env.SABRE_DOMAIN
  delete process.env.SABRE_SOAP_URL
  mocks.getBudgetStatus.mockResolvedValue({ exhausted: false, pct: 10 })
  mocks.recordExternalCall.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSabreSession', () => {
  it('extrae el BinarySecurityToken y manda SOAPAction "OTA"', async () => {
    const fetchMock = stub(async () => soap(SESSION_OK))
    const session = await createSabreSession(fetchMock)

    expect(session.token).toBe('Shared/IDL:IceSess!ICESMS!TOKEN-NUEVO')
    expect(session.conversationId).toBeTruthy()
    expect(session.createdAt).toBeLessThanOrEqual(Date.now())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://webservices.platform.sabre.com')
    expect(init.method).toBe('POST')
    expect(init.headers.SOAPAction).toBe('"OTA"')
    expect(init.headers['Content-Type']).toBe('text/xml')
    expect(String(init.body)).toContain('<ns4:Action>SessionCreateRQ</ns4:Action>')
    // Crear la sesión no es una transacción facturable: no entra al presupuesto.
    expect(mocks.recordExternalCall).not.toHaveBeenCalled()
  })

  it('lanza SabreAuthError con el faultstring', async () => {
    const fetchMock = stub(async () => soap('<Envelope><Body><Fault><faultstring>Authorization failed</faultstring></Fault></Body></Envelope>', 500))
    await expect(createSabreSession(fetchMock)).rejects.toThrowError(SabreAuthError)
    await expect(createSabreSession(fetchMock)).rejects.toThrow(/Authorization failed/)
  })

  it('lanza SabreAuthError si no vino token', async () => {
    const fetchMock = stub(async () => soap('<Envelope><Body><SessionCreateRS/></Body></Envelope>'))
    await expect(createSabreSession(fetchMock)).rejects.toThrow(/sin token/)
  })
})

describe('closeSabreSession', () => {
  it('manda SessionCloseRQ con el token', async () => {
    const fetchMock = stub(async () => soap('<Envelope><Body><SessionCloseRS status="Approved"/></Body></Envelope>'))
    await closeSabreSession(SESSION, fetchMock)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(init.headers.SOAPAction).toBe('"SessionCloseRQ"')
    expect(String(init.body)).toContain('<ns4:Action>SessionCloseRQ</ns4:Action>')
    expect(String(init.body)).toContain(SESSION.token)
  })

  it('nunca lanza aunque Sabre se caiga', async () => {
    const fetchMock = stub(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(closeSabreSession(SESSION, fetchMock)).resolves.toBeUndefined()
  })
})

describe('bargainFinderMax', () => {
  it('mapea una respuesta con itinerarios y registra la llamada', async () => {
    const fetchMock = stub(async () => soap(BFM_OK))
    const res = await bargainFinderMax(db, SESSION, INPUT, { jobId: 7, fetchImpl: fetchMock })

    expect(res.status).toBe('ok')
    expect(res.itineraries).toHaveLength(5)
    expect(res.status === 'ok' && res.cheapest.totalUsd).toBe(623.33)
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(init.headers.SOAPAction).toBe('"BargainFinderMaxRQ"')
    expect(String(init.body)).toContain('<OTA_AirLowFareSearchRQ')

    expect(mocks.recordExternalCall).toHaveBeenCalledTimes(1)
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ provider: SABRE_PROVIDER, endpoint: 'vuelos-baratos:bfm', units: 1, status: 'ok', jobId: 7 })
  })

  it('sin itinerarios y sin errores es empty y se registra como ok', async () => {
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: stub(async () => soap(SIN_ITINERARIOS)) })
    expect(res).toMatchObject({ status: 'empty', itineraries: [] })
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'ok', jobId: null })
  })

  it('un error de "no availability" es empty, no error', async () => {
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: stub(async () => soap(SIN_DISPONIBILIDAD)) })
    expect(res.status).toBe('empty')
    expect(res.status === 'empty' && res.message).toContain('NO AVAILABILITY')
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'ok' })
  })

  it('un faultstring de esquema es un error que no se reintenta', async () => {
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: stub(async () => soap(FAULT, 500)) })
    expect(res).toMatchObject({ status: 'error', retryable: false, sessionLost: false })
    expect(res.status === 'error' && res.error).toContain('schema validation failed')
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'error' })
  })

  it('la sesión perdida se reintenta', async () => {
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: stub(async () => soap(SESION_PERDIDA, 500)) })
    expect(res).toMatchObject({ status: 'error', retryable: true, sessionLost: true })
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'error' })
  })

  it('un 503 sin cuerpo útil se reintenta', async () => {
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: stub(async () => soap('<html>bad gateway</html>', 503)) })
    expect(res).toMatchObject({ status: 'error', retryable: true, sessionLost: false })
    expect(res.status === 'error' && res.error).toContain('503')
  })

  it('el timeout no lanza y se registra como timeout', async () => {
    const fetchMock = stub(async () => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'TimeoutError'
      throw err
    })
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: fetchMock })
    expect(res).toMatchObject({ status: 'error', retryable: true })
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'timeout' })
  })

  it('un error de red devuelve error reintentable', async () => {
    const fetchMock = stub(async () => {
      throw new TypeError('fetch failed')
    })
    const res = await bargainFinderMax(db, SESSION, INPUT, { fetchImpl: fetchMock })
    expect(res).toMatchObject({ status: 'error', retryable: true })
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ status: 'error' })
  })

  it('con el presupuesto agotado lanza y no llama a Sabre', async () => {
    const fetchMock = stub(async () => soap(BFM_OK))
    mocks.getBudgetStatus.mockResolvedValue({ exhausted: true, pct: 101 })
    await expect(bargainFinderMax(db, SESSION, INPUT, { fetchImpl: fetchMock })).rejects.toBeInstanceOf(SabreBudgetExhausted)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.recordExternalCall).not.toHaveBeenCalled()
  })

  it('con enforceBudget false ni consulta el presupuesto', async () => {
    mocks.getBudgetStatus.mockResolvedValue({ exhausted: true, pct: 101 })
    const res = await bargainFinderMax(db, SESSION, INPUT, { enforceBudget: false, fetchImpl: stub(async () => soap(BFM_OK)) })
    expect(res.status).toBe('ok')
    expect(mocks.getBudgetStatus).not.toHaveBeenCalled()
  })

  it('un input inválido lanza antes de gastar la llamada', async () => {
    const fetchMock = stub(async () => soap(BFM_OK))
    await expect(bargainFinderMax(db, SESSION, { ...INPUT, destIata: 'XXXX' }, { fetchImpl: fetchMock })).rejects.toThrow(/IATA/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.recordExternalCall).not.toHaveBeenCalled()
  })
})

describe('createSabreShopper', () => {
  it('crea una sola sesión para varias búsquedas y la cierra al final', async () => {
    const fetchMock = fakeSabre(() => soap(BFM_OK))
    const shopper = createSabreShopper(db, { fetchImpl: fetchMock, jobId: 3 })

    for (let i = 0; i < 3; i++) expect((await shopper.shop(INPUT)).status).toBe('ok')
    await shopper.close()

    expect(acciones(fetchMock)).toEqual(['"OTA"', '"BargainFinderMaxRQ"', '"BargainFinderMaxRQ"', '"BargainFinderMaxRQ"', '"SessionCloseRQ"'])
    expect(shopper.callsMade).toBe(3)
    expect(mocks.recordExternalCall).toHaveBeenCalledTimes(3)
    expect(mocks.recordExternalCall.mock.calls[0][1]).toMatchObject({ provider: SABRE_PROVIDER, jobId: 3 })
  })

  it('renueva la sesión y reintenta una vez cuando Sabre la pierde', async () => {
    let bfm = 0
    const fetchMock = fakeSabre(() => {
      bfm++
      return bfm === 1 ? soap(SESION_PERDIDA, 500) : soap(BFM_OK)
    })
    const shopper = createSabreShopper(db, { fetchImpl: fetchMock })

    const res = await shopper.shop(INPUT)
    expect(res.status).toBe('ok')
    expect(acciones(fetchMock).filter((a) => a === '"OTA"')).toHaveLength(2)
    expect(shopper.callsMade).toBe(2)
  })

  it('devuelve el error si el reintento tampoco levanta la sesión', async () => {
    const fetchMock = fakeSabre(() => soap(SESION_PERDIDA, 500))
    const shopper = createSabreShopper(db, { fetchImpl: fetchMock })
    const res = await shopper.shop(INPUT)
    expect(res).toMatchObject({ status: 'error', sessionLost: true })
    // Una renovación y un solo reintento: no entra en loop.
    expect(acciones(fetchMock).filter((a) => a === '"BargainFinderMaxRQ"')).toHaveLength(2)
  })

  it('renueva la sesión cuando pasó el TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T01:00:00Z'))
    const fetchMock = fakeSabre(() => soap(BFM_OK))
    const shopper = createSabreShopper(db, { fetchImpl: fetchMock })

    await shopper.shop(INPUT)
    vi.setSystemTime(new Date(Date.now() + SESSION_TTL_MS + 1_000))
    await shopper.shop(INPUT)

    expect(acciones(fetchMock).filter((a) => a === '"OTA"')).toHaveLength(2)
  })

  it('close sin sesión abierta no llama a Sabre', async () => {
    const fetchMock = fakeSabre(() => soap(BFM_OK))
    await createSabreShopper(db, { fetchImpl: fetchMock }).close()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
