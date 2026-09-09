import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysInMonth,
  generateDatePairs,
  isoDow,
  monthLabel,
  monthOf,
  monthShort,
  monthsAhead,
  todayIso,
} from '../date-pairs'

const HOY = new Date(Date.UTC(2026, 8, 9)) // miércoles 9 de septiembre de 2026

describe('helpers de calendario', () => {
  it('monthsAhead arranca en el mes de hoy', () => {
    const meses = monthsAhead(HOY, 12)
    expect(meses).toHaveLength(12)
    expect(meses[0]).toBe('2026-09')
    expect(meses[11]).toBe('2027-08')
  })

  it('monthLabel y monthShort usan nombres fijos en español', () => {
    expect(monthLabel('2026-12')).toBe('Diciembre 2026')
    expect(monthLabel('2027-01')).toBe('Enero 2027')
    expect(monthShort('2026-12')).toBe('DIC 2026')
  })

  it('monthOf, addDays, isoDow, daysInMonth y todayIso', () => {
    expect(monthOf('2026-12-24')).toBe('2026-12')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(isoDow('2026-09-09')).toBe(3)
    expect(isoDow('2026-09-13')).toBe(7)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-12')).toBe(31)
    expect(todayIso(HOY)).toBe('2026-09-09')
  })
})

describe('generateDatePairs', () => {
  const base = { month: '2026-12', today: HOY, weekdays: [2, 5], stays: [7, 10, 14], perMonth: 8, minLeadDays: 3 }

  it('sin rotationSeed devuelve solo los pares fijos (round robin de estadías)', () => {
    expect(generateDatePairs(base)).toEqual([
      { depart: '2026-12-01', return: '2026-12-08', nights: 7 },
      { depart: '2026-12-04', return: '2026-12-14', nights: 10 },
      { depart: '2026-12-08', return: '2026-12-22', nights: 14 },
      { depart: '2026-12-11', return: '2026-12-18', nights: 7 },
      { depart: '2026-12-15', return: '2026-12-25', nights: 10 },
      { depart: '2026-12-18', return: '2027-01-01', nights: 14 },
      { depart: '2026-12-22', return: '2026-12-29', nights: 7 },
      { depart: '2026-12-25', return: '2027-01-04', nights: 10 },
    ])
  })

  it('es determinista', () => {
    const a = generateDatePairs({ ...base, rotationSeed: 'MIA-BUE' })
    const b = generateDatePairs({ ...base, rotationSeed: 'MIA-BUE' })
    expect(a).toEqual(b)
  })

  it('respeta perMonth, el mes, las estadías y no repite pares', () => {
    const pares = generateDatePairs({ ...base, rotationSeed: 'MIA-BUE' })
    expect(pares.length).toBeLessThanOrEqual(base.perMonth)
    for (const p of pares) {
      expect(monthOf(p.depart)).toBe('2026-12')
      expect(base.stays).toContain(p.nights)
      expect(base.weekdays).toContain(isoDow(p.depart))
      expect(addDays(p.depart, p.nights)).toBe(p.return)
    }
    const claves = new Set(pares.map((p) => `${p.depart}|${p.return}`))
    expect(claves.size).toBe(pares.length)
  })

  it('viene ordenado por salida', () => {
    const pares = generateDatePairs({ ...base, rotationSeed: 'MIA-BUE' })
    const salidas = pares.map((p) => p.depart)
    expect([...salidas].sort()).toEqual(salidas)
  })

  it('no propone nada antes de hoy + minLeadDays', () => {
    const pares = generateDatePairs({ ...base, month: '2026-09', minLeadDays: 5, weekdays: [], perMonth: 40 })
    expect(pares.length).toBeGreaterThan(0)
    for (const p of pares) expect(p.depart >= '2026-09-14').toBe(true)
  })

  it('sin weekdays toma todas las fechas del mes', () => {
    const pares = generateDatePairs({ ...base, weekdays: [], perMonth: 31, stays: [7] })
    expect(pares).toHaveLength(31)
    expect(pares[0].depart).toBe('2026-12-01')
  })

  it('un rotationSeed distinto cambia como máximo 2 pares', () => {
    const a = generateDatePairs({ ...base, rotationSeed: 'semana-1' })
    const b = generateDatePairs({ ...base, rotationSeed: 'semana-2' })
    const clavesA = new Set(a.map((p) => `${p.depart}|${p.return}`))
    const distintos = b.filter((p) => !clavesA.has(`${p.depart}|${p.return}`))
    expect(distintos.length).toBeLessThanOrEqual(2)
  })

  it('si no hay candidatas devuelve vacío', () => {
    expect(generateDatePairs({ ...base, month: '2026-09', minLeadDays: 60 })).toEqual([])
  })
})
