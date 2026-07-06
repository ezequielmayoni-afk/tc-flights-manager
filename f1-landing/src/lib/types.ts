// Modelo de lectura de la landing. Refleja las columnas relevantes de las
// tablas p1_events / p1_tickets que pobla el scraper. La landing solo lee.

export interface DisplayImage {
  url: string | null
  caption: string | null
  source: 'seat_photo' | 'gp_banner' | 'none'
}

export interface F1Event {
  id: string
  slug: string
  name: string
  venue_name: string | null
  city: string | null
  country_code: string | null
  date_time: string | null
  date_time_end: string | null
  main_image_url: string | null
  price_ticket_only: number | null
  currency: string
}

export interface F1Ticket {
  category_id: string
  name: string
  /** Descripción ya en español (fallback a la original). */
  description: string
  price: number | null
  currency: string
  /** Foto real "vista desde el asiento" (o banner del GP como fallback). */
  image: DisplayImage
  /** Mapa del circuito / plano de asientos (SVG) que ubica el sector. */
  seatplanUrl: string | null
}

export interface CartItem {
  eventSlug: string
  eventName: string
  eventDate: string | null
  categoryId: string
  sectorName: string
  unitPrice: number
  currency: string
  qty: number
  imageUrl: string | null
}
