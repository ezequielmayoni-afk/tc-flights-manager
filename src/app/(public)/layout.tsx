import type { Metadata } from 'next'
import { GtmScript } from '@/components/vuelos-baratos/GtmScript'
import { PublicFooter } from '@/components/vuelos-baratos/PublicFooter'
import { PublicHeader } from '@/components/vuelos-baratos/PublicHeader'
import { OG_BASE } from '@/components/vuelos-baratos/seo'
import { publicBaseUrlObject } from '@/lib/vuelos-baratos/config'

/**
 * Layout de vuelos.siviajo.com: las únicas páginas del HUB sin login.
 *
 * Nada del dashboard entra acá (ni Sidebar, ni Toaster, ni providers): es una
 * landing pública y todo lo que se sume pesa en el LCP de un visitante que
 * llegó de Google. `force-dynamic` evita que el build intente prerenderizar
 * (leen Supabase en cada request).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  metadataBase: publicBaseUrlObject(),
  title: { default: 'Vuelos baratos | Sí, Viajo', template: '%s | Sí, Viajo' },
  openGraph: { ...OG_BASE },
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // Las `NEXT_PUBLIC_*` se inlinean en el build (GitHub Actions), donde el
  // valor no existe; `GTM_ID` se lee en runtime de `/opt/hub/.env.local`.
  const gtmId = (process.env.GTM_ID ?? process.env.NEXT_PUBLIC_GTM_ID)?.trim()

  return (
    <div className="bg-white text-[#393939]">
      {gtmId ? <GtmScript id={gtmId} /> : null}
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</main>
      <PublicFooter />
    </div>
  )
}
