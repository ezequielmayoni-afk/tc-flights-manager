import { describe, expect, it } from 'vitest'
import { filtersWith, filtersWithout, hasActiveFilters, parseExplorerFilters, serializeExplorerFilters } from '../filters'
import type { ExplorerFilters } from '../types'

function aRecord(qs: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(qs))
}

const COMPLETO: ExplorerFilters = {
  month: '2026-12',
  stops: 1,
  direct: true,
  stayMin: 7,
  stayMax: 14,
  departFrom: '2026-12-01',
  departTo: '2026-12-20',
  returnFrom: '2026-12-08',
  returnTo: '2027-01-05',
  departDow: [6, 7],
  returnDow: [1],
  priceMin: 500,
  priceMax: 900,
  airlines: ['AR', 'LA'],
  sort: 'duration',
  dir: 'desc',
  page: 3,
}

describe('parse/serialize', () => {
  it('hace round-trip con todos los campos', () => {
    expect(parseExplorerFilters(aRecord(serializeExplorerFilters(COMPLETO)))).toEqual(COMPLETO)
  })

  it('mantiene el orden de las claves y omite los valores por defecto', () => {
    const qs = serializeExplorerFilters(COMPLETO)
    expect([...new URLSearchParams(qs).keys()]).toEqual(['m', 'stops', 'direct', 'stay', 'dep', 'ret', 'dow', 'rdow', 'price', 'air', 'sort', 'dir', 'page'])
    expect(serializeExplorerFilters({ sort: 'price', dir: 'asc', page: 1 })).toBe('')
    expect(serializeExplorerFilters({ sort: 'price', dir: 'asc', page: 2, month: '2026-12' })).toBe('m=2026-12&page=2')
  })

  it('hace round-trip con una aerolínea con coma en el nombre', () => {
    const f: ExplorerFilters = { ...COMPLETO, airlines: ['Air Europa, S.A.', 'LA'] }
    const qs = serializeExplorerFilters(f)
    expect(parseExplorerFilters(aRecord(qs))?.airlines).toEqual(['Air Europa, S.A.', 'LA'])
    expect(parseExplorerFilters(aRecord(qs))).toEqual(f)
  })

  it('ignora los rangos de fecha que no existen en el calendario', () => {
    const vacio = { sort: 'price', dir: 'asc', page: 1 }
    expect(parseExplorerFilters({ dep: '2026-13-45..' })).toEqual(vacio)
    expect(parseExplorerFilters({ dep: '2026-02-29..2026-03-05' })).toEqual(vacio)
    expect(parseExplorerFilters({ ret: '..2026-04-31' })).toEqual(vacio)
    expect(parseExplorerFilters({ dep: '2028-02-29..' })).toMatchObject({ departFrom: '2028-02-29' })
  })

  it('acepta rangos abiertos', () => {
    expect(parseExplorerFilters({ stay: '7-' })).toMatchObject({ stayMin: 7 })
    expect(parseExplorerFilters({ stay: '-14' })).toMatchObject({ stayMax: 14 })
    expect(parseExplorerFilters({ price: '500-' })).toMatchObject({ priceMin: 500 })
  })

  it('ignora los valores inválidos y aplica los defaults', () => {
    const f = parseExplorerFilters({ m: '2026-13', stops: '9', dep: 'foo', ret: '2026-12-01..nada', dow: '0,9', price: 'x-y', page: '-1', sort: 'raro', dir: 'lateral', direct: '0', air: ' , ' })
    expect(f).toEqual({ sort: 'price', dir: 'asc', page: 1 })
  })

  it('toma el primer valor cuando la query repite la clave', () => {
    expect(parseExplorerFilters({ m: ['2026-12', '2027-01'] }).month).toBe('2026-12')
  })
})

describe('filtersWith / filtersWithout / hasActiveFilters', () => {
  it('filtersWith devuelve una copia y resetea la página', () => {
    const f = filtersWith(COMPLETO, { stops: 0 })
    expect(f.stops).toBe(0)
    expect(f.page).toBe(1)
    expect(COMPLETO.stops).toBe(1)
    expect(filtersWith(COMPLETO, { page: 4 }).page).toBe(4)
  })

  it('filtersWithout saca las claves y resetea la página', () => {
    const f = filtersWithout(COMPLETO, 'stops', 'direct')
    expect(f.stops).toBeUndefined()
    expect(f.direct).toBeUndefined()
    expect(f.page).toBe(1)
    expect(f.month).toBe('2026-12')
  })

  it('hasActiveFilters ignora orden, página y mes', () => {
    expect(hasActiveFilters({ sort: 'price', dir: 'asc', page: 1 })).toBe(false)
    expect(hasActiveFilters({ sort: 'nights', dir: 'desc', page: 3, month: '2026-12' })).toBe(false)
    expect(hasActiveFilters({ sort: 'price', dir: 'asc', page: 1, direct: true })).toBe(true)
    expect(hasActiveFilters(COMPLETO)).toBe(true)
  })
})
