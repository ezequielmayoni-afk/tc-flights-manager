import { describe, expect, it, vi } from 'vitest'
import { LlmBudgetExhausted, runGeoProbe, type GeoProbeInsert } from '../geo-probe'

const PROMPTS = [
  { id: 1, prompt: '¿Mejores agencias de viajes de Argentina?' },
  { id: 2, prompt: '¿Sí, Viajo es confiable?' },
]

describe('runGeoProbe', () => {
  it('pregunta a cada motor disponible, guarda la lectura y omite los que faltan', async () => {
    const saved: GeoProbeInsert[] = []
    const log = vi.fn(async () => {})
    const s = await runGeoProbe({
      prompts: PROMPTS,
      week: '2026-W42',
      engines: {
        chatgpt: async prompt => ({ text: prompt.includes('Sí, Viajo') ? 'Sí, Viajo tiene 1.900 reseñas.' : 'Despegar y Almundo.', citations: ['https://www.siviajo.com/'], model: 'gpt-5.1' }),
        claude: async () => ({ text: 'Almundo.', citations: [], model: 'claude-opus-5-5' }),
      },
      save: async r => {
        saved.push(r)
      },
      heartbeat: async () => {},
      log,
    })
    expect(s.engines).toEqual(['chatgpt', 'claude'])
    expect(s).toMatchObject({ prompts: 2, asked: 4, answered: 4, mentioned: 2, cited: 2, errors: 0, budgetStopped: false })
    expect(saved).toHaveLength(4)
    expect(saved[0]).toMatchObject({ promptId: 1, engine: 'chatgpt', mentioned: true, cited: true, competitors: ['Despegar', 'Almundo'], model: 'gpt-5.1', error: null })
    expect(saved[1]).toMatchObject({ promptId: 1, engine: 'claude', mentioned: false, competitors: ['Almundo'] })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('gemini'), undefined, 'warning')
  })

  it('un motor que falla se guarda con error y se sigue; el presupuesto agotado corta todo', async () => {
    const saved: GeoProbeInsert[] = []
    let n = 0
    const s = await runGeoProbe({
      prompts: PROMPTS,
      week: '2026-W42',
      engines: {
        chatgpt: async () => {
          n++
          if (n === 1) throw new Error('rate limit')
          throw new LlmBudgetExhausted(100)
        },
        gemini: async () => ({ text: 'ok', citations: [], model: 'gemini-2.5-flash' }),
      },
      save: async r => {
        saved.push(r)
      },
      heartbeat: async () => {},
      log: vi.fn(async () => {}),
    })
    expect(saved[0]).toMatchObject({ engine: 'chatgpt', error: 'rate limit', mentioned: false })
    expect(saved[1]).toMatchObject({ engine: 'gemini', error: null })
    expect(s.errors).toBe(1)
    expect(s.answered).toBe(1)
    expect(s.budgetStopped).toBe(true)
    expect(saved).toHaveLength(2)
  })
})
