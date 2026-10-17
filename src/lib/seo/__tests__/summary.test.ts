import { describe, expect, it } from 'vitest'
import { aiShareOfVoice, byPageType, competitorMentions, opportunities, serpSummary, splitBrand, sumByPage, sumByQuery, topNonBrand, totals } from '../summary'

describe('totals', () => {
  it('pondera la posición por impresiones', () => {
    const t = totals([
      { clicks: 10, impressions: 100, position: 2 },
      { clicks: 0, impressions: 300, position: 10 },
    ])
    expect(t.clicks).toBe(10)
    expect(t.impressions).toBe(400)
    expect(t.ctr).toBeCloseTo(0.025)
    expect(t.position).toBeCloseTo(8)
  })
  it('sin filas da ceros', () => {
    expect(totals([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 })
  })
})

describe('splitBrand + sumByQuery', () => {
  it('separa marca de no-marca después de sumar por consulta', () => {
    const rows = sumByQuery([
      { date: '2026-10-01', query: 'si viajo', clicks: 100, impressions: 150, position: 1 },
      { date: '2026-10-02', query: 'si viajo', clicks: 80, impressions: 120, position: 1 },
      { date: '2026-10-01', query: 'paquetes a bayahibe', clicks: 5, impressions: 400, position: 9 },
    ])
    expect(rows).toHaveLength(2)
    const s = splitBrand(rows)
    expect(s.brand.clicks).toBe(180)
    expect(s.brand.queries).toBe(1)
    expect(s.nonBrand.clicks).toBe(5)
    expect(s.nonBrand.impressions).toBe(400)
  })
})

describe('byPageType', () => {
  it('agrupa por plantilla y ordena por clics', () => {
    const pages = sumByPage([
      { page: 'https://www.siviajo.com/', clicks: 50, impressions: 100, position: 1 },
      { page: 'https://www.siviajo.com/es/idea/1/a', clicks: 10, impressions: 500, position: 8 },
      { page: 'https://www.siviajo.com/es/idea/2/b', clicks: 5, impressions: 200, position: 9 },
      { page: 'https://blog.siviajo.com/x/', clicks: 20, impressions: 2000, position: 7 },
    ])
    const t = byPageType(pages)
    expect(t.map(x => x.type)).toEqual(['home', 'blog', 'idea'])
    expect(t[2].pages).toBe(2)
    expect(t[2].clicks).toBe(15)
  })
})

describe('opportunities + topNonBrand', () => {
  const rows = [
    { query: 'si viajo', clicks: 500, impressions: 600, position: 1 },
    { query: 'paquetes a bayahibe all inclusive 2027', clicks: 15, impressions: 1389, position: 8.8 },
    { query: 'paquetes f1 brasil 2026', clicks: 131, impressions: 884, position: 2.3 },
    { query: 'clima bayahibe', clicks: 18, impressions: 3920, position: 7.5 },
    { query: 'cosa rara', clicks: 0, impressions: 20, position: 40 },
  ]
  it('las oportunidades excluyen marca, top 3 y lo que no tiene impresiones', () => {
    const o = opportunities(rows)
    expect(o.map(r => r.query)).toEqual(['clima bayahibe', 'paquetes a bayahibe all inclusive 2027'])
  })
  it('el top no-marca va por clics', () => {
    expect(topNonBrand(rows, 2).map(r => r.query)).toEqual(['paquetes f1 brasil 2026', 'clima bayahibe'])
  })
})

describe('serpSummary', () => {
  it('cuenta top3, top10, sin ranking, AI Overview y pack local', () => {
    const s = serpSummary([
      { keyword: 'a', position: 2, aiOverview: true, inAiOverview: false, localPackRank: 2 },
      { keyword: 'b', position: 8, aiOverview: false, inAiOverview: false, localPackRank: null },
      { keyword: 'c', position: null, aiOverview: true, inAiOverview: true, localPackRank: null },
    ])
    expect(s).toEqual({ keywords: 3, top3: 1, top10: 2, notRanking: 1, withAiOverview: 2, citedInAiOverview: 1, inLocalPack: 1 })
  })
})

describe('aiShareOfVoice + competitorMentions', () => {
  const probes = [
    { engine: 'chatgpt', mentioned: true, cited: true, competitors: ['Despegar', 'Almundo'] },
    { engine: 'chatgpt', mentioned: false, cited: false, competitors: ['Despegar'] },
    { engine: 'chatgpt', mentioned: false, cited: false, competitors: [], error: 'timeout' },
    { engine: 'gemini', mentioned: false, cited: false, competitors: ['Almundo'] },
  ]
  it('calcula el share por motor sin contar las sondas con error', () => {
    const s = aiShareOfVoice(probes)
    const chatgpt = s.find(e => e.engine === 'chatgpt')!
    expect(chatgpt).toEqual({ engine: 'chatgpt', asked: 3, answered: 2, mentioned: 1, cited: 1, share: 0.5 })
    expect(s.find(e => e.engine === 'gemini')!.share).toBe(0)
  })
  it('rankea competidores', () => {
    expect(competitorMentions(probes)).toEqual([
      { name: 'Almundo', count: 2 },
      { name: 'Despegar', count: 2 },
    ])
  })
})
