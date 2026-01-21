// TravelCompositor API Types

// Auth
export interface TCAuthRequest {
  username: string
  password: string
  micrositeId: string
}

export interface TCAuthResponse {
  token: string
  expirationInSeconds: number
}

// Transport/Flight Segment
export interface TCSegment {
  departureLocationCode: string
  arrivalLocationCode: string
  departureTime: string // "HH:mm:ss"
  arrivalTime: string // "HH:mm:ss"
  plusDays: number
  durationTime: string // "HH:mm:ss"
  model: string
  numService: string
}

// Datasheet (per language)
export interface TCDatasheet {
  name: string
  description: string
}

// Cancellation policy
export interface TCCancellationRange {
  days: number
  percentage: number
}

// Transport/Flight
export interface TCTransport {
  baseId: string
  id?: string // TC transport ID (only for updates)
  active: boolean
  name: string
  airlineCode: string
  transportType: 'PLANE' | 'BUS' | 'TRAIN' | 'SHIP'
  pricePerPax: boolean
  datasheets: Record<string, TCDatasheet> // { "ES": {...}, "EN": {...} }
  images: string[]
  productTypes: ('FLIGHT_HOTEL' | 'MULTI' | 'ONLY_FLIGHT' | 'ROUTING' | 'MAGIC_BOX')[]
  currency: string
  vehiclePrice: number
  baseAdultPrice: number
  baseChildrenPrice: number
  baseInfantPrice: number
  baseAdultRTPrice: number
  baseChildrenRTPrice: number
  baseInfantRTPrice: number
  adultTaxesAmount: number
  childrenTaxesAmount: number
  infantTaxesAmount: number
  adultRTTaxesAmount: number
  childrenRTTaxesAmount: number
  infantRTTaxesAmount: number
  startDate: string // "YYYY-MM-DD"
  endDate: string // "YYYY-MM-DD"
  releaseContract: number
  optionCodes: string[]
  operationalDays: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY')[]
  onlyHolidayPackage: boolean
  showInTransportQuotasLanding: boolean
  minChildAge: number
  maxChildAge: number
  minInfantAge: number
  maxInfantAge: number
  allowOWPrice: boolean
  allowRTPrice: boolean
  cancellationRanges: TCCancellationRange[]
  combinableRtContracts: string[]
  segments: TCSegment[]
}

// Transport create response
export interface TCTransportResponse {
  id: string
  // ... other fields returned by TC
}

// Inventory date range
export interface TCInventoryDate {
  start: string // "YYYY-MM-DD"
  end: string // "YYYY-MM-DD"
}

// Inventory
export interface TCInventory {
  inventoryDate: TCInventoryDate
  quantity: number
}

// Modality translation
export interface TCModalityTranslation {
  name: string
}

// Modality
export interface TCModality {
  code: string
  active: boolean
  cabinClassType: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  baggageAllowance: number // Weight in KG or number of pieces
  baggageAllowanceType: 'KG' | 'PC' // KG = kilograms, PC = pieces
  minPassengers: number
  maxPassengers: number
  onRequest: boolean
  inventories: TCInventory[]
  translations: Record<string, TCModalityTranslation> // { "ES": {...}, "EN": {...} }
}

// API Error response
export interface TCErrorResponse {
  error?: string
  message?: string
  status?: number
}

// Sync result
export interface TCSyncResult {
  success: boolean
  transportId?: string
  error?: string
  details?: unknown
}

// Booking / Reservation types from TC

// Transport service within a booking
export interface TCBookingTransportService {
  id: string                          // "SIV-945-0"
  bookingReference: string            // "SIV-TRANSPORT-368156"
  provider: string                    // "CONTRACT_TRANSPORT"
  providerDescription: string         // "Contract Transport Sí, viajo"
  providerConfigurationId: number     // Provider config ID (not supplier)
  supplierId: number                  // Supplier ID (matches our suppliers table)
  supplierName?: string               // "Sí, viajo"
  status?: string                     // "BOOKED", "CANCELLED", etc.
  startDate?: string                  // "2026-04-30T12:00:00"
  endDate?: string                    // "2026-04-30T23:00:00"
  departureDate?: string              // Alternative field name
  arrivalDate?: string
  departureTime?: string
  arrivalTime?: string
  departureAirport?: string           // "EZE"
  arrivalAirport?: string             // "PUJ"
  returnDepartureAirport?: string     // "PUJ"
  returnArrivalAirport?: string       // "EZE"
  returnDepartureDate?: string
  returnArrivalDate?: string
  origin?: string
  destination?: string
  // Passenger counts
  adults?: number
  children?: number
  infants?: number
  // Pricing
  totalAmount?: number
  netAmount?: number
  currency?: string
  // Additional fields
  transportId?: string                // TC transport ID
  modalityCode?: string
  cabinClass?: string
  onewayPrice?: boolean
  segment?: Array<{
    departureAirport: string
    arrivalAirport: string
    departureDate: string
    arrivalDate: string
    flightNumber: string
    bookingClass: string
  }>
}

