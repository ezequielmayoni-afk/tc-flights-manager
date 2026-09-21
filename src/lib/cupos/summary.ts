import { calculateCupos, getFlightRoute, type FlightForMatch } from '@/lib/packages/flight-match'

/**
 * Cuadro "cupos por salida" del dashboard: una fila por salida (vuelo de ida
 * activo con fecha futura) con destino legible, región, fechas y lugares.
 */

export type CupoRegion = 'brasil' | 'caribe' | 'europa' | 'medio_oriente_asia' | 'usa' | 'argentina' | 'otros'

export const REGION_LABELS: Record<CupoRegion, string> = {
  brasil: 'Brasil', caribe: 'Caribe', europa: 'Europa', medio_oriente_asia: 'Medio Oriente y Asia', usa: 'Estados Unidos', argentina: 'Argentina', otros: 'Otros',
}

/** Aeropuerto → nombre comercial y región. Los perfiles de destino completan lo que falte. */
export const AIRPORTS: Record<string, { name: string; region: CupoRegion; aliases?: string[] }> = {
  GIG: { name: 'Rio de Janeiro', region: 'brasil' }, SDU: { name: 'Rio de Janeiro', region: 'brasil' }, GRU: { name: 'San Pablo', region: 'brasil', aliases: ['sao paulo'] }, CGH: { name: 'San Pablo', region: 'brasil', aliases: ['sao paulo'] },
  REC: { name: 'Recife / Porto de Galinhas', region: 'brasil', aliases: ['recife', 'porto de galinhas'] }, MCZ: { name: 'Maceió', region: 'brasil' }, NAT: { name: 'Natal', region: 'brasil' }, FLN: { name: 'Florianópolis', region: 'brasil' },
  SSA: { name: 'Salvador de Bahía', region: 'brasil' }, FOR: { name: 'Fortaleza', region: 'brasil' }, BPS: { name: 'Porto Seguro', region: 'brasil' }, JPA: { name: 'João Pessoa', region: 'brasil' }, AJU: { name: 'Aracaju', region: 'brasil' },
  PUJ: { name: 'Punta Cana', region: 'caribe' }, SDQ: { name: 'Santo Domingo', region: 'caribe' }, POP: { name: 'Puerto Plata', region: 'caribe' }, AUA: { name: 'Aruba', region: 'caribe' }, CUR: { name: 'Curazao', region: 'caribe' },
  CUN: { name: 'Cancún', region: 'caribe' }, MBJ: { name: 'Jamaica (Montego Bay)', region: 'caribe', aliases: ['jamaica', 'montego bay'] }, ADZ: { name: 'San Andrés', region: 'caribe' }, CTG: { name: 'Cartagena', region: 'caribe' }, PTY: { name: 'Panamá', region: 'caribe' },
  SJO: { name: 'Costa Rica', region: 'caribe' }, HAV: { name: 'La Habana', region: 'caribe' }, VRA: { name: 'Varadero', region: 'caribe' }, NAS: { name: 'Bahamas', region: 'caribe' }, BGI: { name: 'Barbados', region: 'caribe' }, GCM: { name: 'Islas Caimán', region: 'caribe' },
  MAD: { name: 'Madrid', region: 'europa' }, BCN: { name: 'Barcelona', region: 'europa' }, LHR: { name: 'Londres', region: 'europa' }, LGW: { name: 'Londres', region: 'europa' }, CDG: { name: 'París', region: 'europa' }, ORY: { name: 'París', region: 'europa' },
  FCO: { name: 'Roma', region: 'europa' }, LIS: { name: 'Lisboa', region: 'europa' }, AMS: { name: 'Ámsterdam', region: 'europa' }, BRU: { name: 'Bruselas', region: 'europa' }, BUD: { name: 'Budapest', region: 'europa' }, VIE: { name: 'Viena', region: 'europa' },
  PRG: { name: 'Praga', region: 'europa' }, ATH: { name: 'Atenas', region: 'europa' }, IST: { name: 'Estambul', region: 'europa' }, MXP: { name: 'Milán', region: 'europa' }, FRA: { name: 'Frankfurt', region: 'europa' }, MUC: { name: 'Múnich', region: 'europa' }, ZRH: { name: 'Zúrich', region: 'europa' }, DUB: { name: 'Dublín', region: 'europa' },
  DXB: { name: 'Dubái', region: 'medio_oriente_asia' }, DOH: { name: 'Doha', region: 'medio_oriente_asia' }, AUH: { name: 'Abu Dabi', region: 'medio_oriente_asia' }, CAI: { name: 'El Cairo', region: 'medio_oriente_asia' }, BKK: { name: 'Bangkok', region: 'medio_oriente_asia' }, NRT: { name: 'Tokio', region: 'medio_oriente_asia' }, HND: { name: 'Tokio', region: 'medio_oriente_asia' }, PEK: { name: 'Pekín', region: 'medio_oriente_asia' }, DPS: { name: 'Bali', region: 'medio_oriente_asia' }, MLE: { name: 'Maldivas', region: 'medio_oriente_asia' },
  MIA: { name: 'Miami', region: 'usa' }, MCO: { name: 'Orlando', region: 'usa' }, JFK: { name: 'Nueva York', region: 'usa' }, EWR: { name: 'Nueva York', region: 'usa' }, LAS: { name: 'Las Vegas', region: 'usa' }, LAX: { name: 'Los Ángeles', region: 'usa' }, AUS: { name: 'Austin', region: 'usa' },
  BRC: { name: 'Bariloche', region: 'argentina' }, USH: { name: 'Ushuaia', region: 'argentina' }, FTE: { name: 'El Calafate', region: 'argentina' }, IGR: { name: 'Iguazú', region: 'argentina' }, MDZ: { name: 'Mendoza', region: 'argentina' }, SLA: { name: 'Salta', region: 'argentina' }, COR: { name: 'Córdoba', region: 'argentina' },
}

