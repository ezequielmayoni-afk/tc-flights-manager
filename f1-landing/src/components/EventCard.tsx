import Link from 'next/link'
import Image from 'next/image'
import type { F1Event } from '@/lib/types'
import { formatPrice, formatDateRange, countryName } from '@/lib/format'

export function EventCard({ ev }: { ev: F1Event }) {
  const location = [ev.venue_name || ev.city, countryName(ev.country_code)]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link
      href={`/gp/${ev.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-brand-900">
        {ev.main_image_url ? (
          <Image
            src={ev.main_image_url}
            alt={ev.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-white/40">🏁</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            {formatDateRange(ev.date_time, ev.date_time_end)}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-balance text-lg font-bold leading-snug text-ink">{ev.name}</h3>
        {location && <p className="text-sm text-muted">{location}</p>}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <span className="block text-xs text-muted">Desde</span>
            <span className="text-xl font-black text-brand">
              {formatPrice(ev.price_ticket_only, ev.currency)}
            </span>
          </div>
          <span className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-brand-700">
            Ver entradas
          </span>
        </div>
      </div>
    </Link>
  )
}
