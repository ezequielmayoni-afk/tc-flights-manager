import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseBfmResponse } from '@/lib/sabre/client'

// Respuesta real de BargainFinderMax (BUE→MIA, 2026-12-02 / 2026-12-06),
// capturada del PCC propio con el token de sesión redactado.
const FIXTURE = readFileSync(path.join(__dirname, 'fixtures', 'bfm-rt-bue-mia.xml'), 'utf8')

describe('parseBfmResponse con la respuesta real', () => {
  const parsed = parseBfmResponse(FIXTURE)

  it('lee los 5 itinerarios ordenados por precio', () => {
    expect(parsed.itineraries).toHaveLength(5)
    const precios = parsed.itineraries.map((i) => i.totalUsd)
    expect(precios).toEqual([...precios].sort((a, b) => a - b))
    expect(precios[0]).toBe(623.33)
    expect(precios[4]).toBe(991.43)
  })

  it('el más barato es el de Avianca con una escala por tramo', () => {
    const barato = parsed.itineraries[0]
    expect(barato.totalUsd).toBe(623.33)
    expect(barato.currency).toBe('USD')
    expect(barato.airlineCode).toBe('AV')
    expect(barato.airlineCodes).toEqual(['AV'])
    // 2 segmentos por tramo, StopQuantity 0 → una escala de ida y una de vuelta.
    expect(barato.stopsOut).toBe(1)
    expect(barato.stopsBack).toBe(1)
    expect(barato.flightNumbersOut).toEqual(['AV112', 'AV30'])
    expect(barato.flightNumbersOut[0]).toMatch(/^[A-Z0-9]{2}\d+$/)
    expect(barato.flightNumbersBack).toEqual(['AV33', 'AV111'])
    expect(barato.departOut).toBe('2026-12-02T02:35:00')
    expect(barato.arriveBack).toBe('2026-12-07T01:25:00')
    // Esta respuesta no trae ElapsedTime en la opción.
    expect(barato.durationOutMin).toBeNull()
    expect(barato.durationBackMin).toBeNull()
  })

  it('un directo codeshare usa el código de la aerolínea comercializadora', () => {
    const dl = parsed.itineraries[1]
    expect(dl.totalUsd).toBe(687.53)
    // Lo opera LATAM (LA 542) pero lo vende Delta: el código es el de MarketingAirline.
    expect(dl.airlineCode).toBe('DL')
    expect(dl.airlineCodes).toEqual(['DL'])
    expect(dl.flightNumbersOut).toEqual(['DL6020'])
    expect(dl.stopsOut).toBe(0)
    expect(dl.stopsBack).toBe(0)
  })

  it('no reporta errores ni sesión perdida (el aviso DEPRECATEDRS se ignora)', () => {
    expect(parsed.errors.some((e) => e.code === 'DEPRECATEDRS')).toBe(false)
    expect(parsed.errors).toEqual([])
    expect(parsed.sessionLost).toBe(false)
  })
})