// Full booking response from TC
export interface TCBookingResponse {
  id: string                          // Booking ID
  bookingReference: string            // "SIV-800"
  status: string                      // "CONFIRMED", "CANCELLED", "MODIFIED"
  creationDate?: string
  modificationDate?: string
  cancellationDate?: string
  // Transport services
  transportservice?: TCBookingTransportService[]
  // Other service types (if any)
  hotelservice?: unknown[]
  // Customer info
  customer?: {
    name?: string
    email?: string
    phone?: string
  }
  // Totals
  totalAmount?: number
  currency?: string
}

// ============================================
// PACKAGE TYPES (Holiday Packages from TC)
// ============================================

// Price with currency
export interface TCPrice {
  amount: number
  currency: string
}

// Geolocation
export interface TCGeolocation {
  latitude: number
  longitude: number
}

// Location info
export interface TCLocation {
  code: string
  name: string
  geolocation?: TCGeolocation
  country?: string
  active?: boolean
  images?: string[]
  description?: string
}

// Origin info in package
export interface TCPackageOrigin {
  location?: TCLocation
}

// Destination in package list
export interface TCPackageDestination {
  code: string
  name: string
}

// Counters in package
export interface TCPackageCounters {
  adults: number
  children: number
  destinations: number
  closedTours: number
  hotelNights: number
  transports: number
  hotels: number
  cars: number
  tickets: number
  transfers: number
  insurances: number
  manuals: number
  cruises: number
}

// Package list item (from GET /package/{micrositeId})
export interface TCPackageListItem {
  id: number
  user: string
  email: string
  title: string
  largeTitle?: string
  imageUrl?: string
  creationDate: string              // "YYYY-MM-DD"
  departureDate?: string            // "YYYY-MM-DD"
  ideaUrl?: string
  externalReference?: string
  themes?: string[]
  pricePerPerson: TCPrice
  totalPrice: TCPrice
  ribbonText?: string
  destinations: TCPackageDestination[]
  itinerary?: unknown[]
  userB2c?: boolean
  active: boolean
  origin?: TCPackageOrigin
  order?: number
  counters: TCPackageCounters
}

// Package list response pagination
export interface TCPackageListPagination {
  firstResult: number
  pageResults: number
  totalResults: number
}

// Package list response
export interface TCPackageListResponse {
  pagination: TCPackageListPagination
  package: TCPackageListItem[]
}

// ============================================
// PACKAGE DETAIL TYPES (from GET /package/{micrositeId}/{id})
// ============================================

// Destination detail in package
export interface TCPackageDestinationDetail {
  dayFrom?: number
  dayTo?: number
  location: TCLocation
}

// Transport segment detail
export interface TCPackageTransportSegment {
  departureAirport: string
  departureAirportName: string
  arrivalAirport: string
  arrivalAirportName: string
  departureTime: string
  arrivalTime: string
  dayDifference?: number
  flightNumber: string
  marketingAirline: string
  operatingAirline?: string
  bookingClass?: string
  baggageInfo?: string
}

// Transport (flight) in package detail
export interface TCPackageTransportDetail {
  id: string
  providerCode?: string
  supplierName?: string
  day?: number
  transportType?: string
  direction?: string
  origin?: TCLocation
  destination?: TCLocation
  company?: string
  transportNumber?: string
  marketingAirlineCode?: string
  operatingAirlineCode?: string
  operatingAirlineName?: string
  departureDate?: string
  departureTime?: string
  arrivalDate?: string
  arrivalTime?: string
  duration?: string
  dayDifference?: number
  fare?: string
  fareClass?: string
  fareBasis?: string
  cabinClass?: string
  baggageInfo?: string
  checkedBaggage?: string
  cabinBaggage?: string
  aircraftType?: string
  terminalDeparture?: string
  terminalArrival?: string
  numSegments?: number
  segments?: TCPackageTransportSegment[]
  netPrice?: TCPrice
  totalPrice?: TCPrice
  mandatory?: boolean
  adults?: number
  children?: number
  infants?: number
  // Price breakdown
  priceBreakdown?: TCServicePriceBreakdown
}

