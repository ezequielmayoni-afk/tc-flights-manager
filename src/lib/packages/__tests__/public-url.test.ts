import { describe, expect, it } from 'vitest'
import { originTcCode, publicPackageUrl, siviajoPackageSearchUrl } from '../public-url'

describe('publicPackageUrl', () => {
  it('usa el mismo formato que el sitemap cuando hay título', () => {
    expect(publicPackageUrl(62656846, 'Punta Cana · 7 noches All Inclusive')).toBe('https://www.siviajo.com/es/idea/62656846/punta-cana-7-noches-all-inclusive')
  })
  it('sin título queda sólo el id', () => {
    expect(publicPackageUrl(123)).toBe('https://www.siviajo.com/es/idea/123')
  })
})

describe('siviajoPackageSearchUrl', () => {
  it('arma la búsqueda vuelo + hotel con fechas dd/mm/aaaa y destino de TC', () => {
    const url = siviajoPackageSearchUrl({ origin: 'BUE', destinationTcCode: 'PUJ', departDate: '2027-03-09', returnDate: '2027-03-16', adults: 2 })
    expect(url).toBe('https://www.siviajo.com/home?latestSearch=true&tripType=FLIGHT_HOTEL&directSubmit=true&departureDate=09/03/2027&arrivalDate=16/03/2027&distribution=2~~0&departure=Destination::BUE&destination=Destination::PUJ&roundTripFlight=true')
  })
  it('lleva las edades de los menores y traduce el origen IATA al código de TC', () => {
    const url = siviajoPackageSearchUrl({ origin: 'COR', destinationTcCode: 'cun', departDate: '2027-01-05', returnDate: '2027-01-12', adults: 2, childrenAges: [4, 9] })
    expect(url).toContain('distribution=2~~2~~4,9')
    expect(url).toContain('departure=Destination::CRD')
    expect(url).toContain('destination=Destination::CUN')
  })
  it('sin destino ni fechas abre el buscador igual, sin esos parámetros', () => {
    const url = siviajoPackageSearchUrl({ origin: 'BUE', adults: 1 })
    expect(url).not.toContain('destination=')
    expect(url).not.toContain('departureDate=')
    expect(url).toContain('departure=Destination::BUE')
  })
  it('originTcCode deja pasar códigos que no conoce', () => {
    expect(originTcCode('eze')).toBe('BUE')
    expect(originTcCode('NQN')).toBe('NQN')
  })
})
