import { describe, expect, it } from 'vitest'
import { normalizeFlightNumber } from '../flight-match'

describe('normalizeFlightNumber', () => {
  it('saca la aerolínea y los ceros a la izquierda', () => {
    expect(normalizeFlightNumber('AR 0502')).toBe('502')
    expect(normalizeFlightNumber('AR502')).toBe('502')
    expect(normalizeFlightNumber('0502')).toBe('502')
    expect(normalizeFlightNumber('502')).toBe('502')
  })

  it('rechaza lo que no es un número de vuelo', () => {
    expect(normalizeFlightNumber(null)).toBeNull()
    expect(normalizeFlightNumber('')).toBeNull()
    expect(normalizeFlightNumber('ABCD 12')).toBeNull()
    expect(normalizeFlightNumber('AR 123456')).toBeNull()
  })
})