// Price breakdown per service (from priceBreakdown in each service)
export interface TCServicePriceBreakdown {
  netProvider?: {
    microsite?: TCPrice
  }
  operatorFee?: {
    microsite?: TCPrice
  }
  agencyFee?: {
    microsite?: TCPrice
  }
  commission?: {
    microsite?: TCPrice
  }
  taxes?: {
    microsite?: TCPrice
  }
}

// Hotel data from TC (rich info)
export interface TCHotelData {
  id?: string
  name?: string
  category?: string
  description?: string
  address?: string
  phone?: string
  email?: string
  web?: string
  geolocation?: TCGeolocation
  images?: string[]
  facilities?: string[]
  ratings?: {
    overall?: number
    cleanliness?: number
    service?: number
    location?: number
    value?: number
  }
}

// Hotel in package detail
export interface TCPackageHotelDetail {
  id: string
  providerCode?: string
  datasheetId?: string
  supplierName?: string
  day?: number
  hotelName?: string
  hotelCategory?: string
  destination?: TCLocation
  checkInDate?: string
  checkOutDate?: string
  nights?: number
  roomType?: string
  roomTypes?: string // Alternative field name from TC
  roomName?: string
  boardType?: string
  boardName?: string
  mealPlan?: string // Alternative field name from TC
  netPrice?: TCPrice
  totalPrice?: TCPrice
  latitude?: number
  longitude?: number
  address?: string
  mandatory?: boolean
  adults?: number
  children?: number
  infants?: number
  // Rich hotel data
  hotelData?: TCHotelData
  // Price breakdown
  priceBreakdown?: TCServicePriceBreakdown
}

// Transfer in package detail
export interface TCPackageTransferDetail {
  id: string
  providerCode?: string
  supplierName?: string
  day?: number
  transferType?: string
  fromName?: string
  fromLatitude?: number
  fromLongitude?: number
  toName?: string
  toLatitude?: number
  toLongitude?: number
  vehicleType?: string
  serviceType?: string
  productType?: string
  datetime?: string
  durationMinutes?: number
  description?: string
  imageUrl?: string
  netPrice?: TCPrice
  totalPrice?: TCPrice
  mandatory?: boolean
  adults?: number
  children?: number
  infants?: number
  // Price breakdown
  priceBreakdown?: TCServicePriceBreakdown
}

// Closed tour in package detail
export interface TCPackageClosedTourDetail {
  id: string
  providerCode?: string
  supplierId?: number
  supplierName?: string
  dayFrom?: number
  dayTo?: number
  startDate?: string
  endDate?: string
  name?: string
  modalityName?: string
  includedServices?: string
  nonIncludedServices?: string
  netPrice?: TCPrice
  totalPrice?: TCPrice
  mandatory?: boolean
  datasheetId?: string
}

// Car in package detail
export interface TCPackageCarDetail {
  id: string
  dayFrom?: number
  dayTo?: number
  pickupDate?: string
  pickupTime?: string
  pickupLocation?: string
  pickupLatitude?: number
  pickupLongitude?: number
  dropoffDate?: string
  dropoffTime?: string
  dropoffLocation?: string
  dropoffLatitude?: number
  dropoffLongitude?: number
  company?: string
  category?: string
  vehicleName?: string
  vehicleType?: string
  transmission?: string
  fuelPolicy?: string
  doors?: number
  seats?: number
  bags?: number
  airConditioning?: boolean
  includedKm?: string
  insuranceIncluded?: boolean
  netPrice?: TCPrice
  totalPrice?: TCPrice
  pricePerDay?: TCPrice
  daysCount?: number
  mandatory?: boolean
}

// Ticket in package detail
export interface TCPackageTicketDetail {
  id: string
  day?: number
  name?: string
  description?: string
  category?: string
  destination?: TCLocation
  locationName?: string
  latitude?: number
  longitude?: number
  ticketDate?: string
  startTime?: string
  endTime?: string
  duration?: string
  supplierName?: string
  modalityName?: string
  includes?: string
  netPrice?: TCPrice
  totalPrice?: TCPrice
  mandatory?: boolean
}

