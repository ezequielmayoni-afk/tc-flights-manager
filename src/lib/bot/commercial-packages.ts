import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  loadFlightsForMatch,
  buildFlightMatchIndex,
  matchPackageFlights,
  aggregatePackageCupos,
  type FlightMatchIndex,
} from '@/lib/packages/flight-match'

type ApiAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

type CommercialVertical = 'closed_package' | 'group_departure' | 'f1'

type CommercialStatus = 'sellable' | 'needs_review' | 'not_sellable'

interface RawPackageDestination {
  destination_code: string | null
  destination_name: string | null
  nights?: number | null
}

interface RawPackageTransport {
  tc_transport_id: string | null
  transport_number: string | null
  marketing_airline_code: string | null
  company: string | null
  departure_date: string | null
  arrival_date: string | null
  departure_time: string | null
  arrival_time: string | null
  origin_code: string | null
  origin_name: string | null
  destination_code: string | null
  destination_name: string | null
  baggage_info: string | null
  checked_baggage: string | null
  cabin_baggage: string | null
}

interface RawPackageHotel {
  hotel_name: string | null
  room_type: string | null
  room_name: string | null
  board_type: string | null
  board_name: string | null
  nights: number | null
  check_in_date: string | null
  check_out_date: string | null
}

interface RawPackageTransfer {
  id: number
}

interface RawPackageTour {
  name: string | null
  modality_name: string | null
  included_services: string | null
}

interface RawPackageTicket {
  name?: string | null
  description?: string | null
  modality_name?: string | null
}

interface RawPackageRow {
  id: number
  tc_package_id: number
  title: string
  image_url: string | null
  tc_idea_url: string | null
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  current_price_per_pax: number | null
  total_price: number | null
  currency: string | null
  adults_count: number | null
  children_count: number | null
  infants_count: number | null
  nights_count: number | null
  tc_active: boolean | null
  status: string | null
  send_to_marketing: boolean | null
  needs_manual_quote: boolean | null
  requote_status: string | null
  package_destinations: RawPackageDestination[] | null
  package_transports: RawPackageTransport[] | null
  package_hotels: RawPackageHotel[] | null
  package_transfers: RawPackageTransfer[] | null
  package_closed_tours: RawPackageTour[] | null
  package_tickets: RawPackageTicket[] | null
}





interface Cupos {
  total: number
  sold: number
  remaining: number
}

interface NormalizationContext {
  flightIndex: FlightMatchIndex | null
}

export interface CommercialPackage {
  tcPackageId: number
  title: string
  commercialStatus: CommercialStatus
  vertical: CommercialVertical
  destinationSummary: string | null
  travelDates: {
    departureDate: string | null
    returnDate: string | null
    dateRangeStart: string | null
    dateRangeEnd: string | null
  }
  nights: number | null
  paxBase: {
    adults: number
    children: number
    infants: number
  }
  price: {
    amountPerPerson: number | null
    totalAmount: number | null
    currency: string
    quoteStatus: 'current' | 'needs_manual' | 'unknown'
  }
  availability: {
    tcActive: boolean
    cuposTotal: number
    cuposRemaining: number
    confidence: 'high' | 'medium' | 'low'
    label: 'con_cupos' | 'pocos_cupos' | 'sin_cupos' | 'sin_dato' | 'inactive'
  }
  includes: {
    hotels: Array<{
      name: string | null
      room: string | null
      board: string | null
      nights: number | null
      checkInDate: string | null
      checkOutDate: string | null
    }>
    flights: Array<{
      company: string | null
      origin: string | null
      destination: string | null
      departureDate: string | null
      departureTime: string | null
      arrivalDate: string | null
      arrivalTime: string | null
      baggage: string | null
    }>
    transfers: number
    tours: string[]
    tickets: string[]
  }
  sellHooks: string[]
  hunterWarnings: string[]
  imageUrl: string | null
  sourceUrl: string
}

export interface CommercialPackageSearchParams {
  search?: string
  destination?: string
  vertical?: CommercialVertical
  month?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}

