import { describe, expect, it } from 'vitest'
import { temporada, tituloSinFecha } from '../titles'

describe('temporada', () => {
  it('mapea la salida a la temporada que se busca', () => {
    expect(temporada('2026-12-20')).toBe('Verano 2027')
    expect(temporada('2027-01-17')).toBe('Verano 2027')
    expect(temporada('2027-07-10')).toBe('Vacaciones de invierno 2027')
    expect(temporada('2026-11-05')).toBe('Temporada baja 2026')
  })
})

describe('tituloSinFecha', () => {
  it('reemplaza la fecha exacta y respeta los títulos sin fecha o con Semana Santa', () => {
    expect(tituloSinFecha('Paquete a Punta Cana All Inclusive: 7 noches – Salida 5 nov 2026', '2026-11-05')).toBe('Paquete a Punta Cana All Inclusive: 7 noches – Temporada baja 2026')
    expect(tituloSinFecha('Paquete a Aruba con desayuno: 7 noches – Salida 10 de febrero 2027', '2027-02-10')).toBe('Paquete a Aruba con desayuno: 7 noches – Verano 2027')
    expect(tituloSinFecha('Paquete a Cancún All Inclusive: 7 noches desde Córdoba – Nov 2026', '2026-11-22')).toBe('Paquete a Cancún All Inclusive: 7 noches desde Córdoba – Temporada baja 2026')
    expect(tituloSinFecha('Paquete a Bayahibe All Inclusive: 9 noches – Verano 2027', '2027-01-17')).toBe('Paquete a Bayahibe All Inclusive: 9 noches – Verano 2027')
    expect(tituloSinFecha('Paquete a Punta Cana en Semana Santa: 7 noches – Salida 24 de marzo 2027', '2027-03-24')).toContain('Semana Santa')
    expect(tituloSinFecha('Salida grupal acompañada a Europa: 17 días, 20 de marzo 2027', '2027-03-20')).toBe('Salida grupal acompañada a Europa: 17 días, 20 de marzo 2027')
  })
})
