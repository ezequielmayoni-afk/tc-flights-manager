import { describe, expect, it } from 'vitest'
import { ALL_WEEKDAYS, candidateDepartures, groupsFor, probeGroupLabel, probeGroupsSchema, requestColumnsFromGroups } from '../requests'
import { buildCupoRequestMail } from '../mail'

describe('candidateDepartures con cantidad exacta', () => {
  it('5 fechas en enero con todos los días: exactamente 5, repartidas en el mes', () => {
    const d = candidateDepartures({ months: ['2027-01'], weekdays: ALL_WEEKDAYS, today: '2026-10-19', maxDates: 5 })
    expect(d).toEqual(['2027-01-01', '2027-01-09', '2027-01-16', '2027-01-24', '2027-01-31'])
  })
  it('un mes con todos los días y tope 24 usa las 24 (antes daba 16)', () => {
    expect(candidateDepartures({ months: ['2027-01'], weekdays: ALL_WEEKDAYS, today: '2026-10-19', maxDates: 24 })).toHaveLength(24)
  })
  it('el resto se reparte entre meses: 5 fechas en 2 meses = 3 + 2', () => {
    const d = candidateDepartures({ months: ['2027-01', '2027-02'], weekdays: ALL_WEEKDAYS, today: '2026-10-19', maxDates: 5 })
    expect(d.filter(x => x.startsWith('2027-01'))).toHaveLength(3)
    expect(d.filter(x => x.startsWith('2027-02'))).toHaveLength(2)
  })
  it('si hay menos fechas que las pedidas, devuelve todas', () => {
    expect(candidateDepartures({ months: ['2027-01'], weekdays: [6], today: '2026-10-19', maxDates: 20 })).toHaveLength(5)
  })
})

describe('sondeos del pedido', () => {
  const groups = probeGroupsSchema.parse([
    { months: ['2027-01'], nights: 7, count: 5 },
    { months: ['2027-01'], nights: 9, count: 8, airlinePref: ['JetSMART'], directOnly: true, seats: 16 },
  ])
  it('arma las columnas del pedido y conserva cada configuración', () => {
    const cols = requestColumnsFromGroups(groups)
    expect(cols.months).toEqual(['2027-01'])
    expect(cols.probe_groups[1]).toMatchObject({ nights: 9, count: 8, directOnly: true, airlinePref: ['JetSMART'], seats: 16 })
    expect(cols.probe_groups[0].weekdays).toEqual(ALL_WEEKDAYS)
    const g = groupsFor({ ...cols, airline_pref: cols.airline_pref, direct_only: cols.direct_only })
    expect(g.legacy).toBe(false)
    expect(probeGroupLabel(g.groups[1])).toBe('8 fechas · 9 noches · ene-27 · sólo directos · JetSMART · 16 lugares')
  })
  it('un pedido viejo es un solo sondeo de hasta 24 fechas', () => {
    const g = groupsFor({ probe_groups: [], months: ['2027-03'], nights: 7, weekdays: [4, 6], airline_pref: [], direct_only: false })
    expect(g).toMatchObject({ legacy: true, groups: [{ count: 24, nights: 7, weekdays: [4, 6] }] })
  })
  it('tope de 48 fechas entre todos los sondeos', () => {
    expect(probeGroupsSchema.safeParse([{ months: ['2027-01'], nights: 7, count: 30 }, { months: ['2027-02'], nights: 9, count: 30 }]).success).toBe(false)
  })
})

describe('mail del pedido a aéreos', () => {
  const opt = (d: string, r: string, nights: number, g: number) => ({ departure_date: d, return_date: r, nights, airline: 'JetSMART', flight_out: 'JA3840', flight_back: 'JA3841', depart_out: '05:30', direct: true, seats: 10, probe_group: g, probe_group_label: null })
  const mail = buildCupoRequestMail({
    request: { id: 7, origin_code: 'BUE', origin_name: 'Buenos Aires', destination_name: 'Maceió', seats_requested: 10, adults: 2, notes: 'Preferimos salidas de mañana' },
    options: [opt('2027-01-09', '2027-01-18', 9, 1), opt('2027-01-02', '2027-01-09', 7, 0)],
    settings: { subjectPrefix: '[SI VIAJO]', signature: null, fromName: 'Aéreos Si, Viajo' }, deadline: new Date('2026-10-22T15:00:00Z'),
  })
  it('asunto con ruta, meses y cantidad de salidas', () => { expect(mail.subject).toBe('[SI VIAJO] Pedido de cupos #7 · Buenos Aires → Maceió · ene 27 · 2 salidas') })
  it('agrupa por sondeo, pide condiciones y no muestra precio de sistema', () => {
    expect(mail.text.indexOf('Salidas de 7 noches')).toBeLessThan(mail.text.indexOf('Salidas de 9 noches'))
    expect(mail.text).toContain('Seña: porcentaje o monto por plaza y fecha de pago.')
    expect(mail.text).toContain('Preferimos salidas de mañana')
    expect(mail.text).not.toMatch(/USD|sistema/i)
    expect(mail.html).toContain('<table')
  })
})