export interface CommercialPackageSearchResponse {
  packages: CommercialPackage[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  filters: {
    search?: string
    destination?: string
    vertical?: CommercialVertical
    month?: string
    dateFrom?: string
    dateTo?: string
  }
  reason?: string
}

const COMMERCIAL_PACKAGE_SELECT = `
  id,
  tc_package_id,
  title,
  image_url,
  tc_idea_url,
  departure_date,
  date_range_start,
  date_range_end,
  current_price_per_pax,
  total_price,
  currency,
  adults_count,
  children_count,
  infants_count,
  nights_count,
  tc_active,
  status,
  send_to_marketing,
  needs_manual_quote,
  requote_status,
  package_destinations (
    destination_code,
    destination_name,
    nights
  ),
  package_transports (
    tc_transport_id,
    transport_number,
    marketing_airline_code,
    company,
    departure_date,
    arrival_date,
    departure_time,
    arrival_time,
    origin_code,
    origin_name,
    destination_code,
    destination_name,
    baggage_info,
    checked_baggage,
    cabin_baggage
  ),
  package_hotels (
    hotel_name,
    room_type,
    room_name,
    board_type,
    board_name,
    nights,
    check_in_date,
    check_out_date
  ),
  package_transfers (
    id
  ),
  package_closed_tours (
    name,
    modality_name,
    included_services
  ),
  package_tickets (
    name,
    description,
    modality_name
  )
`

export function authorizeBotApiRequest(request: NextRequest): ApiAuthResult {
  const expectedApiKey = process.env.HUB_API_KEY

  if (!expectedApiKey) {
    console.error('[Bot Packages API] HUB_API_KEY is not configured')
    return { ok: false, status: 500, error: 'Server misconfigured' }
  }

  const apiKey = request.headers.get('X-API-Key')
  if (!apiKey || apiKey !== expectedApiKey) {
    return { ok: false, status: 401, error: 'No autorizado' }
  }

  return { ok: true }
}

export function parseCommercialVertical(value: string | null): CommercialVertical | undefined {
  if (value === 'closed_package' || value === 'group_departure' || value === 'f1') {
    return value
  }

  return undefined
}

export function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export function parseNonNegativeInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(parsed, max)
}

