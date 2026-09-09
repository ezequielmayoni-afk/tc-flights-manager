import { describe, expect, it } from 'vitest'
import { buildQuoteRequest, canonicalRegimen, durationToMinutes, monthLabel, suggestTitle, summarizeQuote, type IdeaRow } from '../idea-builder'
import { auditPackage } from '../audit'
import type { DestinationProfile } from '../types'

const profile: DestinationProfile = {
  code: 'PUJ', name: 'Punta Cana', aliases: [], family: 'caribe', tc_destination_code: 'PUJ', iata_airport: 'PUJ',
  regimen_required: 'all_inclusive', regimen_allowed: ['all_inclusive'], nights_default: 7, nights_allowed: [7, 8, 9, 10],
  stars_default: 5, stars_min: 4, high_season_months: [1, 2], booking_window_days: 90, stopover_threshold_pct: 17,
  stopover_modifiers: { short_trip: 10, kids: 5, overnight: 12, origin_interior: -7, half_direct: 0.66 }, airlines_by_origin: {},
  themes_default: ['Caribe'], direct_required: false, auto_publish: false, auto_requote: false, price_tolerance_pct: 3, active: true,
}
const idea: IdeaRow = {
  id: 1, kind: 'web', source: 'manual', status: 'draft', destination_code: 'PUJ', destination_name: 'Punta Cana', origin: 'BUE',
  month: '2027-03', flexibility: null, departure_date: null, chosen_departure_date: null, nights: 7, adults: 2, children: 1, children_ages: [],
  regimen: null, stars_min: null, direct_flight: null, hotel_preferred: null, budget_max_pp: 1400, tramos: [],
}

describe('buildQuoteRequest', () => {
  it('arma el pedido con los defaults del perfil y fecha flexible por mes', () => {
    const r = buildQuoteRequest(idea, profile)
    expect(r).toMatchObject({ origen: 'BUE', mes: '2027-03', flexibilidad: 'mes', adultos: 2, menores: [8], vuelo_directo: false, presupuesto_max_pp: 1400, tipo_paquete: 'vuelo_hotel' })
    expect(r.tramos[0]).toMatchObject({ destino: 'Destination::PUJ', iata_aeropuerto: 'PUJ', noches: 7, regimen: 'all_inclusive', estrellas_min: 4 })
    expect(r.fecha_inicio).toBeUndefined()
  })
  it('con fecha fija no manda mes, y directo obligatorio fuerza vuelo_directo', () => {
    const r = buildQuoteRequest({ ...idea, chosen_departure_date: '2027-03-12' }, { ...profile, direct_required: true })
    expect(r.fecha_inicio).toBe('2027-03-12')
    expect(r.mes).toBeUndefined()
    expect(r.vuelo_directo).toBe(true)
    expect(buildQuoteRequest(idea, profile, { directOnly: true, fixedDate: '2027-03-19' })).toMatchObject({ vuelo_directo: true, fecha_inicio: '2027-03-19' })
  })
})

describe('summarizeQuote', () => {
  it('resume la opción recomendada, el vuelo y las fechas alternativas', () => {
    const s = summarizeQuote({
      status: 'ok', moneda: 'USD', elapsed_seconds: 72,
      avisos: ['Fecha elegida entre varias'],
      viaje: { fecha_ida: '2027-03-06', fecha_vuelta: '2027-03-13' },
      fechas: { elegida: '2027-03-06', vuelta: '2027-03-13', motivo: 'mejor relación precio/viaje', alternativas: [{ fecha: '2027-03-12', pp: 905, duracion: '21h40m', escalas: 1 }] },
      opciones: [
        { gama: 'economica', precio_pp_final: 1270, precio_total_final: 2540, regimen_no_confirmado: true, hotel: { nombre: 'VIK', code: 'H-1', estrellas: 4, regimen: 'All Inclusive' } },
        { gama: 'moderada', precio_pp_final: 1520, precio_total_final: 3040, hotel: { nombre: 'Barceló', code: 'H-2', estrellas: 5, regimen: 'All Inclusive' } },
      ],
      vuelo_compartido: { aerolinea: 'LATAM', numero_vuelo_ida: 'LA8012', numero_vuelo_vuelta: 'LA8013', ida: { duracion: '8h10m', escalas: 0 }, equipaje: { valija_facturada: false } },
      analisis: { recomendacion_idx: 1 },
    })
    expect(s).toMatchObject({ ok: true, pricePp: 1520, hotelName: 'Barceló', stars: 5, regimen: 'all_inclusive', regimenConfirmed: true, airline: 'LATAM', stops: 0, direct: true, durationMinutes: 490, checkedBag: false, departureDate: '2027-03-06', dateReason: 'mejor relación precio/viaje' })
    expect(s.alternatives[0]).toMatchObject({ date: '2027-03-12', pricePerPax: 905, direct: false, durationMinutes: 1300 })
  })
  it('sin disponibilidad no es ok y escalas -1 es desconocido', () => {
    const s = summarizeQuote({ status: 'sin_disponibilidad', diagnostico: { mensaje: 'Sin vuelos' }, opciones: [] })
    expect(s.ok).toBe(false)
    expect(s.diagnostico).toBe('Sin vuelos')
    const u = summarizeQuote({ status: 'ok', opciones: [{ precio_pp_final: 100, hotel: { regimen: 'Desayuno' } }], vuelo_compartido: { ida: { escalas: -1 } } })
    expect(u.stops).toBeNull()
    expect(u.direct).toBeNull()
    expect(u.regimen).toBe('desayuno')
  })
})

describe('helpers', () => {
  it('duración, régimen, mes y título', () => {
    expect(durationToMinutes('18h20m')).toBe(1100)
    expect(durationToMinutes(null)).toBeNull()
    expect(canonicalRegimen('Todo incluido')).toBe('all_inclusive')
    expect(canonicalRegimen('Room Only')).toBe('sin_pension')
    expect(canonicalRegimen('Media pensión')).toBe('media_pension')
    expect(monthLabel('2027-03')).toBe('marzo 2027')
    expect(suggestTitle(profile, idea, null)).toBe('Punta Cana · 7 noches · all inclusive · marzo 2027')
  })
})

describe('auditPackage', () => {
  it('marca régimen, noches y estrellas fuera del perfil', () => {
    const v = auditPackage({ id: 1, tc_package_id: 1, title: 'Punta Cana', nights_count: 4, destinationNames: ['Punta Cana'], hotels: [{ board_type: 'BB', board_name: 'Desayuno', stars: 3, hotel_category: '3' }] }, profile)
    expect(v).toHaveLength(3)
    expect(auditPackage({ id: 1, tc_package_id: 1, title: 'Punta Cana', nights_count: 7, destinationNames: ['Punta Cana'], hotels: [{ board_type: 'AI', board_name: 'All Inclusive', stars: 5, hotel_category: '5' }] }, profile)).toEqual([])
  })
})
