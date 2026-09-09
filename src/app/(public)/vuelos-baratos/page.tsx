import type { Metadata } from 'next'
import { DestinationCard } from '@/components/vuelos-baratos/DestinationCard'
import { Disclosure } from '@/components/vuelos-baratos/Disclosure'
import { JsonLd } from '@/components/vuelos-baratos/JsonLd'
import { OriginTabs } from '@/components/vuelos-baratos/OriginTabs'
import { PublicHero } from '@/components/vuelos-baratos/PublicHero'
import { SearchBoxSlot } from '@/components/vuelos-baratos/SearchBoxSlot'
import { OG_BASE } from '@/components/vuelos-baratos/seo'
import { BOTON_PRIMARIO, formatUsd } from '@/components/vuelos-baratos/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import { summarizeDestinations } from '@/lib/vuelos-baratos/aggregates'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import {
  DEFAULT_ORIGIN,
  ORIGINS,
  PUBLIC_CACHE_TTL_MS,
  type Origin,
  originByCode,
  publicBaseUrl,
  siviajoBaseUrl,
} from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { getRecentProbesForRoutes, listLandingDestinations, listRoutes } from '@/lib/vuelos-baratos/queries'
import type { DestinationSummary } from '@/lib/vuelos-baratos/types'

/**
 * Home de vuelos.siviajo.com: el precio más bajo vigente de cada destino
 * activo saliendo de la ciudad elegida.
 *
 * Todo lo que se muestra sale del barrido nocturno (observaciones de las
 * últimas 48 h), nunca de una búsqueda en vivo: la búsqueda real recién pasa
 * cuando el visitante toca "Seleccionar" y se va a siviajo.com.
 */

const ORIGEN_POR_DEFECTO: Origin = originByCode(DEFAULT_ORIGIN) ?? ORIGINS[0]

type SearchParams = Record<string, string | string[] | undefined>

interface PageProps {
  searchParams: Promise<SearchParams>
}

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** Un `?from=` desconocido no rompe nada: cae en el origen por defecto. */
function origenDe(sp: SearchParams): Origin {
  return originByCode(first(sp.from)) ?? ORIGEN_POR_DEFECTO
}

async function loadHome(originCode: string): Promise<DestinationSummary[]> {
  return ttlMemo(`landing:${originCode}`, PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const [destinations, routes] = await Promise.all([
      listLandingDestinations(db, { activeOnly: true }),
      listRoutes(db, { activeOnly: true }),
    ])
    const delOrigen = routes.filter(route => route.origin_tc_code === originCode)
    const fromDate = todayIso(new Date())
    const rowsByRoute = await getRecentProbesForRoutes(
      db,
      delOrigen.map(route => route.id),
      { fromDate }
    )
    return summarizeDestinations({ rowsByRoute, routes: delOrigen, destinations, fromDate })
  })
}

/** 'Miami desde US$ 722, Madrid desde US$ 850 y Roma desde US$ 900'. */
function listaEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

function masBaratos(resumen: DestinationSummary[], cuantos: number): DestinationSummary[] {
  return resumen
    .filter((d): d is DestinationSummary & { minPrice: number } => d.minPrice !== null)
    .sort((a, b) => a.minPrice - b.minPrice)
    .slice(0, cuantos)
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const origen = origenDe(await searchParams)
  const resumen = await loadHome(origen.code)
  const top = masBaratos(resumen, 3)

  const title = `Vuelos baratos desde ${origen.name}`
  const description =
    top.length > 0
      ? `${listaEs(top.map(d => `${d.name} desde ${formatUsd(d.minPrice as number)}`))}. Precios por persona, ida y vuelta, encontrados en las últimas 48 horas en siviajo.com.`
      : `Los vuelos más baratos que encontramos saliendo de ${origen.name}. Precios por persona, ida y vuelta, actualizados todos los días en siviajo.com.`

  return {
    title,
    description,
    alternates: { canonical: '/vuelos-baratos' },
    // Una sola versión indexable: las demás ciudades son la misma página filtrada.
    robots: { index: origen.code === DEFAULT_ORIGIN, follow: true },
    // El openGraph de la página pisa al del layout: `locale` y `siteName` van de nuevo.
    openGraph: { ...OG_BASE, title, description, type: 'website', url: '/vuelos-baratos' },
  }
}

export default async function VuelosBaratosHome({ searchParams }: PageProps) {
  const origen = origenDe(await searchParams)
  const resumen = await loadHome(origen.code)
  const conDatos = resumen.filter(d => d.minPrice !== null)
  const now = new Date()
  const base = publicBaseUrl()

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Vuelos baratos desde ${origen.name}`,
    itemListElement: conDatos.map((destino, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: destino.name,
      url: `${base}/vuelos-baratos/${destino.slug}`,
    })),
  }

  return (
    <>
      <PublicHero
        title={`Vuelos baratos desde ${origen.name}`}
        subtitle="Los mejores precios que encontramos en siviajo.com en las últimas 48 horas. Por persona, ida y vuelta, tarifa más baja sin valija despachada."
      >
        <SearchBoxSlot originCode={origen.code} />
      </PublicHero>

      <OriginTabs origins={ORIGINS} active={origen.code} />

      {conDatos.length > 0 ? (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {conDatos.map(destino => (
            <DestinationCard key={`${destino.code}-${destino.originCode}`} summary={destino} originName={origen.name} now={now} />
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-[8px] border border-[#E3E3E3] bg-[#F8F9FA] px-4 py-10 text-center">
          <p className="text-sm text-[#495057]">Estamos actualizando los precios. Volvé en unas horas.</p>
          <a
            href={`${siviajoBaseUrl()}/es/?tripType=ONLY_FLIGHT`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTON_PRIMARIO} mt-4`}
          >
            Buscar vuelos en siviajo.com
          </a>
        </section>
      )}

      <div className="mt-8 mb-4">
        <Disclosure />
      </div>

      {conDatos.length > 0 ? <JsonLd data={itemList} /> : null}
    </>
  )
}
