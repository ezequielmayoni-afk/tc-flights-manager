import { describe, expect, it } from 'vitest'
import { riskLevelFor } from '../risk'

describe('riskLevelFor', () => {
  it('rojo > 25 % sin vender a ≤ 45 días; amarillo > 40 % a ≤ 60; verde el resto; nada si agotado o voló', () => {
    expect(riskLevelFor({ remaining: 4, total: 10, daysToDeparture: 40 })).toBe('red')
    expect(riskLevelFor({ remaining: 2, total: 10, daysToDeparture: 40 })).toBe('green')
    expect(riskLevelFor({ remaining: 5, total: 10, daysToDeparture: 55 })).toBe('yellow')
    expect(riskLevelFor({ remaining: 5, total: 10, daysToDeparture: 90 })).toBe('green')
    expect(riskLevelFor({ remaining: 0, total: 10, daysToDeparture: 10 })).toBe('none')
    expect(riskLevelFor({ remaining: 5, total: 10, daysToDeparture: -1 })).toBe('none')
  })
})
