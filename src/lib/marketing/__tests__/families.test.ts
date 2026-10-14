import { describe, expect, it } from 'vitest'
import { adsetNameFor, familyKeyForPackage } from '../families'

describe('familyKeyForPackage', () => {
  it('override > eventos > perfil > grupal', () => {
    expect(familyKeyForPackage({ title: 'Punta Cana 7 noches', profileFamily: 'caribe', operatorDeparture: false, override: 'brasil' })).toBe('brasil')
    expect(familyKeyForPackage({ title: 'F1 San Pablo-Interlagos 2026: CHARTER', profileFamily: 'brasil', operatorDeparture: true })).toBe('eventos')
    expect(familyKeyForPackage({ title: 'Rugby Nations Championship Irlanda vs Argentina', profileFamily: null, operatorDeparture: false })).toBe('eventos')
    expect(familyKeyForPackage({ title: 'Salida Grupal a Dubái 2027', profileFamily: 'medio_oriente_asia', operatorDeparture: true })).toBe('europa_exoticos')
    expect(familyKeyForPackage({ title: 'Perú con Machu Picchu', profileFamily: null, operatorDeparture: true })).toBe('europa_exoticos')
    expect(familyKeyForPackage({ title: 'Florianópolis verano', profileFamily: 'brasil', operatorDeparture: false })).toBe('brasil')
    expect(familyKeyForPackage({ title: 'Barbados 7 noches', profileFamily: null, operatorDeparture: false })).toBeNull()
  })
})

describe('adsetNameFor', () => {
  it('DESTINO_MES_SIV_ID, sin acentos ni espacios', () => {
    expect(adsetNameFor({ destination: 'Punta Cana', departureDate: '2027-01-17', tcPackageId: 52574571 })).toBe('PUNTA_CANA_ENE_SIV_52574571')
    expect(adsetNameFor({ destination: 'Dubái', departureDate: '2027-02-18', tcPackageId: 56433742 })).toBe('DUBAI_FEB_SIV_56433742')
    expect(adsetNameFor({ destination: 'Rio de Janeiro + Búzios', departureDate: null, tcPackageId: 1 })).toBe('RIO_DE_JANEIRO_BUZIOS_SIV_1')
  })
})
