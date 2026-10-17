import { describe, expect, it } from 'vitest'
import { competitorForUrl, readSerp } from '../serp'

const RAW = {
  organic_results: [
    { position: 1, title: 'Almundo', link: 'https://almundo.com.ar/paquetes' },
    { position: 2, title: 'Paquete F1', link: 'https://www.siviajo.com/es/idea/39635286/paquete-f1' },
    { position: 3, title: 'TurismoCity', link: 'https://www.turismocity.com.ar/paquetes' },
    { position: 4, title: 'Otra ficha', link: 'https://siviajo.com/es/26/caribe/moreideas' },
  ],
  ai_overview: {
    text_blocks: [{ snippet: 'Podés cotizar en Despegar o Almundo.' }],
    references: [
      { source: 'Despegar', link: 'https://www.despegar.com.ar/' },
      { title: 'Instagram', link: 'https://www.instagram.com/reel/x' },
    ],
  },
  local_results: { places: [{ title: 'MEJORES VIAJES', rating: 4.8, reviews: 6355 }, { title: 'Sí, Viajo', rating: 4.9, reviews: 1972 }] },
  related_questions: [{ question: '¿Cuál es la agencia de viajes más confiable?' }, { question: '¿Qué agencia es buena?' }],
}

describe('readSerp', () => {
  it('encuentra la primera URL propia, el AI Overview, el pack local y las PAA', () => {
    const r = readSerp(RAW)
    expect(r.position).toBe(2)
    expect(r.url).toContain('/es/idea/39635286')
    expect(r.aiOverview).toBe(true)
    expect(r.inAiOverview).toBe(false)
    expect(r.aiOverviewSources).toEqual([
      { source: 'Despegar', link: 'https://www.despegar.com.ar/' },
      { source: 'Instagram', link: 'https://www.instagram.com/reel/x' },
    ])
    expect(r.localPackRank).toBe(2)
    expect(r.localPack[1]).toEqual({ title: 'Sí, Viajo', rating: 4.9, reviews: 1972 })
    expect(r.paa).toHaveLength(2)
    expect(r.competitorsInTop).toEqual(['Almundo', 'TurismoCity'])
    expect(r.top).toHaveLength(4)
  })

  it('sin resultados propios ni AI Overview devuelve nulls', () => {
    const r = readSerp({ organic_results: [{ position: 1, title: 'x', link: 'https://despegar.com.ar/' }] })
    expect(r.position).toBeNull()
    expect(r.url).toBeNull()
    expect(r.aiOverview).toBe(false)
    expect(r.inAiOverview).toBe(false)
    expect(r.localPackRank).toBeNull()
    expect(r.localPack).toEqual([])
    expect(r.paa).toEqual([])
  })

  it('un AI Overview que sólo trae page_token cuenta como presente, y la cita propia se detecta', () => {
    const r = readSerp({ organic_results: [], ai_overview: { page_token: 'abc', references: [{ source: 'Sí, Viajo', link: 'https://www.siviajo.com/' }] } })
    expect(r.aiOverview).toBe(true)
    expect(r.inAiOverview).toBe(true)
  })

  it('acepta el pack local como lista plana', () => {
    const r = readSerp({ organic_results: [], local_results: [{ title: 'Sí, Viajo', rating: 4.9, reviews: 1972 }] })
    expect(r.localPackRank).toBe(1)
  })
})

describe('competitorForUrl', () => {
  it('mapea dominios a competidores', () => {
    expect(competitorForUrl('https://www.despegar.com.ar/paquetes/')).toBe('Despegar')
    expect(competitorForUrl('https://almundo.com.ar/')).toBe('Almundo')
    expect(competitorForUrl('https://www.siviajo.com/')).toBeNull()
    expect(competitorForUrl(null)).toBeNull()
  })
})