describe('parseBfmResponse con respuestas degradadas', () => {
  it('levanta el faultstring de un SOAP fault', () => {
    const xml = `<?xml version="1.0"?><soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body><soap-env:Fault><faultcode>soap-env:Client</faultcode><faultstring>Authorization failed</faultstring></soap-env:Fault></soap-env:Body></soap-env:Envelope>`
    const parsed = parseBfmResponse(xml)
    expect(parsed.itineraries).toEqual([])
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0].text).toBe('Authorization failed')
    expect(parsed.sessionLost).toBe(false)
  })

  it('marca sessionLost con USG_INVALID_SESSION', () => {
    const xml = `<Envelope><Body><OTA_AirLowFareSearchRS><Errors><Error Type="Application" Code="USG_INVALID_SESSION" ShortText="Invalid or expired session token"/></Errors></OTA_AirLowFareSearchRS></Body></Envelope>`
    const parsed = parseBfmResponse(xml)
    expect(parsed.sessionLost).toBe(true)
    expect(parsed.errors[0].code).toBe('USG_INVALID_SESSION')
  })

  it('lee un Error sin disponibilidad sin marcar sesión perdida', () => {
    const xml = `<Envelope><Body><OTA_AirLowFareSearchRS><Errors><Error Type="Application" Code="ERR.2SG.SEC" ShortText="NO FARES/RBD/CARRIER"/></Errors></OTA_AirLowFareSearchRS></Body></Envelope>`
    const parsed = parseBfmResponse(xml)
    expect(parsed.errors).toEqual([{ code: 'ERR.2SG.SEC', text: 'NO FARES/RBD/CARRIER' }])
    expect(parsed.sessionLost).toBe(false)
  })

  it('desescapa las entidades del texto del error', () => {
    const xml = `<Errors><Error Code="X" ShortText="A &amp; B &lt;raro&gt;"/></Errors>`
    expect(parseBfmResponse(xml).errors[0].text).toBe('A & B <raro>')
  })

  it('un XML vacío o basura no lanza', () => {
    expect(parseBfmResponse('')).toEqual({ itineraries: [], errors: [], sessionLost: false })
    expect(parseBfmResponse('no soy xml').itineraries).toEqual([])
  })

  it('lee ElapsedTime de la opción cuando viene', () => {
    const xml = `<PricedItineraries><PricedItinerary><AirItinerary><OriginDestinationOptions>
      <OriginDestinationOption ElapsedTime="595"><FlightSegment DepartureDateTime="2026-12-02T10:00:00" ArrivalDateTime="2026-12-02T19:55:00" StopQuantity="1" FlightNumber="900"><DepartureAirport LocationCode="EZE"/><ArrivalAirport LocationCode="MIA"/><MarketingAirline Code="AA"/></FlightSegment></OriginDestinationOption>
      <OriginDestinationOption ElapsedTime="660"><FlightSegment DepartureDateTime="2026-12-06T22:00:00" ArrivalDateTime="2026-12-07T09:00:00" StopQuantity="0" FlightNumber="901"><DepartureAirport LocationCode="MIA"/><ArrivalAirport LocationCode="EZE"/><MarketingAirline Code="AA"/></FlightSegment></OriginDestinationOption>
      </OriginDestinationOptions></AirItinerary><AirItineraryPricingInfo><ItinTotalFare><TotalFare Amount="700.00" CurrencyCode="ARS"/></ItinTotalFare></AirItineraryPricingInfo></PricedItinerary></PricedItineraries>`
    const [itin] = parseBfmResponse(xml).itineraries
    expect(itin.durationOutMin).toBe(595)
    expect(itin.durationBackMin).toBe(660)
    // Un solo segmento con StopQuantity=1 sigue siendo una escala técnica.
    expect(itin.stopsOut).toBe(1)
    expect(itin.stopsBack).toBe(0)
    // Si la moneda no es USD igual se devuelve el monto y la moneda real.
    expect(itin.totalUsd).toBe(700)
    expect(itin.currency).toBe('ARS')
  })
})

describe('parseBfmResponse con etiquetas con espacio de nombres', () => {
  it('lee un Error con texto adentro y prefijo de namespace', () => {
    const xml = `<stl:Errors xmlns:stl="http://services.sabre.com/STL/v01"><stl:Error type="BusinessLogic" Code="ERR.SWS.HOST.ERROR_IN_RESPONSE"><stl:SystemSpecificResults><stl:Message>NO COMBINABLE FARES FOR CLASS USED</stl:Message></stl:SystemSpecificResults></stl:Error></stl:Errors>`
    const parsed = parseBfmResponse(xml)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0].code).toBe('ERR.SWS.HOST.ERROR_IN_RESPONSE')
    expect(parsed.errors[0].text).toContain('NO COMBINABLE FARES')
    expect(parsed.sessionLost).toBe(false)
  })

  it('no confunde <Errors> ni <PricedItineraries> con <Error> y <PricedItinerary>', () => {
    expect(parseBfmResponse('<Errors></Errors><PricedItineraries></PricedItineraries>')).toEqual({ itineraries: [], errors: [], sessionLost: false })
  })
})
