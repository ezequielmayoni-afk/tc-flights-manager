import { describe, expect, it } from 'vitest'
import { isLaneOpen, MANUAL_PRIORITY } from '../lanes'

const at = (hourUtc: number) => new Date(Date.UTC(2026, 8, 10, hourUtc, 0, 0))

describe('isLaneOpen', () => {
  it('el cotizador sólo corre lotes de noche (01:00–10:00 UTC)', () => {
    expect(isLaneOpen('cotizador', 5, at(2))).toBe(true)
    expect(isLaneOpen('cotizador', 5, at(9))).toBe(true)
    expect(isLaneOpen('cotizador', 5, at(10))).toBe(false)
    expect(isLaneOpen('cotizador', 5, at(15))).toBe(false)
    expect(isLaneOpen('cotizador', 5, at(0))).toBe(false)
  })

  it('un job manual salta la ventana', () => {
    expect(isLaneOpen('cotizador', MANUAL_PRIORITY, at(15))).toBe(true)
    expect(isLaneOpen('crm', MANUAL_PRIORITY, at(15))).toBe(true)
  })

  it('los lanes sin ventana corren siempre', () => {
    expect(isLaneOpen('default', 5, at(0))).toBe(true)
    expect(isLaneOpen('meta', 5, at(23))).toBe(true)
  })

  it('el CRM sólo se lee en baja carga (05:00–09:00 UTC)', () => {
    expect(isLaneOpen('crm', 5, at(6))).toBe(true)
    expect(isLaneOpen('crm', 5, at(12))).toBe(false)
  })
})
