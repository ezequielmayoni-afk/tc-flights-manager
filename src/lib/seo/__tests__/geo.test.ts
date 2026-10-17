import { describe, expect, it } from 'vitest'
import { readAnswer } from '../geo'

describe('readAnswer', () => {
  it('detecta mención, cita y competidores', () => {
    const r = readAnswer({
      text: 'Para el Caribe podés mirar Despegar, Almundo y también Sí, Viajo, que tiene buenas reseñas.',
      citations: ['https://www.despegar.com.ar/', 'https://www.siviajo.com/es/26/caribe/moreideas', 'https://www.siviajo.com/'],
    })
    expect(r.mentioned).toBe(true)
    expect(r.cited).toBe(true)
    expect(r.citedUrls).toEqual(['https://www.siviajo.com/es/26/caribe/moreideas', 'https://www.siviajo.com/'])
    expect(r.competitors).toEqual(['Despegar', 'Almundo'])
  })

  it('una cita propia cuenta como mención aunque el texto no nombre la marca', () => {
    const r = readAnswer({ text: 'Mirá esta agencia de Buenos Aires.', citations: ['https://blog.siviajo.com/x/'] })
    expect(r.mentioned).toBe(true)
    expect(r.cited).toBe(true)
  })

  it('sin marca ni citas propias', () => {
    const r = readAnswer({ text: 'Las más conocidas son Despegar y Almundo.', citations: ['https://almundo.com.ar/'] })
    expect(r.mentioned).toBe(false)
    expect(r.cited).toBe(false)
    expect(r.citedUrls).toEqual([])
    expect(r.competitors).toEqual(['Despegar', 'Almundo'])
  })
})
