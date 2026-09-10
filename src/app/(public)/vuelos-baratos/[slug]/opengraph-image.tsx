import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { OgCard } from '@/components/vuelos-baratos/OgCard'
import { bestOverall } from '@/lib/vuelos-baratos/aggregates'
import { SLUG_RE } from '@/lib/vuelos-baratos/config'
import { ORIGEN_POR_DEFECTO, loadDestino } from '../_data'

/**
 * La imagen que se ve cuando alguien comparte un destino.
 *
 * Mismo dato que el H1 (`bestOverall` de los pares vigentes) y por el mismo
 * memo de 10 minutos: si la tarjeta dijera un precio y la página otro, el que
 * llega desde WhatsApp se siente estafado. Un destino despublicado o inventado
 * es 404, igual que la página.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = 'Vuelos baratos, ida y vuelta por persona · Sí, Viajo'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUG_RE.test(slug)) notFound()

  const data = await loadDestino(slug, ORIGEN_POR_DEFECTO.code)
  if (!data) notFound()

  const min = bestOverall(data.pairs)?.pricePp ?? null

  return new ImageResponse(
    (
      <OgCard
        title={`Vuelos baratos a ${data.destination.name}`}
        subtitle={
          min === null
            ? `Ida y vuelta por persona desde ${ORIGEN_POR_DEFECTO.name}`
            : `desde US$ ${Math.round(min).toLocaleString('es-AR')} · ida y vuelta por persona`
        }
      />
    ),
    { ...size }
  )
}
