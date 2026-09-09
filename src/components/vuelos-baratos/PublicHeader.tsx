import Link from 'next/link'
import { siviajoBaseUrl } from '@/lib/vuelos-baratos/config'

const LOGO =
  'https://cdn.travelconline.com/images/fit-in/2000x0/filters:quality(75):strip_metadata():format(webp)/https%3A%2F%2Ftr2storage.blob.core.windows.net%2Fagencylogos%2FhSiUyBcvQLIkIldLLD-ZnpUbCtLuCJ9UNp.png'

/** Barra de la landing: logo a la izquierda y salida al motor a la derecha. */
export function PublicHeader() {
  return (
    <header className="border-b border-[#E3E3E3] bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/vuelos-baratos" aria-label="Sí, Viajo — vuelos baratos">
          {/* El logo vive en el CDN de Travel Compositor: no pasa por el optimizador de Next.
              width/height son los del asset real (775 × 253): le dan al navegador la
              relación de aspecto para reservar los 123 × 40 px antes de que baje. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Sí, Viajo" width={775} height={253} className="h-10 w-auto" />
        </Link>
        <a
          href={siviajoBaseUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[#1A237E] hover:underline"
        >
          Ir a siviajo.com
        </a>
      </div>
    </header>
  )
}
