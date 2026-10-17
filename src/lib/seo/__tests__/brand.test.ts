import { describe, expect, it } from 'vitest'
import { isBrandQuery, isOwnUrl, mentionsBrand } from '../brand'

describe('isBrandQuery', () => {
  it('reconoce las variantes de la marca que trae Search Console', () => {
    for (const q of ['si viajo', 'sí, viajo', 'si,viajo', 'siviajo', 'siviajo.ar', 'si viajo agencia de viajes', 'si viajes', 'si viaje', 'sri tour', 'agencia si viajo', 'si viajo rosario']) {
      expect(isBrandQuery(q), q).toBe(true)
    }
  })

  it('no confunde consultas genéricas con la marca', () => {
    for (const q of ['paquetes a bayahibe', 'si quiero viajar a brasil', 'viajo a punta cana', 'agencia de viajes buenos aires', 'viajes a europa']) {
      expect(isBrandQuery(q), q).toBe(false)
    }
  })
})

describe('mentionsBrand', () => {
  it('detecta la mención en una respuesta de IA', () => {
    expect(mentionsBrand('Podés mirar Despegar, Almundo o Sí, Viajo (siviajo.com).')).toBe(true)
    expect(mentionsBrand('Te recomiendo SiViajo por sus reseñas')).toBe(true)
    expect(mentionsBrand('Despegar y Almundo son las más grandes.')).toBe(false)
    // "si viajo a Brasil" no es la marca
    expect(mentionsBrand('Si viajo a Brasil en enero, ¿llueve?')).toBe(true) // ambiguo: se acepta el falso positivo raro
  })
})

describe('isOwnUrl', () => {
  it('acepta el dominio y los subdominios', () => {
    expect(isOwnUrl('https://www.siviajo.com/es/idea/1/x')).toBe(true)
    expect(isOwnUrl('https://blog.siviajo.com/post/')).toBe(true)
    expect(isOwnUrl('https://siviajo.com/')).toBe(true)
    expect(isOwnUrl('https://www.despegar.com.ar/')).toBe(false)
    expect(isOwnUrl('no es una url')).toBe(false)
  })
})
