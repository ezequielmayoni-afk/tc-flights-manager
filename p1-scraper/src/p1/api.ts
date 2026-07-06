// Client for the p1travel checkout API v2 (_TWBP). getEvent fetches the full
// event JSON for an (eventUuid, categoryUuid) pair and returns the typed `data`
// envelope contents that normalize.ts (Plan 04) consumes.

import { BROWSER_UA, THROTTLE_MS } from '../config.js'

export interface P1City {
  name?: string
}

export interface P1Venue {
  name?: string
  country_code?: string
  latitude?: number | undefined
  longitude?: number | undefined
  city?: P1City
  time_zone?: string
}

export interface P1Content {
  main_image?: string
  marketing_label?: string
  description?: string
}

export interface P1TicketOption {
  ticket_id?: string
  category_id?: string
  category_name?: string
  supplement_pp?: string
}

export interface P1Ticket {
  category_id?: string
  name?: string
  description?: string
  seatplan_image?: string
  supplement_pp_for_num_tickets?: Record<string, string>
  possible_ticket_types?: string[]
}

export interface P1BasePackage {
  prices_pp?: Record<string, string>
  // API returns this as either a plain string or a prices_pp-style object map.
  // normalize.ts (Plan 04) handles both shapes.
  prices_compare?: Record<string, string> | string
  ticket_options?: P1TicketOption[]
}

export interface P1EventData {
  name?: string
  date_time?: string
  date_time_end?: string
  status?: string
  category?: string
  venue?: P1Venue
  content?: P1Content
  base_package?: P1BasePackage
  tickets?: P1Ticket[]
  category_properties?: Record<string, any>
}

export async function getEvent(
  eventUuid: string,
  categoryUuid: string
): Promise<P1EventData> {
  const url =
    `https://checkout.p1travel.com/_TWBP/api/v2/events/${eventUuid}` +
    `?include=organizer,base_package_ticket_options,content,venue,series` +
    `&base_ticket_cat_id=${categoryUuid}&locale=es`

  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
  })

  if (!res.ok) {
    throw new Error('[api] getEvent ' + res.status + ' for ' + eventUuid)
  }

  const json = (await res.json()) as { data: P1EventData }
  await new Promise((r) => setTimeout(r, THROTTLE_MS))
  return json.data as P1EventData
}
