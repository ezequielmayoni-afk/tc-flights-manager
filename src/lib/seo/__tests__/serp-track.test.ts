import { describe, expect, it, vi } from 'vitest'
import { SerpApiBudgetExhausted } from '@/lib/serpapi/client'
import { SERP_PARAMS, runSerpTrack, type SerpCheckInsert } from '../serp-track'

const KW = [
  { id: 1, keyword: 'paquetes f1 brasil 2026' },
  { id: 2, keyword: 'paquetes a punta cana' },
  { id: 3, keyword: 'agencia de viajes rosario' },
]

function raw(ownPosition: number | null) {
  const organic = [{ position: 1, title: 'a', link: 'https://almundo.com.ar/' }]
  if (ownPosition) organic.push({ position: ownPosition, title: 'nosotros', link: 'https://www.siviajo.com/es/x' })
  return { organic_results: organic }
}

describe('runSerpTrack', () => {
  it('busca cada consulta con los parámetros de Argentina y guarda la lectura', async () => {
    const saved: SerpCheckInsert[] = []
    const params: Record<string, string>[] = []
    const s = await runSerpTrack({
      keywords: KW,
      week: '2026-W42',
      search: async p => {
        params.push(p)
        return p.q === KW[0].keyword ? raw(2) : p.q === KW[1].keyword ? raw(12) : raw(null)
      },
      save: async r => {
        saved.push(r)
      },
      heartbeat: vi.fn(async () => {}),
      log: vi.fn(async () => {}),
    })
    expect(params[0]).toMatchObject({ ...SERP_PARAMS, q: KW[0].keyword })
    expect(s).toMatchObject({ keywords: 3, checked: 3, ranking: 2, top10: 1, inAiOverview: 0, errors: 0, budgetStopped: false })
    expect(saved.map(r => [r.keywordId, r.position, r.week])).toEqual([
      [1, 2, '2026-W42'],
      [2, 12, '2026-W42'],
      [3, null, '2026-W42'],
    ])
  })

  it('corta cuando se acaba el presupuesto y cuenta errores sueltos', async () => {
    let n = 0
    const s = await runSerpTrack({
      keywords: KW,
      week: '2026-W42',
      search: async () => {
        n++
        if (n === 1) throw new Error('503')
        throw new SerpApiBudgetExhausted(100)
      },
      save: async () => {},
      heartbeat: async () => {},
      log: vi.fn(async () => {}),
    })
    expect(s.errors).toBe(1)
    expect(s.checked).toBe(0)
    expect(s.budgetStopped).toBe(true)
  })
})
