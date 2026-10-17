import { describe, expect, it } from 'vitest'
import { extractSivCodes } from '../siv'
import { aggregateDaily, pickClick, pickOpportunity, type AttributionRecord } from '../rollup'

describe('extractSivCodes', () => {
  it('toma los códigos de promo y descarta los números de file', () => {
    expect(extractSivCodes('Hola! Quiero mas info de la promo SIV 55069673 (no borrar)')).toEqual([55069673])
    expect(extractSivCodes('Su FILE es SIV-2622')).toEqual([])
    expect(extractSivCodes('quiero SIV_ 42684558 y tambien siv 38204302')).toEqual([42684558, 38204302])
    expect(extractSivCodes(null)).toEqual([])
  })
})

describe('pickClick / pickOpportunity', () => {
  const at = (s: string) => new Date(s)
  it('elige el último click antes del SIV dentro de 14 días; si no, el último', () => {
    const clicks = [{ contact_id: 'c', timestamp: at('2026-10-01T10:00:00Z'), metadata: { adId: 'a1' } }, { contact_id: 'c', timestamp: at('2026-10-05T10:00:00Z'), metadata: { adId: 'a2' } }, { contact_id: 'c', timestamp: at('2026-10-09T10:00:00Z'), metadata: { adId: 'a3' } }]
    expect(pickClick(clicks, at('2026-10-06T00:00:00Z'))?.metadata?.adId).toBe('a2')
    expect(pickClick(clicks, at('2026-09-01T00:00:00Z'))?.metadata?.adId).toBe('a3')
    expect(pickClick([], at('2026-10-06T00:00:00Z'))).toBeNull()
  })
  it('la oportunidad principal manda', () => {
    const o = (id: string, p: boolean | null, created: string) => ({ id, contact_id: 'c', stage: 'new', status: 'active', is_primary: p, created_at: new Date(created), closed_at: null, closed_reason: null, quoted_value: null, final_value: null, profit: null, currency: null, quotation_count: 0 })
    expect(pickOpportunity([o('b', false, '2026-10-02'), o('a', true, '2026-10-01')])?.id).toBe('a')
    expect(pickOpportunity([o('b', null, '2026-10-02')])?.id).toBe('b')
  })
})

describe('aggregateDaily', () => {
  const rec = (over: Partial<AttributionRecord>): AttributionRecord => ({ contact_id: 'c', tc_package_id: 1, siv_first_at: '2026-10-10T12:00:00Z', siv_messages: 1, ad_id: null, ad_name: null, adset_name: null, campaign_name: null, ad_title: null, ctwa_click_id: null, click_at: null, is_first_touch: null, attribution_confidence: 'siv', assigned_user_id: null, assigned_user_name: null, assigned_team_id: null, assigned_team_name: null, contact_created_at: null, opportunity_id: null, opportunity_stage: null, opportunity_status: null, opportunity_created_at: null, won: false, lost: false, closed_reason: null, closed_at: null, quoted_value: null, final_value: null, profit: null, currency: null, quotations_count: 0, capi_events: [], ...over })
  it('cuenta contactos, oportunidades, cotizados, ganadas con ingresos y margen, por total, vendedor y equipo', () => {
    const rows = aggregateDaily([
      rec({ contact_id: 'a', assigned_user_id: 'u1', assigned_team_id: 't1', opportunity_id: 'o1', quotations_count: 2, won: true, final_value: 3000, profit: 400, capi_events: ['ViewContent', 'Purchase'] }),
      rec({ contact_id: 'b', assigned_user_id: 'u1', opportunity_id: 'o2', lost: true, capi_events: ['AddToCart'] }),
      rec({ contact_id: 'c', tc_package_id: 2 }),
    ])
    const total1 = rows.find(r => r.tc_package_id === 1 && r.assigned_user_id === '*' && r.assigned_team_id === '*')!
    expect(total1).toMatchObject({ contacts_new: 2, opportunities_created: 2, quotations_sent: 1, won: 1, lost: 1, revenue_won: 3000, profit_won: 400, view_content: 1, purchase: 1, add_to_cart: 1 })
    expect(rows.find(r => r.tc_package_id === 1 && r.assigned_user_id === 'u1')?.contacts_new).toBe(2)
    expect(rows.find(r => r.tc_package_id === 1 && r.assigned_team_id === 't1')?.won).toBe(1)
    expect(rows.find(r => r.tc_package_id === 2 && r.assigned_user_id === '*')?.contacts_new).toBe(1)
  })
})