export interface ProfileForRegion { name: string; family: string | null; iata_airport: string | null }

const FAMILY_TO_REGION: Record<string, CupoRegion> = { brasil: 'brasil', caribe: 'caribe', europa: 'europa', medio_oriente_asia: 'medio_oriente_asia', usa: 'usa', argentina: 'argentina' }

/** Nombre y región de un aeropuerto: primero la tabla fija, después los perfiles de destino. */
export function describeAirport(iata: string | null, profiles: ProfileForRegion[] = []): { name: string; region: CupoRegion; aliases: string[] } {
  const code = (iata ?? '').toUpperCase()
  if (!code) return { name: 'Sin destino', region: 'otros', aliases: [] }
  if (AIRPORTS[code]) return { ...AIRPORTS[code], aliases: AIRPORTS[code].aliases ?? [] }
  const profile = profiles.find(p => p.iata_airport?.toUpperCase() === code)
  if (profile) return { name: profile.name, region: FAMILY_TO_REGION[profile.family ?? ''] ?? 'otros', aliases: [] }
  return { name: code, region: 'otros', aliases: [] }
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * Nombre legible: el del aeropuerto (siempre en español, siempre igual) más
 * los destinos extra de los paquetes vinculados ("Rio de Janeiro + Búzios").
 */
export function destinationLabel(airport: { name: string; aliases: string[] }, packageDestinations: string[]): string {
  const base = normalize(airport.name)
  const known = [base, ...airport.aliases.map(normalize)]
  const extras: string[] = []
  for (const d of packageDestinations) {
    const n = normalize(d)
    if (!n || known.some(k => k === n || k.includes(n) || n.includes(k))) continue
    if (extras.some(e => normalize(e) === n)) continue
    extras.push(d)
  }
  return [airport.name, ...extras].join(' + ')
}

export interface CupoSummaryRow {
  flightId: number
  name: string | null
  tcTransportId: string | null
  airlineCode: string | null
  origin: string | null
  destinationCode: string | null
  destination: string
  /** Destinos de los paquetes vinculados (más precisos que el aeropuerto), si los hay. */
  packageDestinations: string[]
  region: CupoRegion
  departureDate: string
  returnDate: string | null
  daysToDeparture: number
  total: number
  sold: number
  remaining: number
  status: 'agotado' | 'ultimos' | 'pocos' | 'ok'
}

export interface CupoSummaryInput {
  flights: FlightForMatch[]
  /** package_id → nombres de destino, y flight_id → package_ids vinculados (no rechazados). */
  linkedPackagesByFlight: Map<number, number[]>
  destinationsByPackage: Map<number, string[]>
  profiles?: ProfileForRegion[]
  today: string
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

export function seatStatus(remaining: number, total: number): CupoSummaryRow['status'] {
  if (remaining <= 0) return 'agotado'
  if (remaining <= 3) return 'ultimos'
  if (total > 0 && remaining / total <= 0.4) return 'pocos'
  return 'ok'
}

export function buildCupoSummary({ flights, linkedPackagesByFlight, destinationsByPackage, profiles = [], today }: CupoSummaryInput): CupoSummaryRow[] {
  const byId = new Map(flights.map(f => [f.id, f]))
  const rows: CupoSummaryRow[] = []
  for (const f of flights) {
    if (f.active === false) continue
    if (f.leg_type === 'return') continue
    if (f.start_date < today) continue
    const route = getFlightRoute(f)
    const cupos = calculateCupos(f.modalities)
    const paired = f.paired_flight_id ? byId.get(f.paired_flight_id) ?? null : null
    const airport = describeAirport(route.destination, profiles)
    const packageDestinations = [...new Set((linkedPackagesByFlight.get(f.id) ?? []).flatMap(pid => destinationsByPackage.get(pid) ?? []))]
    rows.push({
      flightId: f.id, name: f.name, tcTransportId: f.tc_transport_id, airlineCode: f.airline_code, origin: route.origin, destinationCode: route.destination,
      destination: destinationLabel(airport, packageDestinations), packageDestinations, region: airport.region,
      departureDate: f.start_date, returnDate: paired?.start_date ?? null, daysToDeparture: daysBetween(today, f.start_date),
      total: cupos.total, sold: cupos.sold, remaining: cupos.remaining, status: seatStatus(cupos.remaining, cupos.total),
    })
  }
  return rows.sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.destination.localeCompare(b.destination))
}
