export interface CopyPackageData {
  packageId: number
  tcPackageId: number
  title: string
  destinations: string[]
  primaryDestination: string
  family: string | null
  hotelName: string | null
  hotelStars: number | null
  boardName: string | null
  nights: number | null
  pricePerPax: number | null
  currency: string
  departureDate: string | null
  dateRangeStart: string | null
  dateRangeEnd: string | null
  airline: string | null
  directFlight: boolean | null
  originCity: string | null
  includes: { flights: boolean; hotel: boolean; transfers: boolean; tours: boolean; tickets: boolean }
  /** Lugares que quedan si es cupo; null si es de sistema. */
  cupoRemaining: number | null
  isOperatorDeparture: boolean
  themes: string[]
  adults: number
  children: number
}

export interface GeneratedCopy {
  variant: number
  angle: string
  primary_text: string
  headline: string
  description: string
}
