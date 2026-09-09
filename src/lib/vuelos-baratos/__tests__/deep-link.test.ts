import { beforeEach, describe, expect, it } from 'vitest'
import { buildDistribution, buildSiviajoFlightUrl, padDate, withUtm } from '../deep-link'

// La URL del deep link tiene que salir literal: siviajo.com espera `::` y `/`
// sin escapar, así que se arma con template y no con URLSearchParams.
beforeEach(() => {
  delete process.env.SIVIAJO_BASE_URL
})

describe('padDate', () => {
  it('pasa de ISO a DD/MM/YYYY', () => {
    expect(padDate('2026-01-05')).toBe('05/01/2026')
    expect(padDate('2026-12-31')).toBe('31/12/2026')
  })

  it('lanza si no es una fecha ISO', () => {
    expect(() => padDate('05/01/2026')).toThrow()
    expect(() => padDate('2026-1-5')).toThrow()
    expect(() => padDate('')).toThrow()
  })
})

describe('buildDistribution', () => {
  it('arma la distribución de pasajeros', () => {
    expect(buildDistribution(1)).toBe('1~~0')
    expect(buildDistribution(2, [])).toBe('2~~0')
    expect(buildDistribution(2, [5, 9])).toBe('2~~2~~5,9')
  })
})

describe('buildSiviajoFlightUrl', () => {
  it('arma la URL exacta de ida y vuelta', () => {
    expect(
      buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-02', returnDate: '2026-12-06' })
    ).toBe(
      'https://www.siviajo.com/home?latestSearch=true&tripType=ONLY_FLIGHT&directSubmit=true&departureDate=02/12/2026&arrivalDate=06/12/2026&distribution=1~~0&departure=Destination::BUE&destination=Destination::MIA&roundTripFlight=true'
    )
  })

  it('sin vuelta no manda arrivalDate y marca roundTripFlight=false', () => {
    const url = buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-02' })
    expect(url).not.toContain('arrivalDate')
    expect(url).toContain('roundTripFlight=false')
    expect(url).toContain('departureDate=02/12/2026')
  })

  it('no escapa los dos puntos ni las barras', () => {
    const url = buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-02', returnDate: '2026-12-06' })
    expect(url).not.toContain('%3A')
    expect(url).not.toContain('%2F')
  })

  it('lleva la distribución con menores', () => {
    const url = buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-02', returnDate: '2026-12-06', adults: 2, childrenAges: [5, 9] })
    expect(url).toContain('distribution=2~~2~~5,9')
  })

  it('lanza si la vuelta no es posterior a la ida', () => {
    expect(() => buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-06', returnDate: '2026-12-06' })).toThrow()
    expect(() => buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-06', returnDate: '2026-12-02' })).toThrow()
  })

  it('lanza con fechas o códigos inválidos', () => {
    expect(() => buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-13-02' })).toThrow()
    expect(() => buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '02/12/2026' })).toThrow()
    expect(() => buildSiviajoFlightUrl({ originCode: 'bue', destCode: 'MIA', departDate: '2026-12-02' })).toThrow()
    expect(() => buildSiviajoFlightUrl({ originCode: 'B', destCode: 'MIA', departDate: '2026-12-02' })).toThrow()
  })

  it('respeta SIVIAJO_BASE_URL sin barra final', () => {
    process.env.SIVIAJO_BASE_URL = 'https://staging.siviajo.com/'
    expect(buildSiviajoFlightUrl({ originCode: 'BUE', destCode: 'MIA', departDate: '2026-12-02' })).toContain('https://staging.siviajo.com/home?')
  })
})

describe('withUtm', () => {
  it('agrega los tres parámetros base', () => {
    const url = withUtm('https://www.siviajo.com/home?latestSearch=true', { campaign: 'miami' })
    expect(url).toBe('https://www.siviajo.com/home?latestSearch=true&utm_source=vuelos&utm_medium=landing&utm_campaign=miami')
  })

  it('agrega utm_content y codifica los valores', () => {
    const url = withUtm('https://www.siviajo.com/home?a=1', { campaign: 'vuelos baratos', content: 'tabla/fila 3', medium: 'landing-dest' })
    expect(url).toContain('&utm_medium=landing-dest')
    expect(url).toContain('&utm_campaign=vuelos%20baratos')
    expect(url).toContain('&utm_content=tabla%2Ffila%203')
  })
})
