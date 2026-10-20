import { describe, expect, it } from 'vitest'
import { buildDriftMessage, etiquetaDe, etiquetaEsperada, findTitleDrift, metaConTemporada, type DriftCandidate } from '../title-drift'

const base: DriftCandidate = {
  tcPackageId: 38204302,
  title: 'Paquete a Punta Cana y Bayahibe All Inclusive: 9 noches – Temporada baja 2026',
  metaTitle: 'Paquete a Punta Cana y Bayahibe Temporada baja 2026: 9 noches | Sí, Viajo',
  metaDescription: 'Viajá a Punta Cana y Bayahibe en temporada baja 2026: 9 noches all inclusive con vuelo directo.',
  departureDate: '2026-11-26',
  dateRangeEnd: '2026-11-26',
  destinations: ['Punta Cana', 'Bayahibe'],
  nights: 9,
  impressions: 120,
  clicks: 6,
  url: 'https://www.siviajo.com/es/idea/38204302/x',
}

describe('etiquetaDe', () => {
  it('lee la temporada del final del título', () => {
    expect(etiquetaDe(base.title)).toBe('Temporada baja 2026')
    expect(etiquetaDe('Salida grupal acompañada a Europa: 17 días, 20 de marzo 2027')).toBeNull()
    expect(etiquetaDe('Paquete F1 Brasil 2026: 4 noches en San Pablo + entrada Interlagos')).toBeNull()
    expect(etiquetaDe('BURGERPALUSA 2026 Vuelos + Hotel + Tickets + Traslados - Desde Salta')).toBeNull()
    expect(etiquetaDe('Paquete a Maragogi - 9 noches - 20 septiembre - Promo últimos lugares!!')).toBeNull()
    expect(etiquetaDe('Paquete a Estambul y China: 11 noches – Noviembre 2026')).toBe('Noviembre 2026')
    expect(etiquetaDe('Salida grupal acompañada a Perú: 8 días – Salidas 2026 y 2027')).toBe('Salidas 2026 y 2027')
  })
})

describe('etiquetaEsperada', () => {
  it('usa la temporada por destino de la salida cargada', () => {
    expect(etiquetaEsperada(base)?.label).toBe('Temporada baja 2026')
    expect(etiquetaEsperada({ ...base, departureDate: '2027-04-14', dateRangeEnd: '2027-04-14' })?.label).toBe('Temporada baja 2027')
    expect(etiquetaEsperada({ ...base, departureDate: '2027-03-24', dateRangeEnd: '2027-03-24', nights: 7 })?.label).toBe('Semana Santa 2027')
    expect(etiquetaEsperada({ ...base, destinations: ['Estambul', 'El Cairo'], departureDate: '2026-11-07', dateRangeEnd: '2026-11-07' })?.label).toBe('Noviembre 2026')
  })
  it('con un rango de salidas corto manda la próxima; con uno largo, "Salidas {año}"', () => {
    expect(etiquetaEsperada({ ...base, departureDate: '2027-02-10', dateRangeEnd: '2027-03-31' })?.label).toBe('Verano 2027')
    expect(etiquetaEsperada({ ...base, departureDate: '2026-10-19', dateRangeEnd: '2026-12-20' })?.label).toBe('Temporada baja 2026')
    expect(etiquetaEsperada({ ...base, departureDate: '2026-05-23', dateRangeEnd: '2026-12-05' })?.label).toBe('Salidas 2026')
    expect(etiquetaEsperada({ ...base, departureDate: '2026-11-11', dateRangeEnd: '2027-06-30' })?.label).toBe('Salidas 2026 y 2027')
    // Vigencia genérica de TC (años): vuelve a mandar la próxima salida.
    expect(etiquetaEsperada({ ...base, destinations: ['Isla de Sal (Cabo Verde)', 'Lisboa'], departureDate: '2026-11-04', dateRangeEnd: '2028-08-31' })?.label).toBe('Noviembre 2026')
    expect(etiquetaEsperada({ ...base, destinations: ['Cartagena de Indias'], departureDate: '2027-02-12', dateRangeEnd: null })?.label).toBe('Verano 2027')
  })
  it('sin salida no opina', () => {
    expect(etiquetaEsperada({ ...base, departureDate: null })).toBeNull()
  })
})

describe('metaConTemporada', () => {
  it('reemplaza la temporada vieja sin importar mayúsculas y avisa cuando no está', () => {
    expect(metaConTemporada(base.metaTitle, 'Temporada baja 2026', 'Temporada baja 2027')).toBe('Paquete a Punta Cana y Bayahibe Temporada baja 2027: 9 noches | Sí, Viajo')
    expect(metaConTemporada(base.metaDescription, 'Temporada baja 2026', 'Temporada baja 2027')).toBe('Viajá a Punta Cana y Bayahibe en Temporada baja 2027: 9 noches all inclusive con vuelo directo.')
    expect(metaConTemporada('Paquete a Punta Cana 2026: 9 noches | Sí, Viajo', 'Temporada baja 2026', 'Temporada baja 2027')).toBeNull()
    expect(metaConTemporada(null, 'a', 'b')).toBeNull()
  })
})

describe('findTitleDrift', () => {
  it('no marca nada si la salida sigue en la misma temporada', () => {
    expect(findTitleDrift([base])).toEqual([])
  })
  it('propone título y meta nuevos cuando la salida cambia de temporada', () => {
    const [d] = findTitleDrift([{ ...base, departureDate: '2027-04-14', dateRangeEnd: '2027-04-14' }])
    expect(d.expectedLabel).toBe('Temporada baja 2027')
    expect(d.expectedTitle).toBe('Paquete a Punta Cana y Bayahibe All Inclusive: 9 noches – Temporada baja 2027')
    expect(d.expectedMetaTitle).toContain('Temporada baja 2027')
    expect(d.expectedMetaDescription).toContain('Temporada baja 2027')
    expect(d.grupo).toBe('caribe')
  })
  it('ordena por impresiones y deja afuera grupales con fecha y fichas sin etiqueta', () => {
    const grupal: DriftCandidate = { ...base, tcPackageId: 1, title: 'Salida grupal acompañada a Europa: 17 días, 20 de marzo 2027', departureDate: '2027-03-20', impressions: 999 }
    const chica: DriftCandidate = { ...base, tcPackageId: 2, departureDate: '2027-01-10', dateRangeEnd: '2027-01-10', impressions: 3 }
    const grande: DriftCandidate = { ...base, tcPackageId: 3, departureDate: '2027-01-10', dateRangeEnd: '2027-01-10', impressions: 300 }
    expect(findTitleDrift([grupal, chica, grande]).map(d => d.tcPackageId)).toEqual([3, 2])
  })
})

describe('buildDriftMessage', () => {
  it('arma el aviso con el estado de cada ficha', () => {
    const [d] = findTitleDrift([{ ...base, departureDate: '2027-04-14', dateRangeEnd: '2027-04-14' }])
    const msg = buildDriftMessage([d], new Set([38204302]))
    expect(msg).toContain('Temporada baja 2027')
    expect(msg).toContain('título y H1 ya cambiados')
    expect(msg).toContain('/tareas')
  })
})
