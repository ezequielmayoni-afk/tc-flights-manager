import { describe, expect, it } from 'vitest'
import { classifyIntent, computeScores, momentumFor } from '../scoring'
import type { CollectorResult } from '../types'

function collector(source: string, entries: Record<string, { score: number; name?: string; relatedQueries?: Array<{ query: string; value: string }> }>): CollectorResult {
  return {
    source,
    destinations: new Map(Object.entries(entries).map(([slug, e]) => [slug, { rawScore: e.score, normalizedScore: e.score, metadata: { name: e.name, relatedQueries: e.relatedQueries } }])),
    queriesUsed: 1,
    durationMs: 1,
  }
}

describe('classifyIntent', () => {
  it('detecta compra, info y marca', () => {
    expect(classifyIntent('paquete cancun todo incluido')).toBe('buy')
    expect(classifyIntent('cancun requisitos para viajar')).toBe('info')
    expect(classifyIntent('despegar cancun')).toBe('brand')
    expect(classifyIntent('cancun')).toBe('other')
  })
})

describe('momentumFor', () => {
  it('sin corrida anterior es nuevo', () => {
    expect(momentumFor(50, null)).toEqual({ changePct: null, momentum: 'new' })
  })
  it('clasifica por porcentaje de cambio', () => {
    expect(momentumFor(80, 50).momentum).toBe('surging')
    expect(momentumFor(60, 50).momentum).toBe('rising')
    expect(momentumFor(52, 50).momentum).toBe('stable')
    expect(momentumFor(30, 50).momentum).toBe('falling')
    expect(momentumFor(30, 0)).toEqual({ changePct: 100, momentum: 'surging' })
  })
})

describe('computeScores', () => {
  const results = [
    collector('autocomplete', { cancun: { score: 100, name: 'Cancún' }, albania: { score: 40, name: 'Albania' }, roma: { score: 20 } }),
    collector('google_trends', { cancun: { score: 60, relatedQueries: [{ query: 'paquete cancun 2027', value: '+150%' }, { query: 'cancun clima', value: 'Aumento puntual' }] }, roma: { score: 100 } }),
  ]

  it('combina 70/30, normaliza a 100 y rankea', () => {
    const scored = computeScores(results, new Map())
    // cancun = 60*0.7 + 100*0.3 = 72 · roma = 100*0.7 + 20*0.3 = 76 · albania = 12 → roma normaliza a 100
    expect(scored[0].destinationSlug).toBe('roma')
    expect(scored[0].trendScore).toBe(100)
    expect(scored[0].rank).toBe(1)
    const cancun = scored.find(d => d.destinationSlug === 'cancun')!
    expect(cancun.trendScore).toBe(Math.round(72 * (100 / 76)))
    expect(cancun.destination).toBe('Cancún')
    expect(cancun.region).toBe('caribe')
  })

  it('un destino descubierto que no es semilla entra con región "descubierto"', () => {
    const albania = computeScores(results, new Map()).find(d => d.destinationSlug === 'albania')!
    expect(albania.region).toBe('descubierto')
    expect(albania.destination).toBe('Albania')
  })

  it('las semillas sin señal quedan afuera (score 0) y las consultas relacionadas llevan intención', () => {
    const scored = computeScores(results, new Map())
    expect(scored.find(d => d.destinationSlug === 'bariloche')).toBeUndefined()
    const cancun = scored.find(d => d.destinationSlug === 'cancun')!
    expect(cancun.relatedQueries).toEqual([
      { query: 'paquete cancun 2027', value: '+150%', intent: 'buy' },
      { query: 'cancun clima', value: 'Aumento puntual', intent: 'info' },
    ])
  })

  it('el momentum compara el score normalizado con la corrida anterior', () => {
    const scored = computeScores(results, new Map([['roma', 50], ['cancun', 95]]))
    expect(scored.find(d => d.destinationSlug === 'roma')!.momentum).toBe('surging')
    expect(scored.find(d => d.destinationSlug === 'cancun')!.momentum).toBe('stable')
    expect(scored.find(d => d.destinationSlug === 'albania')!.momentum).toBe('new')
  })
})
