import { ImageResponse } from 'next/og'
import { OgCard } from '@/components/vuelos-baratos/OgCard'
import { ORIGEN_POR_DEFECTO, loadHome, masBaratos } from './_data'

/**
 * La imagen que se ve cuando alguien comparte la home.
 *
 * Next la engancha sola al `openGraph.images` de este segmento (y, de ahí, al
 * `twitter:image`): por eso la página NO declara `images` a mano. Ojo que la
 * URL que genera lleva un sufijo con hash porque el segmento vive dentro del
 * grupo `(public)` — se lee del `<meta>`, no se escribe a mano.
 *
 * Va siempre con el origen por defecto: una imagen de OpenGraph no recibe
 * query string, así que no puede variar por `?from=`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = `Vuelos baratos desde ${ORIGEN_POR_DEFECTO.name} · Sí, Viajo`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const resumen = await loadHome(ORIGEN_POR_DEFECTO.code)
  const masBarato = masBaratos(resumen, 1)[0] ?? null

  return new ImageResponse(
    (
      <OgCard
        title={`Vuelos baratos desde ${ORIGEN_POR_DEFECTO.name}`}
        subtitle={
          masBarato
            ? `${masBarato.name} desde US$ ${Math.round(masBarato.minPrice).toLocaleString('es-AR')} · ida y vuelta por persona`
            : 'Ida y vuelta por persona · precios actualizados todos los días'
        }
      />
    ),
    { ...size }
  )
}
