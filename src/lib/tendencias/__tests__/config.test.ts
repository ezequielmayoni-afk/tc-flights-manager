import { describe, expect, it } from 'vitest'
import { isoWeekLabel, slugify, getAllDestinations, DESTINATION_ALIASES } from '../config'

describe('isoWeekLabel', () => {
  it('usa la semana ISO (lunes a domingo)', () => {
    expect(isoWeekLabel(new Date(Date.UTC(2026, 8, 9)))).toBe('2026-W37')   // miércoles
    expect(isoWeekLabel(new Date(Date.UTC(2026, 8, 14)))).toBe('2026-W38')  // lunes siguiente
    expect(isoWeekLabel(new Date(Date.UTC(2026, 8, 13)))).toBe('2026-W37')  // domingo anterior
  })

  it('el 1 de enero puede pertenecer a la última semana del año anterior', () => {
    expect(isoWeekLabel(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53')
    expect(isoWeekLabel(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01')
  })
})

describe('slugify', () => {
  it('saca acentos y símbolos', () => {
    expect(slugify('Curaçao')).toBe('curacao')
    expect(slugify('Rio de Janeiro')).toBe('rio-de-janeiro')
    expect(slugify("Xi'an")).toBe('xi-an')
    expect(slugify('Salvador de Bahía')).toBe('salvador-de-bahia')
    expect(slugify('  Walt Disney World  Resort FL ')).toBe('walt-disney-world-resort-fl')
  })
})

describe('semillas y alias', () => {
  it('no hay slugs semilla repetidos', () => {
    const slugs = getAllDestinations().map(d => d.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('los alias son slugs válidos', () => {
    for (const [slug, aliases] of Object.entries(DESTINATION_ALIASES)) {
      expect(slug).toBe(slugify(slug))
      for (const a of aliases) expect(a).toBe(slugify(a))
    }
  })
})
