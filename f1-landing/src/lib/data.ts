import { db } from './supabase'
import type { F1Event, F1Ticket, DisplayImage } from './types'

const EVENT_COLS =
  'id, slug, name, venue_name, city, country_code, date_time, date_time_end, main_image_url, price_ticket_only, currency'

function readImage(features: unknown, fallback: string | null): DisplayImage {
  const di = (features as { _display_image?: DisplayImage } | null)?._display_image
  const url = di?.url ?? fallback ?? null
  return {
    url,
    caption: di?.caption ?? null,
    source: di?.source ?? (fallback ? 'gp_banner' : 'none'),
  }
}

/** GP de F1 activos, ordenados por fecha ascendente. */
export async function getEvents(): Promise<F1Event[]> {
  const { data, error } = await db()
    .from('p1_events')
    .select(EVENT_COLS)
    .eq('active', true)
    .eq('series', 'formula-1')
    .order('date_time', { ascending: true })
  if (error) {
    console.error('[data] getEvents:', error.message)
    return []
  }
  return (data ?? []) as unknown as F1Event[]
}

export async function getEventBySlug(slug: string): Promise<F1Event | null> {
  const { data, error } = await db()
    .from('p1_events')
    .select(EVENT_COLS)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()
  if (error) {
    console.error('[data] getEventBySlug:', error.message)
    return null
  }
  return (data as unknown as F1Event) ?? null
}

/** Sectores disponibles de un evento, más baratos primero. */
export async function getTickets(eventId: string, eventBanner: string | null): Promise<F1Ticket[]> {
  // Seleccionamos '*' para tolerar que description_es aún no exista (pre-migración):
  // si la columna falta, simplemente no viene y hacemos fallback a description.
  const { data, error } = await db()
    .from('p1_tickets')
    .select('*')
    .eq('event_id', eventId)
    .eq('availability', 'available')
    .order('price', { ascending: true })
  if (error) {
    console.error('[data] getTickets:', error.message)
    return []
  }
  return (data ?? []).map((t: Record<string, unknown>) => ({
    category_id: t.category_id as string,
    name: (t.name as string) ?? '',
    description: ((t.description_es as string) || (t.description as string) || '').trim(),
    price: (t.price as number) ?? null,
    currency: (t.currency as string) ?? 'EUR',
    image: readImage(t.features, eventBanner),
  }))
}

/** Precio de un sector puntual — para revalidar el carrito en el checkout. */
export async function getTicketPrice(
  eventSlug: string,
  categoryId: string
): Promise<{ price: number; currency: string; sectorName: string; eventName: string; eventId: string } | null> {
  const ev = await getEventBySlug(eventSlug)
  if (!ev) return null
  const { data, error } = await db()
    .from('p1_tickets')
    .select('name, price, currency')
    .eq('event_id', ev.id)
    .eq('category_id', categoryId)
    .eq('availability', 'available')
    .maybeSingle()
  if (error || !data) return null
  return {
    price: (data.price as number) ?? 0,
    currency: (data.currency as string) ?? 'EUR',
    sectorName: (data.name as string) ?? '',
    eventName: ev.name,
    eventId: ev.id,
  }
}
