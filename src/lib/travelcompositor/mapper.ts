import type { TCTransport, TCSegment, TCModality, TCInventory, TCCancellationRange } from './types'

/**
 * Database flight type (from Supabase)
 */
export interface DBFlight {
  id: number
  base_id: string
  tc_transport_id?: string | null
  supplier_id: number
  name: string
  airline_code: string
  transport_type: string
  active: boolean
  price_per_pax: boolean
  currency: string
  base_adult_price: number
  base_children_price: number
  base_infant_price: number
  base_adult_rt_price: number
  base_children_rt_price: number
  base_infant_rt_price: number
  adult_taxes_amount: number
  children_taxes_amount: number
  infant_taxes_amount: number
  adult_rt_taxes_amount: number
  children_rt_taxes_amount: number
  infant_rt_taxes_amount: number
  start_date: string
  end_date: string
  release_contract: number
  operational_days?: string[] | null
  option_codes?: string[] | null
  only_holiday_package: boolean
  show_in_transport_quotas_landing: boolean
  min_child_age: number
  max_child_age: number
  min_infant_age: number
  max_infant_age: number
  allow_ow_price: boolean
  allow_rt_price: boolean
  product_types?: string[] | null
  combinable_rt_contracts?: string[] | null
  // Leg pairing fields
  leg_type?: 'outbound' | 'return' | null
  paired_flight_id?: number | null
  flight_segments: DBSegment[]
  flight_datasheets?: DBDatasheet[]
  flight_cancellations?: DBCancellation[]
  modalities?: DBModality[]
}

export interface DBSegment {
  id?: number
  departure_location_code: string
  arrival_location_code: string
  departure_time: string
  arrival_time: string
  plus_days: number
  duration_time?: string | null
  model?: string | null
  num_service?: string | null
  sort_order: number
}

export interface DBDatasheet {
  language: string
  name?: string | null
  description?: string | null
}

export interface DBCancellation {
  days: number
  percentage: number
}

export interface DBModality {
  id?: number
  code: string
  active: boolean
  cabin_class_type: string
  baggage_allowance?: string | null
  baggage_allowance_type?: string | null
  includes_backpack?: boolean
  carryon_weight?: number
  checked_bag_weight?: number
  checked_bags_quantity?: number
  min_passengers: number
  max_passengers: number
  on_request: boolean
  modality_inventories?: DBInventory[]
}

export interface DBInventory {
  start_date: string
  end_date: string
  quantity: number
}

/**
 * Format time to HH:mm:ss
 */
function formatTime(time: string): string {
  if (!time) return '00:00:00'
  // If already has seconds, return as is
  if (time.match(/^\d{2}:\d{2}:\d{2}$/)) return time
  // If only HH:mm, add seconds
  if (time.match(/^\d{2}:\d{2}$/)) return `${time}:00`
  return '00:00:00'
}

/**
 * Calculate flight duration between departure and arrival times
 */
