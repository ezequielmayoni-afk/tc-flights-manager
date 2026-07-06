import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getEventBySlug, getTickets } from '@/lib/data'
import { formatDateRange, countryName } from '@/lib/format'
import { SectorCard } from '@/components/SectorCard'

export const dynamic = 'force-dynamic'

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ev = await getEventBySlug(slug)
  if (!ev) notFound()

  const tickets = await getTickets(ev.id, ev.main_image_url)
  const location = [ev.venue_name, ev.city, countryName(ev.country_code)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-8">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        ← Volver a los Grandes Premios
      </Link>

      {/* Header del evento */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-brand-900 text-white">
        {ev.main_image_url && (
          <Image
            src={ev.main_image_url}
            alt={ev.name}
            fill
            sizes="100vw"
            className="object-cover opacity-40"
            priority
          />
        )}
        <div className="relative z-10 p-6 sm:p-10">
          <span className="text-sm font-semibold uppercase tracking-widest text-accent">
            {formatDateRange(ev.date_time, ev.date_time_end)}
          </span>
          <h1 className="mt-2 text-balance text-3xl font-black sm:text-4xl">{ev.name}</h1>
          {location && <p className="mt-2 text-white/80">{location}</p>}
        </div>
      </section>

      {/* Sectores */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">Elegí tu sector</h2>
          <span className="text-sm text-muted">
            {tickets.length} sector{tickets.length !== 1 ? 'es' : ''} disponible
            {tickets.length !== 1 ? 's' : ''}
          </span>
        </div>

        {tickets.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-surface p-10 text-center text-muted ring-1 ring-black/5">
            No hay entradas disponibles para este Gran Premio en este momento.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {tickets.map((t) => (
              <SectorCard key={t.category_id} ev={ev} ticket={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