export async function searchCommercialPackages(
  params: CommercialPackageSearchParams,
): Promise<CommercialPackageSearchResponse> {
  const db = createAdminClient()
  const limit = clamp(params.limit ?? 5, 1, 10)
  const offset = clamp(params.offset ?? 0, 0, 500)
  const monthRange = parseMonthRange(params.month)
  const dateFrom = params.dateFrom || monthRange?.dateFrom
  const dateTo = params.dateTo || monthRange?.dateTo

  let query = db
    .from('packages')
    .select(COMMERCIAL_PACKAGE_SELECT, { count: 'exact' })
    .eq('tc_active', true)
    .or('status.eq.in_marketing,status.eq.published,send_to_marketing.eq.true')
    .order('date_range_start', { ascending: true })

  const normalizedSearch = params.search?.trim()
  if (normalizedSearch) {
    const numericSearch = Number.parseInt(normalizedSearch, 10)
    if (/^\d+$/.test(normalizedSearch) && Number.isFinite(numericSearch)) {
      query = query.eq('tc_package_id', numericSearch)
    } else {
      query = query.ilike('title', `%${normalizedSearch}%`)
    }
  }

  if (dateFrom) {
    query = query.gte('date_range_end', dateFrom)
  }

  if (dateTo) {
    query = query.lte('date_range_start', dateTo)
  }

  // Fetch more than the final limit because destination/vertical filters are
  // applied after nested relations are loaded.
  const fetchLimit = params.destination || params.vertical ? Math.max(limit * 5, 25) : limit
  const { data, error, count } = await query.range(offset, offset + fetchLimit - 1)

  if (error) throw error

  const rawPackages = (data || []) as RawPackageRow[]
  const context = await buildNormalizationContext(rawPackages)
  const normalized = rawPackages
    .map((pkg) => normalizePackage(pkg, context))
    .filter((pkg) => matchesDestination(pkg, params.destination))
    .filter((pkg) => matchesVertical(pkg, params.vertical))

  const packages = normalized.slice(0, limit)
  const total = params.destination || params.vertical ? normalized.length : count || normalized.length

  return {
    packages,
    pagination: {
      total,
      limit,
      offset,
      hasMore: total > offset + packages.length,
    },
    filters: {
      ...(normalizedSearch ? { search: normalizedSearch } : {}),
      ...(params.destination ? { destination: params.destination } : {}),
      ...(params.vertical ? { vertical: params.vertical } : {}),
      ...(params.month ? { month: params.month } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    },
    ...(packages.length === 0 ? { reason: 'no_sellable_packages_found' } : {}),
  }
}

export async function getCommercialPackageByTcId(tcPackageId: number): Promise<CommercialPackageSearchResponse> {
  const db = createAdminClient()

  const { data, error } = await db
    .from('packages')
    .select(COMMERCIAL_PACKAGE_SELECT)
    .eq('tc_package_id', tcPackageId)
    .eq('tc_active', true)
    .or('status.eq.in_marketing,status.eq.published,send_to_marketing.eq.true')
    .limit(1)

  if (error) throw error

  const rawPackages = (data || []) as RawPackageRow[]
  const context = await buildNormalizationContext(rawPackages)
  const packages = rawPackages.map((pkg) => normalizePackage(pkg, context))

  return {
    packages,
    pagination: {
      total: packages.length,
      limit: 1,
      offset: 0,
      hasMore: false,
    },
    filters: {
      search: String(tcPackageId),
    },
    ...(packages.length === 0 ? { reason: 'package_not_found_or_not_sellable' } : {}),
  }
}

async function buildNormalizationContext(rawPackages: RawPackageRow[]): Promise<NormalizationContext> {
  const hasFlightsToMatch = rawPackages.some((pkg) =>
    (pkg.package_transports || []).some((transport) =>
      transport.marketing_airline_code
        && transport.origin_code
        && transport.destination_code
        && transport.departure_date
    )
  )

  if (!hasFlightsToMatch) {
    return { flightIndex: null }
  }

  const db = createAdminClient()
  const flights = await loadFlightsForMatch(db)

  return { flightIndex: buildFlightMatchIndex(flights) }
}


function normalizePackage(pkg: RawPackageRow, context: NormalizationContext): CommercialPackage {
  const destinations = pkg.package_destinations || []
  const transports = pkg.package_transports || []
  const hotels = pkg.package_hotels || []
  const transfers = pkg.package_transfers || []
  const tours = pkg.package_closed_tours || []
  const tickets = pkg.package_tickets || []
  const cupos = context.flightIndex
    ? aggregatePackageCupos(matchPackageFlights(context.flightIndex, transports))
    : { total: 0, sold: 0, remaining: 0 }
  const vertical = detectVertical(pkg)
  const availability = buildAvailability(pkg, cupos)
  const commercialStatus = buildCommercialStatus(pkg, availability)
  const priceQuoteStatus = pkg.needs_manual_quote || pkg.requote_status === 'needs_manual'
    ? 'needs_manual'
    : pkg.current_price_per_pax
      ? 'current'
      : 'unknown'

  const normalizedPackage: CommercialPackage = {
    tcPackageId: pkg.tc_package_id,
    title: pkg.title,
    commercialStatus,
    vertical,
    destinationSummary: summarizeDestinations(destinations),
    travelDates: {
      departureDate: pkg.departure_date,
      returnDate: pkg.date_range_end,
      dateRangeStart: pkg.date_range_start,
      dateRangeEnd: pkg.date_range_end,
    },
    nights: pkg.nights_count,
    paxBase: {
      adults: pkg.adults_count || 0,
      children: pkg.children_count || 0,
      infants: pkg.infants_count || 0,
    },
    price: {
      amountPerPerson: pkg.current_price_per_pax,
      totalAmount: pkg.total_price,
      currency: pkg.currency || 'USD',
      quoteStatus: priceQuoteStatus,
    },
    availability,
    includes: {
      hotels: hotels.map((hotel) => ({
        name: hotel.hotel_name,
        room: hotel.room_type || hotel.room_name,
        board: hotel.board_name || hotel.board_type,
        nights: hotel.nights,
        checkInDate: hotel.check_in_date,
        checkOutDate: hotel.check_out_date,
      })),
      flights: transports.map((transport) => ({
        company: transport.company,
        origin: transport.origin_name || transport.origin_code,
        destination: transport.destination_name || transport.destination_code,
        departureDate: transport.departure_date,
        departureTime: transport.departure_time,
        arrivalDate: transport.arrival_date,
        arrivalTime: transport.arrival_time,
        baggage: transport.baggage_info || transport.checked_baggage || transport.cabin_baggage,
      })),
      transfers: transfers.length,
      tours: tours
        .map((tour) => tour.name || tour.modality_name || tour.included_services)
        .filter(isPresent),
      tickets: tickets
        .map((ticket) => ticket.name || ticket.modality_name || ticket.description)
        .filter(isPresent),
    },
    sellHooks: buildSellHooks(pkg, availability, vertical),
    hunterWarnings: buildHunterWarnings(pkg, availability),
    imageUrl: pkg.image_url,
    sourceUrl: pkg.tc_idea_url || `https://siviajo.com/es/idea/${pkg.tc_package_id}`,
  }

  return normalizedPackage
}



function buildAvailability(pkg: RawPackageRow, cupos: Cupos): CommercialPackage['availability'] {
  if (!pkg.tc_active) {
    return {
      tcActive: false,
      cuposTotal: cupos.total,
      cuposRemaining: cupos.remaining,
      confidence: 'low',
      label: 'inactive',
    }
  }

  if (cupos.total <= 0) {
    return {
      tcActive: true,
      cuposTotal: 0,
      cuposRemaining: 0,
      confidence: 'medium',
      label: 'sin_dato',
    }
  }

  if (cupos.remaining <= 0) {
    return {
      tcActive: true,
      cuposTotal: cupos.total,
      cuposRemaining: 0,
      confidence: 'high',
      label: 'sin_cupos',
    }
  }

  return {
    tcActive: true,
    cuposTotal: cupos.total,
    cuposRemaining: cupos.remaining,
    confidence: 'high',
    label: cupos.remaining <= 5 ? 'pocos_cupos' : 'con_cupos',
  }
}

function buildCommercialStatus(pkg: RawPackageRow, availability: CommercialPackage['availability']): CommercialStatus {
  if (!pkg.tc_active || pkg.status === 'expired') return 'not_sellable'
  if (availability.label === 'sin_cupos') return 'needs_review'
  if (pkg.needs_manual_quote || pkg.requote_status === 'needs_manual') return 'needs_review'
  if (!pkg.current_price_per_pax) return 'needs_review'
  return 'sellable'
}

function detectVertical(pkg: RawPackageRow): CommercialVertical {
  const text = normalizeSearchText([
    pkg.title,
    ...(pkg.package_destinations || []).map((destination) => destination.destination_name),
    ...(pkg.package_closed_tours || []).map((tour) => tour.name || tour.modality_name),
    ...(pkg.package_tickets || []).map((ticket) => ticket.name || ticket.description || ticket.modality_name),
  ].filter(isPresent).join(' '))

  if (hasAny(text, ['f1', 'formula 1', 'formula uno', 'gran premio', 'interlagos', 'monaco', 'montmelo', 'silverstone', 'yas marina'])) {
    return 'f1'
  }

  if (hasAny(text, ['salida grupal', 'grupal', 'grupo', 'acompanada', 'acompanado', 'coordinada', 'coordinado'])) {
    return 'group_departure'
  }

  return 'closed_package'
}

function buildSellHooks(
  pkg: RawPackageRow,
  availability: CommercialPackage['availability'],
  vertical: CommercialVertical,
): string[] {
  const hooks = new Set<string>()
  const hotels = pkg.package_hotels || []
  const transports = pkg.package_transports || []
  const transfers = pkg.package_transfers || []
  const tickets = pkg.package_tickets || []

  if (hotels.some((hotel) => normalizeSearchText(`${hotel.board_name || ''} ${hotel.board_type || ''}`).includes('all inclusive'))) {
    hooks.add('All inclusive')
  }

  if (pkg.departure_date || (pkg.date_range_start && pkg.date_range_end && pkg.date_range_start === pkg.date_range_end)) {
    hooks.add('Fecha concreta')
  }

  if (transports.length > 0) {
    hooks.add('Vuelo incluido')
  }

  if (transfers.length > 0) {
    hooks.add('Traslados incluidos')
  }

  if (availability.label === 'pocos_cupos') {
    hooks.add('Quedan pocos cupos')
  }

  if (vertical === 'f1' || tickets.length > 0) {
    hooks.add('Evento/entrada incluida')
  }

  return Array.from(hooks)
}

function buildHunterWarnings(pkg: RawPackageRow, availability: CommercialPackage['availability']): string[] {
  const warnings = new Set<string>()

  if (pkg.needs_manual_quote || pkg.requote_status === 'needs_manual') {
    warnings.add('requiere_revision_de_precio')
  }

  if (!pkg.current_price_per_pax) {
    warnings.add('sin_precio_vendible')
  }

  if (availability.label === 'sin_dato') {
    warnings.add('cupos_no_confirmados')
  }

  if (availability.label === 'sin_cupos') {
    warnings.add('sin_cupos_confirmados')
  }

  if (!pkg.send_to_marketing && pkg.status !== 'published' && pkg.status !== 'in_marketing') {
    warnings.add('fuera_de_marketing')
  }

  return Array.from(warnings)
}

function summarizeDestinations(destinations: RawPackageDestination[]): string | null {
  const names = destinations
    .map((destination) => destination.destination_name)
    .filter(isPresent)

  if (names.length === 0) return null
  return Array.from(new Set(names)).join(', ')
}

function matchesDestination(pkg: CommercialPackage, destination?: string): boolean {
  if (!destination) return true
  const expected = normalizeSearchText(destination)
  const haystack = normalizeSearchText(`${pkg.title} ${pkg.destinationSummary || ''}`)
  return haystack.includes(expected)
}

function matchesVertical(pkg: CommercialPackage, vertical?: CommercialVertical): boolean {
  if (!vertical) return true
  return pkg.vertical === vertical
}

function parseMonthRange(month?: string): { dateFrom: string; dateTo: string } | undefined {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return undefined

  const [yearPart, monthPart] = month.split('-')
  const year = Number.parseInt(yearPart, 10)
  const monthNumber = Number.parseInt(monthPart, 10)

  if (!Number.isFinite(year) || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return undefined
  }

  const start = new Date(Date.UTC(year, monthNumber - 1, 1))
  const end = new Date(Date.UTC(year, monthNumber, 0))

  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  }
}


function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
