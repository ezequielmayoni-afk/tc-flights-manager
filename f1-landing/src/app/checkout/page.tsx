'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart'
import { formatPrice, formatDateRange } from '@/lib/format'

export default function CheckoutPage() {
  const { items, total, currency, setQty, remove, clear, count, ready } = useCart()
  const router = useRouter()
  const [buyer, setBuyer] = useState({ name: '', email: '', doc: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPay =
    count > 0 && buyer.name.trim() && /.+@.+\..+/.test(buyer.email) && !loading

  const handlePay = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer,
          items: items.map((i) => ({
            eventSlug: i.eventSlug,
            categoryId: i.categoryId,
            qty: i.qty,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el pago')

      clear()
      if (data.init_point) {
        window.location.href = data.init_point as string
      } else {
        router.push(`/checkout/exito?order=${data.orderId}&pendiente=1`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setLoading(false)
    }
  }

  if (ready && count === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-[var(--radius-card)] bg-surface p-10 text-center ring-1 ring-black/5">
        <p className="text-4xl">🛒</p>
        <h1 className="mt-3 text-xl font-bold">Tu carrito está vacío</h1>
        <p className="mt-1 text-muted">Elegí un Gran Premio y sumá tus entradas.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
        >
          Ver Grandes Premios
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      {/* Ítems */}
      <section>
        <h1 className="mb-4 text-2xl font-bold">Tu carrito</h1>
        <div className="space-y-3">
          {items.map((i) => (
            <div
              key={i.categoryId}
              className="flex gap-3 rounded-[var(--radius-card)] bg-surface p-3 ring-1 ring-black/5"
            >
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-brand-900">
                {i.imageUrl && (
                  <Image src={i.imageUrl} alt={i.sectorName} fill sizes="112px" className="object-cover" />
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <p className="text-sm font-semibold">{i.eventName}</p>
                <p className="text-sm text-muted">{i.sectorName}</p>
                <p className="text-xs text-muted">{formatDateRange(i.eventDate, null)}</p>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center rounded-full ring-1 ring-black/10">
                    <button onClick={() => setQty(i.categoryId, i.qty - 1)} className="h-8 w-8 text-muted hover:text-ink">−</button>
                    <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>
                    <button onClick={() => setQty(i.categoryId, i.qty + 1)} className="h-8 w-8 text-muted hover:text-ink">+</button>
                  </div>
                  <span className="font-bold text-brand">{formatPrice(i.unitPrice * i.qty, i.currency)}</span>
                </div>
              </div>
              <button
                onClick={() => remove(i.categoryId)}
                aria-label="Quitar"
                className="self-start text-muted hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Resumen + comprador */}
      <section className="h-fit space-y-4 rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b pb-3">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-black text-brand">{formatPrice(total, currency)}</span>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold">Datos del comprador</h2>
          <input
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Nombre y apellido *"
            value={buyer.name}
            onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Email *"
            type="email"
            value={buyer.email}
            onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Documento / DNI"
            value={buyer.doc}
            onChange={(e) => setBuyer({ ...buyer, doc: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Teléfono"
            value={buyer.phone}
            onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          onClick={handlePay}
          disabled={!canPay}
          className="w-full rounded-full bg-accent py-3 font-bold text-brand-900 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Procesando…' : 'Pagar con MercadoPago'}
        </button>
        <p className="text-center text-xs text-muted">
          Pago protegido. Los precios se confirman contra disponibilidad al momento de pagar.
        </p>
      </section>
    </div>
  )
}
