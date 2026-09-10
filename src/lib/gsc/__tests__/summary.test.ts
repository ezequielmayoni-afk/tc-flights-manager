import { describe, expect, it } from 'vitest'
import { aggregatePageStats } from '../summary'
import type { PageStatRow } from '../types'

/**
 * La agregación que alimenta la card de Search Console del admin (lo que
 * `getGscSummary` hace en TS sobre las filas de `gsc_page_stats`).
 *
 * Las dos cuentas que importan: el CTR es clicks/impresiones del total (no el
 * promedio de los CTR diarios) y la posición media va ponderada por
 * impresiones (un día con 3 impresiones en la posición 1 no vale lo mismo que
 * uno con 3.000 en la 40).
 */

function fila(over: Partial<PageStatRow> = {}): PageStatRow {
  return {
    date: '2026-09-08',
    page: 'https://vuelos.siviajo.com/vuelos-baratos',
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    ...over,
  }
}

describe('aggregatePageStats', () => {
  it('suma clicks e impresiones y saca el CTR del total', () => {
    const totals = aggregatePageStats([
      fila({ clicks: 3, impressions: 100, ctr: 0.03, position: 10 }),
      fila({ date: '2026-09-09', clicks: 7, impressions: 300, ctr: 0.0233, position: 10 }),
    ])

    expect(totals.clicks).toBe(10)
    expect(totals.impressions).toBe(400)
    expect(totals.ctr).toBeCloseTo(10 / 400, 10)
  })

  it('pondera la posición media por impresiones, no por día', () => {
    const totals = aggregatePageStats([
      fila({ impressions: 10, position: 3 }),
      fila({ date: '2026-09-09', impressions: 90, position: 13 }),
    ])

    // (10×3 + 90×13) / 100 = 12
    expect(totals.position).toBeCloseTo(12, 10)
  })

  it('sin impresiones no divide por cero', () => {
    const totals = aggregatePageStats([fila({ position: 40 }), fila({ date: '2026-09-09', position: 12 })])

    expect(totals.impressions).toBe(0)
    expect(totals.ctr).toBe(0)
    expect(totals.position).toBe(0)
    expect(totals.pages).toHaveLength(1)
    expect(totals.pages[0].position).toBe(0)
  })

  it('sin filas devuelve todo en cero', () => {
    expect(aggregatePageStats([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0, pages: [] })
  })

  it('agrupa por página con su propia posición ponderada y ordena por clicks', () => {
    const landing = 'https://vuelos.siviajo.com/vuelos-baratos'
    const miami = 'https://vuelos.siviajo.com/vuelos-baratos/miami'
    const madrid = 'https://vuelos.siviajo.com/vuelos-baratos/madrid'

    const totals = aggregatePageStats([
      fila({ page: landing, clicks: 1, impressions: 100, position: 20 }),
      fila({ page: landing, date: '2026-09-09', clicks: 1, impressions: 100, position: 10 }),
      fila({ page: miami, clicks: 5, impressions: 50, position: 4 }),
      fila({ page: madrid, clicks: 0, impressions: 900, position: 55 }),
    ])

    expect(totals.pages.map(p => p.page)).toEqual([miami, landing, madrid])
    expect(totals.pages[0]).toEqual({ page: miami, clicks: 5, impressions: 50, position: 4 })
    // (100×20 + 100×10) / 200 = 15
    expect(totals.pages[1].position).toBeCloseTo(15, 10)
    expect(totals.pages[1].impressions).toBe(200)
  })

  it('a igual cantidad de clicks manda el que más se mostró', () => {
    const a = 'https://vuelos.siviajo.com/a'
    const b = 'https://vuelos.siviajo.com/b'

    const totals = aggregatePageStats([
      fila({ page: a, clicks: 2, impressions: 10, position: 5 }),
      fila({ page: b, clicks: 2, impressions: 900, position: 30 }),
    ])

    expect(totals.pages.map(p => p.page)).toEqual([b, a])
  })
})
