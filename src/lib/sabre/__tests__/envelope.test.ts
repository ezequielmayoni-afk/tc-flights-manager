import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildBfmEnvelope, buildSessionCreateEnvelope, isSabreConfigured, sabreConfig } from '@/lib/sabre/client'
import type { SabreSession } from '@/lib/sabre/client'

const SESSION: SabreSession = { token: 'Shared/IDL:IceSess!ICESMS!FAKE', conversationId: 'hub-test-1', createdAt: Date.now() }
const INPUT = { originIata: 'EZE', destIata: 'MIA', departDate: '2026-12-02', returnDate: '2026-12-06' }

const SABRE_KEYS = ['SABRE_USERNAME', 'SABRE_PASSWORD', 'SABRE_PCC', 'SABRE_CLIENT_ID', 'SABRE_CLIENT_SECRET', 'SABRE_DOMAIN', 'SABRE_SOAP_URL'] as const
// El entorno real puede tener credenciales cargadas: se guardan y se reponen
// para que estos tests no se las pisen a nadie (mismo criterio que client.test.ts).
const entornoPrevio = new Map<string, string | undefined>()

beforeEach(() => {
  for (const key of SABRE_KEYS) entornoPrevio.set(key, process.env[key])
  process.env.SABRE_USERNAME = 'usuario'
  process.env.SABRE_PASSWORD = 'clave&secreta<x>'
  process.env.SABRE_PCC = '6U9L'
  process.env.SABRE_CLIENT_ID = 'id-falso'
  process.env.SABRE_CLIENT_SECRET = 'secreto-falso'
  delete process.env.SABRE_DOMAIN
  delete process.env.SABRE_SOAP_URL
})

afterEach(() => {
  for (const key of SABRE_KEYS) {
    const previo = entornoPrevio.get(key)
    if (previo === undefined) delete process.env[key]
    else process.env[key] = previo
  }
})

describe('isSabreConfigured', () => {
  it('pide las cinco variables obligatorias', () => {
    expect(isSabreConfigured()).toBe(true)
    delete process.env.SABRE_CLIENT_SECRET
    expect(isSabreConfigured()).toBe(false)
  })

  it('sabreConfig lanza si falta alguna', () => {
    delete process.env.SABRE_PCC
    expect(() => sabreConfig()).toThrow(/SABRE_PCC/)
  })

  it('el dominio y la URL tienen default', () => {
    const cfg = sabreConfig()
    expect(cfg.domain).toBe('DEFAULT')
    expect(cfg.soapUrl).toBe('https://webservices.platform.sabre.com')
  })
})

describe('buildSessionCreateEnvelope', () => {
  it('manda ClientId/ClientSecret dentro del UsernameToken y el dominio DEFAULT', () => {
    const xml = buildSessionCreateEnvelope(sabreConfig(), 'conv-42')
    expect(xml).toContain('<ClientId>id-falso</ClientId>')
    expect(xml).toContain('<ClientSecret>secreto-falso</ClientSecret>')
    expect(xml).toContain('<Domain>DEFAULT</Domain>')
    expect(xml).toContain('<Organization>6U9L</Organization>')
    expect(xml).toContain('<ns4:CPAId>6U9L</ns4:CPAId>')
    expect(xml).toContain('<ns4:ConversationId>conv-42</ns4:ConversationId>')
    expect(xml).toContain('<ns4:Action>SessionCreateRQ</ns4:Action>')
    expect(xml).toContain('<ns4:Source PseudoCityCode="6U9L"/>')
  })

  it('escapa los caracteres XML de la contraseña', () => {
    const xml = buildSessionCreateEnvelope(sabreConfig(), 'conv-42')
    expect(xml).toContain('<ns6:Password>clave&amp;secreta&lt;x&gt;</ns6:Password>')
    expect(xml).not.toContain('clave&secreta')
  })

  it('respeta SABRE_DOMAIN cuando está seteado', () => {
    process.env.SABRE_DOMAIN = 'AA'
    expect(buildSessionCreateEnvelope(sabreConfig(), 'c')).toContain('<Domain>AA</Domain>')
  })
})

describe('buildBfmEnvelope', () => {
  it('arma la ida y la vuelta con origen y destino invertidos', () => {
    const xml = buildBfmEnvelope(sabreConfig(), SESSION, INPUT)
    expect(xml).toContain('<ns4:Action>BargainFinderMaxRQ</ns4:Action>')
    expect(xml).toContain(`<wsse:BinarySecurityToken>${SESSION.token}</wsse:BinarySecurityToken>`)
    expect(xml).toContain('<OriginDestinationInformation RPH="1"><DepartureDateTime>2026-12-02T00:00:00</DepartureDateTime><OriginLocation LocationCode="EZE"/><DestinationLocation LocationCode="MIA"/></OriginDestinationInformation>')
    expect(xml).toContain('<OriginDestinationInformation RPH="2"><DepartureDateTime>2026-12-06T00:00:00</DepartureDateTime><OriginLocation LocationCode="MIA"/><DestinationLocation LocationCode="EZE"/></OriginDestinationInformation>')
  })

  it('pide 5 itinerarios y 1 adulto por default, en USD', () => {
    const xml = buildBfmEnvelope(sabreConfig(), SESSION, INPUT)
    expect(xml).toContain('<NumTrips Number="5"/>')
    expect(xml).toContain('<PassengerTypeQuantity Code="ADT" Quantity="1"/>')
    expect(xml).toContain('<SeatsRequested>1</SeatsRequested>')
    expect(xml).toContain('<PriceRequestInformation CurrencyCode="USD"/>')
    expect(xml).toContain('<DataSources ATPCO="Enable" LCC="Enable" NDC="Disable"/>')
    expect(xml).toContain('<RequestType Name="50ITINS"/>')
  })

  it('acepta más adultos y otro tope de itinerarios', () => {
    const xml = buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, adults: 2, maxItineraries: 10 })
    expect(xml).toContain('<NumTrips Number="10"/>')
    expect(xml).toContain('<PassengerTypeQuantity Code="ADT" Quantity="2"/>')
    expect(xml).toContain('<SeatsRequested>2</SeatsRequested>')
  })

  it('normaliza los IATA a mayúsculas', () => {
    const xml = buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, originIata: 'eze', destIata: 'mia' })
    expect(xml).toContain('<OriginLocation LocationCode="EZE"/>')
  })

  it('lanza con un IATA inválido', () => {
    expect(() => buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, originIata: 'BUEN' })).toThrow(/IATA/)
    expect(() => buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, destIata: 'M1A' })).toThrow(/IATA/)
    expect(() => buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, originIata: 'MIA' })).toThrow(/iguales|IATA/)
  })

  it('lanza con fechas mal escritas o al revés', () => {
    expect(() => buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, departDate: '02/12/2026' })).toThrow(/fecha/i)
    expect(() => buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, returnDate: '2026-13-40' })).toThrow(/fecha/i)
    expect(() => buildBfmEnvelope(sabreConfig(), SESSION, { ...INPUT, departDate: '2026-12-06', returnDate: '2026-12-02' })).toThrow(/fecha/i)
  })
})
