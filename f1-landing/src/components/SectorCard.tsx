'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { F1Ticket, F1Event } from '@/lib/types'
import { formatPrice } from '@/lib/format'
import { useCart } from '@/lib/cart'

function DescriptionList({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-•\s]+/, '').trim())
    .filter(Boolean)
  if (lines.length <= 1) {
    return <p className="text-sm text-muted">{text}</p>
  }
  return (
    <ul className="space-y-1 text-sm text-muted">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-accent-600">✓</span>
          <span>{l}</span>
        </li>
      ))}
    </ul>
  )
}

interface GalleryImage {
  url: string
  label: string
  kind: 'photo' | 'map'
}

function Gallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState(0)
  if (images.length === 0) {
    return <div className="grid aspect-[16/10] place-items-center bg-brand-900 text-white/40">🏟️</div>
  }
  const current = images[Math.min(active, images.length - 1)]
  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-900">
        {current.kind === 'photo' ? (
          <Image src={current.url} alt={current.label} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
        ) : (
          // El mapa del circuito es SVG: <img> lo renderiza sin optimización.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={current.label} className="h-full w-full bg-white object-contain p-2" />
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white">
          {current.label}
        </span>
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 p-2">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition ${
                i === active ? 'ring-brand' : 'ring-transparent opacity-70 hover:opacity-100'
              }`}
              aria-label={img.label}
            >
              {img.kind === 'photo' ? (
                <Image src={img.url} alt={img.label} fill sizes="80px" className="object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt={img.label} className="h-full w-full bg-white object-contain p-0.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SectorCard({ ev, ticket }: { ev: F1Event; ticket: F1Ticket }) {
  const { add } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const gallery: GalleryImage[] = []
  if (ticket.image.url) {
    gallery.push({
      url: ticket.image.url,
      label: ticket.image.source === 'seat_photo' && ticket.image.caption ? ticket.image.caption : 'Vista del sector',
      kind: 'photo',
    })
  }
  if (ticket.seatplanUrl) {
    gallery.push({ url: ticket.seatplanUrl, label: 'Ubicación en el circuito', kind: 'map' })
  }

  const handleAdd = () => {
    if (ticket.price == null) return
    add({
      eventSlug: ev.slug,
      eventName: ev.name,
      eventDate: ev.date_time,
      categoryId: ticket.category_id,
      sectorName: ticket.name,
      unitPrice: ticket.price,
      currency: ticket.currency,
      qty,
      imageUrl: ticket.image.url,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-sm ring-1 ring-black/5">
      <Gallery images={gallery} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-lg font-bold leading-snug">{ticket.name}</h3>
        {ticket.description && <DescriptionList text={ticket.description} />}

        <div className="mt-auto flex items-end justify-between pt-3">
          <div>
            <span className="block text-xs text-muted">Precio por persona</span>
            <span className="text-xl font-black text-brand">
              {formatPrice(ticket.price, ticket.currency)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full ring-1 ring-black/10">
              <button
                type="button"
                aria-label="Restar"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="grid h-9 w-9 place-items-center text-lg text-muted hover:text-ink"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold">{qty}</span>
              <button
                type="button"
                aria-label="Sumar"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                className="grid h-9 w-9 place-items-center text-lg text-muted hover:text-ink"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={ticket.price == null}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {added ? '✓ Agregado' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
