import { describe, expect, it } from 'vitest'
import { groupBySignature, productSignature } from '../departure-groups'

const pkg = (id: number, codes: string[], nights: number | null, date: string | null, group: string | null = null, origin = 'BUE') => ({ id, originCode: origin, destinationCodes: codes, nightsCount: nights, departureDate: date, currentGroupId: group })

describe('productSignature', () => {
  it('origen + destinos en orden + noches', () => {
    expect(productSignature(pkg(1, ['RIO', 'BZI'], 7, null))).toBe('BUE|RIO+BZI|7')
    expect(productSignature(pkg(1, ['BZI', 'RIO'], 7, null))).toBe('BUE|BZI+RIO|7')
    expect(productSignature(pkg(1, [], 7, null))).toBeNull()
  })
})

describe('groupBySignature', () => {
  it('agrupa el mismo producto en distintas fechas y numera por fecha; los distintos productos del mismo cupo no se mezclan', () => {
    const a = groupBySignature([
      pkg(1, ['RIO'], 7, '2027-01-10'),
      pkg(2, ['RIO'], 7, '2027-02-14'),
      pkg(3, ['RIO'], 7, '2027-03-20'),
      pkg(4, ['BZI'], 7, '2027-01-10'),
      pkg(5, ['RIO', 'BZI'], 7, '2027-01-10'),
      pkg(6, ['PUJ'], 7, '2027-01-17'),
    ])
    const byId = Object.fromEntries(a.map(x => [x.packageId, x]))
    expect(byId[1].groupId).toBe(byId[2].groupId)
    expect(byId[2].groupId).toBe(byId[3].groupId)
    expect([byId[1].index, byId[2].index, byId[3].index]).toEqual([1, 2, 3])
    expect(byId[4].groupId).toBeNull()
    expect(byId[5].groupId).toBeNull()
    expect(byId[6].groupId).toBeNull()
    expect(byId[1].groupId).toMatch(/^auto:/)
  })

  it('un grupo manual se respeta y absorbe a los nuevos de la misma firma', () => {
    const a = groupBySignature([
      pkg(1, ['PUJ'], 7, '2027-01-17', 'grp-manual'),
      pkg(2, ['PUJ'], 7, '2027-02-13', 'grp-manual'),
      pkg(3, ['PUJ'], 7, '2027-03-24'),
    ])
    expect(a.map(x => x.groupId)).toEqual(['grp-manual', 'grp-manual', 'grp-manual'])
  })

  it('distintas noches son distintos productos', () => {
    const a = groupBySignature([pkg(1, ['PUJ'], 7, '2027-01-17'), pkg(2, ['PUJ'], 10, '2027-02-13')])
    expect(a.every(x => x.groupId === null)).toBe(true)
  })
})
