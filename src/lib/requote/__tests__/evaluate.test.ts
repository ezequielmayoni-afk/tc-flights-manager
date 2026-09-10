import { describe, expect, it } from 'vitest'
import { evaluateRequote } from '../evaluate'

const base = { referencePrice: 1000, thresholdPct: 10, hotelMatched: true, expectedHotel: 'VIK Arena Blanca', quotedHotel: 'VIK Arena Blanca', quoteStatus: 'ok' }

describe('evaluateRequote', () => {
  it('sube más que el umbral → revisión manual', () => {
    const r = evaluateRequote({ ...base, newPrice: 1150 })
    expect(r.status).toBe('needs_manual'); expect(r.action).toBe('marked_manual'); expect(r.variancePct).toBe(15)
    expect(r.note).toContain('+15.0%')
  })
  it('sube menos que el umbral → al día', () => {
    const r = evaluateRequote({ ...base, newPrice: 1080 })
    expect(r.status).toBe('completed'); expect(r.action).toBe('no_change'); expect(r.variancePct).toBe(8)
  })
  it('exactamente el umbral no es revisión manual (misma regla que el bot: > umbral)', () => {
    expect(evaluateRequote({ ...base, newPrice: 1100 }).status).toBe('completed')
  })
  it('baja más que el umbral → al día pero avisa para actualizar la idea', () => {
    const r = evaluateRequote({ ...base, newPrice: 850 })
    expect(r.status).toBe('completed'); expect(r.action).toBe('price_dropped'); expect(r.note).toContain('actualizar la idea')
  })
  it('el hotel no apareció → revisión manual aunque el precio esté dentro del umbral', () => {
    const r = evaluateRequote({ ...base, newPrice: 990, hotelMatched: false, quotedHotel: 'Otro Resort' })
    expect(r.status).toBe('needs_manual'); expect(r.note).toContain('VIK Arena Blanca'); expect(r.note).toContain('Otro Resort')
  })
  it('sin precio del cotizador → queda pendiente y se anota el motivo', () => {
    const r = evaluateRequote({ ...base, newPrice: null, quoteStatus: 'sin_disponibilidad', diagnostico: 'no hay vuelos' })
    expect(r.status).toBe('pending'); expect(r.action).toBe('error'); expect(r.variancePct).toBeNull(); expect(r.note).toContain('no hay vuelos')
  })
  it('sin precio de referencia → pendiente', () => {
    expect(evaluateRequote({ ...base, referencePrice: null, newPrice: 900 }).status).toBe('pending')
  })
})
