import { describe, expect, it } from 'vitest'
import { seasonWindowFor } from '../season-window'

const PUJ = [1, 2, 7, 12]

describe('seasonWindowFor', () => {
  it('enero en temporada alta → enero y febrero del mismo año', () => {
    const w = seasonWindowFor('2027-01-17', PUJ, { today: '2026-09-11' })
    expect(w).toMatchObject({ kind: 'alta', months: [1, 2], from: '2027-01-01', to: '2027-02-28' })
    expect(w?.label).toContain('enero–febrero 2027')
  })
  it('diciembre no se mezcla con enero: bloque del mismo año', () => {
    expect(seasonWindowFor('2026-12-20', PUJ, { today: '2026-09-11' })).toMatchObject({ kind: 'alta', months: [12], from: '2026-12-01', to: '2026-12-31' })
  })
  it('julio solo', () => {
    expect(seasonWindowFor('2027-07-10', PUJ, { today: '2026-09-11' })).toMatchObject({ kind: 'alta', months: [7] })
  })
  it('temporada baja larga se recorta a un mes de cada lado de la salida', () => {
    const w = seasonWindowFor('2027-04-20', PUJ, { today: '2026-09-11' })
    expect(w).toMatchObject({ kind: 'baja', months: [3, 4, 5, 6], from: '2027-03-20', to: '2027-05-21' })
  })
  it('no propone fechas antes de hoy más el plazo mínimo', () => {
    const w = seasonWindowFor('2026-09-20', PUJ, { today: '2026-09-11', minLeadDays: 14 })
    expect(w?.from).toBe('2026-09-25')
    expect(w?.to).toBe('2026-10-21')
  })
  it('si la ventana ya pasó, no hay propuesta', () => {
    expect(seasonWindowFor('2026-07-10', PUJ, { today: '2026-09-11' })).toBeNull()
  })
  it('sin meses altos cargados todo es temporada baja', () => {
    expect(seasonWindowFor('2027-01-17', [], { today: '2026-09-11' })).toMatchObject({ kind: 'baja', from: '2027-01-01', to: '2027-02-17' })
  })
})