// Cost breakdown in package detail
export interface TCPackageCostBreakdown {
  airCost?: TCPrice
  hotelCost?: TCPrice
  transferCost?: TCPrice
  carCost?: TCPrice
  tourCost?: TCPrice
  ticketCost?: TCPrice
  insuranceCost?: TCPrice
  otherCost?: TCPrice
  operatorFee?: TCPrice
  agencyFee?: TCPrice
  paymentFee?: TCPrice
  totalNetCost?: TCPrice
  totalFees?: TCPrice
  finalPricePerPax?: TCPrice
}

// Full package detail response
export interface TCPackageDetailResponse {
  id: number
  user?: string
  email?: string
  title: string
  largeTitle?: string
  description?: string
  imageUrl?: string
  creationDate?: string
  departureDate?: string
  dateRangeStart?: string
  dateRangeEnd?: string
  ideaUrl?: string
  externalReference?: string
  themes?: string[]
  pricePerPerson: TCPrice
  totalPrice: TCPrice
  originalPricePerPax?: TCPrice
  active: boolean
  origin?: TCPackageOrigin
  counters: TCPackageCounters

  // Related items
  destinations?: TCPackageDestinationDetail[]
  transports?: TCPackageTransportDetail[]
  hotels?: TCPackageHotelDetail[]
  transfers?: TCPackageTransferDetail[]
  closedTours?: TCPackageClosedTourDetail[]
  cars?: TCPackageCarDetail[]
  tickets?: TCPackageTicketDetail[]

  // Cost breakdown
  costBreakdown?: TCPackageCostBreakdown
}

// Date settings for package availability
export interface TCDateSettings {
  availRange?: {
    start: string  // "YYYY-MM-DD"
    end: string    // "YYYY-MM-DD"
  }
  operationDays?: {
    sunday: boolean
    monday: boolean
    tuesday: boolean
    wednesday: boolean
    thursday: boolean
    friday: boolean
    saturday: boolean
  }
  releaseDays?: number
  stopSales?: string[]
}

// Package info response (from GET /package/{micrositeId}/info/{id})
// This endpoint returns dateSettings which is not in the detail endpoint
export interface TCPackageInfoResponse extends TCPackageListItem {
  dateSettings?: TCDateSettings
}

// ============================================
// TRANSPORT LIST TYPES (for import functionality)
// ============================================

// Transport list item from GET /transport/{supplierId}
export interface TCTransportListItem {
  id: string
  baseId: string
  name: string
  active: boolean
  airlineCode?: string
  transportType: 'PLANE' | 'BUS' | 'TRAIN' | 'SHIP'
  currency: string
  startDate: string
  endDate: string
  pricePerPax: boolean
  // Prices
  baseAdultPrice?: number
  baseChildrenPrice?: number
  baseInfantPrice?: number
  baseAdultRTPrice?: number
  baseChildrenRTPrice?: number
  baseInfantRTPrice?: number
  // Taxes
  adultTaxesAmount?: number
  childrenTaxesAmount?: number
  infantTaxesAmount?: number
  adultRTTaxesAmount?: number
  childrenRTTaxesAmount?: number
  infantRTTaxesAmount?: number
  // Config
  operationalDays?: string[]
  productTypes?: string[]
  allowOWPrice?: boolean
  allowRTPrice?: boolean
  releaseContract?: number
  // Age limits
  minChildAge?: number
  maxChildAge?: number
  minInfantAge?: number
  maxInfantAge?: number
  // Datasheets
  datasheets?: Record<string, TCDatasheet>
  // Segments
  segments?: TCSegment[]
  // Cancellation
  cancellationRanges?: TCCancellationRange[]
}

// Transport list response with modalities
export interface TCTransportWithModalities extends TCTransportListItem {
  modalities?: TCModalityListItem[]
}

// Modality in transport list
export interface TCModalityListItem {
  code: string
  active: boolean
  cabinClassType?: string
  baggageAllowance?: number
  baggageAllowanceType?: 'KG' | 'PC'
  minPassengers?: number
  maxPassengers?: number
  onRequest?: boolean
  inventories?: TCInventory[]
  translations?: Record<string, TCModalityTranslation>
}

// Transport list response
export interface TCTransportListResponse {
  transports: TCTransportWithModalities[]
  pagination?: {
    first: number
    limit: number
    total: number
  }
}
