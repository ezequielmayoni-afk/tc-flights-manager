import { describe, expect, it } from 'vitest'
import { sanitizeTargetingForCreate } from '../client'

describe('sanitizeTargetingForCreate', () => {
  it('agrega el par que Meta exige al crear (explore con explore_home) y no toca el resto', () => {
    const t = sanitizeTargetingForCreate({ geo_locations: { countries: ['AR'] }, instagram_positions: ['stream', 'explore_home'] })
    expect(t.instagram_positions).toEqual(['stream', 'explore_home', 'explore'])
    expect(t.geo_locations).toEqual({ countries: ['AR'] })
    expect(sanitizeTargetingForCreate({ age_min: 25 })).toEqual({ age_min: 25 })
  })
})