function calculateDuration(departureTime: string, arrivalTime: string, plusDays: number): string {
  const [depH, depM] = departureTime.split(':').map(Number)
  const [arrH, arrM] = arrivalTime.split(':').map(Number)

  let totalMinutes = (arrH * 60 + arrM) - (depH * 60 + depM)
  totalMinutes += plusDays * 24 * 60

  if (totalMinutes <= 0) {
    totalMinutes += 24 * 60 // Add a day if negative
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

/**
 * Convert DB segment to TC segment
 */
function mapSegment(segment: DBSegment): TCSegment {
  const depTime = formatTime(segment.departure_time)
  const arrTime = formatTime(segment.arrival_time)
  const plusDays = segment.plus_days || 0

  // Calculate duration if not provided or is zero
  let duration = formatTime(segment.duration_time || '')
  if (!duration || duration === '00:00:00') {
    duration = calculateDuration(depTime, arrTime, plusDays)
  }

  return {
    departureLocationCode: segment.departure_location_code,
    arrivalLocationCode: segment.arrival_location_code,
    departureTime: depTime,
    arrivalTime: arrTime,
    plusDays,
    durationTime: duration,
    model: segment.model || '',
    numService: segment.num_service || '',
  }
}

/**
 * Convert DB flight to TC transport format
 */
export function mapFlightToTransport(flight: DBFlight): TCTransport {
  // Build datasheets object from array
  const datasheets: Record<string, { name: string; description: string }> = {}
  if (flight.flight_datasheets && flight.flight_datasheets.length > 0) {
    for (const ds of flight.flight_datasheets) {
      datasheets[ds.language] = {
        name: ds.name || flight.name,
        description: ds.description || '',
      }
    }
  } else {
    // TC requires at least one translation - create default ES and EN
    datasheets['ES'] = {
      name: flight.name,
      description: '',
    }
    datasheets['EN'] = {
      name: flight.name,
      description: '',
    }
  }

  // Map cancellation ranges
  const cancellationRanges: TCCancellationRange[] = (flight.flight_cancellations || []).map(c => ({
    days: c.days,
    percentage: c.percentage,
  }))

  // Sort segments by sort_order
  const sortedSegments = [...flight.flight_segments].sort((a, b) => a.sort_order - b.sort_order)

  // Build base transport object
  // TC requires id to be empty string for new transports, not undefined/null
  const transport: TCTransport = {
    baseId: flight.base_id,
    id: flight.tc_transport_id || '',
    active: flight.active,
    name: flight.name,
    airlineCode: flight.airline_code,
    transportType: (flight.transport_type || 'PLANE') as TCTransport['transportType'],
    pricePerPax: flight.price_per_pax,
    datasheets,
    images: [],
    productTypes: (flight.product_types || ['ONLY_FLIGHT', 'FLIGHT_HOTEL', 'MULTI', 'MAGIC_BOX', 'ROUTING']) as TCTransport['productTypes'],
    currency: flight.currency || 'USD',
    vehiclePrice: 0,
    baseAdultPrice: flight.base_adult_price || 0,
    baseChildrenPrice: flight.base_children_price || 0,
    baseInfantPrice: flight.base_infant_price || 0,
    baseAdultRTPrice: flight.base_adult_rt_price || 0,
    baseChildrenRTPrice: flight.base_children_rt_price || 0,
    baseInfantRTPrice: flight.base_infant_rt_price || 0,
    adultTaxesAmount: flight.adult_taxes_amount || 0,
    childrenTaxesAmount: flight.children_taxes_amount || 0,
    infantTaxesAmount: flight.infant_taxes_amount || 0,
    adultRTTaxesAmount: flight.adult_rt_taxes_amount || 0,
    childrenRTTaxesAmount: flight.children_rt_taxes_amount || 0,
    infantRTTaxesAmount: flight.infant_rt_taxes_amount || 0,
    startDate: flight.start_date,
    endDate: flight.end_date,
    releaseContract: flight.release_contract || 0,
    optionCodes: flight.option_codes || [],
    operationalDays: (flight.operational_days || []) as TCTransport['operationalDays'],
    onlyHolidayPackage: flight.only_holiday_package ?? false,
    showInTransportQuotasLanding: flight.show_in_transport_quotas_landing ?? false,
    minChildAge: flight.min_child_age ?? 2,
    maxChildAge: flight.max_child_age ?? 11,
    minInfantAge: flight.min_infant_age ?? 0,
    maxInfantAge: flight.max_infant_age ?? 2,
    allowOWPrice: flight.allow_ow_price ?? false,
    allowRTPrice: flight.allow_rt_price ?? true,
    cancellationRanges,
    combinableRtContracts: flight.combinable_rt_contracts || [],
    segments: sortedSegments.map(mapSegment),
  }

  return transport
}

/**
 * Convert DB modality to TC modality format
 */
export function mapModalityToTC(modality: DBModality, startDate: string, endDate: string): TCModality {
  // Map inventories
  const inventories: TCInventory[] = modality.modality_inventories?.map(inv => ({
    inventoryDate: {
      start: inv.start_date,
      end: inv.end_date,
    },
    quantity: inv.quantity,
  })) || [{
    inventoryDate: {
      start: startDate,
      end: endDate,
    },
    quantity: 0,
  }]

  // Build translations (default to Spanish)
  const translations: Record<string, { name: string }> = {
    ES: { name: modality.code },
    EN: { name: modality.code },
  }

  // Calculate total baggage weight
  const baggageWeight = modality.checked_bag_weight || 0

  return {
    code: modality.code,
    active: modality.active,
    cabinClassType: modality.cabin_class_type as TCModality['cabinClassType'],
    baggageAllowance: baggageWeight,
    baggageAllowanceType: (modality.baggage_allowance_type || 'KG') as TCModality['baggageAllowanceType'],
    minPassengers: modality.min_passengers || 1,
    maxPassengers: modality.max_passengers || 10,
    onRequest: modality.on_request || false,
    inventories,
    translations,
  }
}

/**
 * Create a default modality if none exists
 */
export function createDefaultModality(flight: DBFlight): TCModality {
  return {
    code: `${flight.base_id}-ECO`,
    active: true,
    cabinClassType: 'ECONOMY',
    baggageAllowance: 0, // 0kg = no baggage
    baggageAllowanceType: 'KG',
    minPassengers: 1,
    maxPassengers: 10,
    onRequest: false,
    inventories: [{
      inventoryDate: {
        start: flight.start_date,
        end: flight.end_date,
      },
      quantity: 0,
    }],
    translations: {
      ES: { name: 'Económica' },
      EN: { name: 'Economy' },
    },
  }
}
