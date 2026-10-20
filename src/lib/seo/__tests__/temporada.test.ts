import { describe, expect, it } from 'vitest'
import { esSemanaSanta, grupoDestino, pascua, temporada, tituloSinFecha } from '../titles'

describe('pascua y Semana Santa', () => {
  it('calcula el Domingo de Pascua', () => {
    expect(pascua(2026).toISOString().slice(0, 10)).toBe('2026-04-05')
    expect(pascua(2027).toISOString().slice(0, 10)).toBe('2027-03-28')
    expect(pascua(2028).toISOString().slice(0, 10)).toBe('2028-04-16')
  })
  it('detecta un viaje que pisa la Semana Santa (Ramos a Pascua)', () => {
    expect(esSemanaSanta('2027-03-24', 7)).toBe(true) // 24 al 31 de marzo; Ramos 21/3, Pascua 28/3
    expect(esSemanaSanta('2027-03-23', 7)).toBe(true)
    expect(esSemanaSanta('2027-03-11', 6)).toBe(false)
    expect(esSemanaSanta('2027-04-10', 7)).toBe(false)
    expect(esSemanaSanta('2026-03-28', 7)).toBe(true) // Pascua 2026 = 5 de abril
  })
})

describe('grupoDestino', () => {
  it('clasifica por nombre de destino', () => {
    expect(grupoDestino(['Punta Cana'])).toBe('caribe')
    expect(grupoDestino(['Costa Mujeres (Cancún)'])).toBe('caribe')
    expect(grupoDestino(['Búzios'])).toBe('brasil')
    expect(grupoDestino(['Porto Seguro', "Arraial d'Ajuda"])).toBe('brasil')
    expect(grupoDestino(['Ushuaia', 'El Calafate'])).toBe('argentina')
    expect(grupoDestino(['Roma', 'Milán', 'Venecia', 'Florencia'])).toBe('europa')
    expect(grupoDestino(['Estambul', 'El Cairo'])).toBe('exotico')
    expect(grupoDestino(['Isla de Sal (Cabo Verde)', 'Lisboa'])).toBe('exotico')
    expect(grupoDestino(['Isla de Sal', 'Lisboa'])).toBe('exotico')
    expect(grupoDestino(['Lima', 'Cusco'])).toBe('exotico')
    expect(grupoDestino(['Orlando'])).toBe('orlando')
  })
})

describe('temporada', () => {
  it('Caribe, Brasil y Argentina: calendario argentino', () => {
    expect(temporada('2026-12-20')).toBe('Verano 2027')
    expect(temporada('2027-01-17')).toBe('Verano 2027')
    expect(temporada('2027-07-10')).toBe('Vacaciones de invierno 2027')
    expect(temporada('2026-11-05')).toBe('Temporada baja 2026')
    expect(temporada('2027-02-08', { grupo: 'argentina', noches: 3 })).toBe('Verano 2027')
    expect(temporada('2027-03-11', { grupo: 'brasil' })).toBe('Marzo 2027')
  })
  it('Semana Santa gana sobre el mes', () => {
    expect(temporada('2027-03-24', { grupo: 'caribe', noches: 7 })).toBe('Semana Santa 2027')
    expect(temporada('2027-03-23', { grupo: 'brasil', noches: 7 })).toBe('Semana Santa 2027')
  })
  it('Europa: verano europeo, primavera, otoño, fin de año y baja', () => {
    expect(temporada('2027-07-02', { grupo: 'europa', noches: 14 })).toBe('Verano europeo 2027')
    expect(temporada('2027-05-10', { grupo: 'europa', noches: 14 })).toBe('Primavera 2027')
    expect(temporada('2026-10-15', { grupo: 'europa', noches: 14 })).toBe('Otoño 2026')
    expect(temporada('2026-12-18', { grupo: 'europa', noches: 13 })).toBe('Fin de año 2026')
    expect(temporada('2026-11-01', { grupo: 'europa', noches: 14 })).toBe('Temporada baja 2026')
    expect(temporada('2027-01-15', { grupo: 'europa', noches: 14 })).toBe('Temporada baja 2027')
  })
  it('Exóticos y Orlando: nunca "temporada baja"', () => {
    expect(temporada('2026-11-07', { grupo: 'exotico', noches: 9 })).toBe('Noviembre 2026')
    expect(temporada('2027-03-11', { grupo: 'exotico', noches: 6 })).toBe('Marzo 2027')
    expect(temporada('2026-11-15', { grupo: 'orlando', noches: 10 })).toBe('Noviembre 2026')
    expect(temporada('2027-07-12', { grupo: 'orlando', noches: 10 })).toBe('Vacaciones de invierno 2027')
  })
  it('eventos: la fecha es el producto', () => {
    expect(temporada('2026-11-05', { grupo: 'evento' })).toBe('5 de noviembre 2026')
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
  it('re-etiqueta una temporada vieja con la regla por destino', () => {
    expect(tituloSinFecha('Paquete a Punta Cana All Inclusive: 7 noches – Marzo 2027', '2027-03-24', { grupo: 'caribe', noches: 7 })).toBe('Paquete a Punta Cana All Inclusive: 7 noches – Semana Santa 2027')
    expect(tituloSinFecha('Paquete a Estambul y China: 11 noches – Temporada baja 2026', '2026-11-11', { grupo: 'exotico', noches: 11 })).toBe('Paquete a Estambul y China: 11 noches – Noviembre 2026')
    expect(tituloSinFecha('Paquete a Italia con desayuno: 14 noches – Temporada baja 2026', '2026-11-01', { grupo: 'europa', noches: 14 })).toBe('Paquete a Italia con desayuno: 14 noches – Temporada baja 2026')
    expect(tituloSinFecha('Salida grupal acompañada a Perú: 8 días – Salidas 2026 y 2027', '2026-11-28', { grupo: 'exotico' })).toBe('Salida grupal acompañada a Perú: 8 días – Noviembre 2026')
  })
})
