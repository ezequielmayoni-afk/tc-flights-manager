import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumb } from '@/components/vuelos-baratos/Breadcrumb'
import { Disclosure } from '@/components/vuelos-baratos/Disclosure'
import { FaqSection, type FaqItem } from '@/components/vuelos-baratos/FaqSection'
import { FaresTable } from '@/components/vuelos-baratos/FaresTable'
import { FilterSidebar } from '@/components/vuelos-baratos/FilterSidebar'
import { JsonLd } from '@/components/vuelos-baratos/JsonLd'
import { MonthChips } from '@/components/vuelos-baratos/MonthChips'
import { OriginSelect } from '@/components/vuelos-baratos/OriginSelect'
import { Pagination } from '@/components/vuelos-baratos/Pagination'
import { SearchBox } from '@/components/vuelos-baratos/SearchBox'
import { OG_BASE } from '@/components/vuelos-baratos/seo'
import { BOTON_PRIMARIO, CARD, formatUsd } from '@/components/vuelos-baratos/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  airlinesWithMin,
  applyFilters,
  bestOverall,
  bestPerMonth,
  bestPerPair,
  freshnessLabel,
  lastObservedAt,
  paginate,
  priceLimits,
  sortPairs,
  summarizeDestinations,
} from '@/lib/vuelos-baratos/aggregates'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import {
  DEFAULT_ORIGIN,
  OBSERVATION_WINDOW_HOURS,
  ORIGINS,
  PAGE_SIZE,
  PUBLIC_CACHE_TTL_MS,
  SLUG_RE,
  type Origin,
  originByCode,
  publicBaseUrl,
  siviajoBaseUrl,
} from '@/lib/vuelos-baratos/config'
import { buildSiviajoFlightUrl, withUtm } from '@/lib/vuelos-baratos/deep-link'
import { monthsAhead, todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { minEstimateByMonth } from '@/lib/vuelos-baratos/estimate'
import { hasActiveFilters, parseExplorerFilters } from '@/lib/vuelos-baratos/filters'
import {
  getEstimatesForRoute,
  getRecentProbes,
  getRecentProbesForRoutes,
  getRouteByCodes,
  listLandingDestinations,
  listRoutes,
} from '@/lib/vuelos-baratos/queries'
import type { BestPair, DestinationSummary, LandingDestinationRow, LandingRouteRow, MonthSummary } from '@/lib/vuelos-baratos/types'

/**
 * Página de destino: el explorador de fechas de una ruta (origen → destino).
 *
 * La lectura de la base va cacheada 10 minutos por (destino, origen); los
 * filtros, el orden y el paginado se resuelven en memoria sobre esos pares,
 * así una URL con filtros no le pega a Supabase de nuevo.
 */

const ORIGEN_POR_DEFECTO: Origin = originByCode(DEFAULT_ORIGIN) ?? ORIGINS[0]
const MESES_A_MOSTRAR = 12
/** Google no lee más de eso y el HTML no tiene por qué crecer al pedo. */
const MAX_OFERTAS_JSONLD = 20

type SearchParams = Record<string, string | string[] | undefined>

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}

interface DestinoData {
  destination: LandingDestinationRow
  route: LandingRouteRow | null
  pairs: BestPair[]
  /** Mínimo estimado por Sabre de cada mes: sólo para los chips sin sonda. */
  estimatedByMonth: Map<string, number>
}

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function origenDe(sp: SearchParams): Origin {
  return originByCode(first(sp.from)) ?? ORIGEN_POR_DEFECTO
}

/**
 * Los destinos publicados, indexados por slug, bajo UNA sola clave de memo.
 *
 * Resolver el slug acá (y no con una consulta por slug) evita cachear un
 * `null` por cada URL inventada: un crawler hostil pega siempre a esta entrada.
 * Despublicar un destino tiene que sacarlo de Google, así que sólo entran los
 * activos.
 */
async function destinosPublicados(): Promise<Map<string, LandingDestinationRow>> {
  return ttlMemo('landing:destinations', PUBLIC_CACHE_TTL_MS, async () => {
    const destinos = await listLandingDestinations(createAdminClient(), { activeOnly: true })
    return new Map(destinos.map(destino => [destino.slug, destino]))
  })
}

async function loadDestino(slug: string, originCode: string): Promise<DestinoData | null> {
  const destination = (await destinosPublicados()).get(slug)
  // Un slug que no existe no se memoiza: sólo lo publicado ocupa lugar.
  if (!destination) return null

  return ttlMemo(`dest:${slug}:${originCode}`, PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const route = await getRouteByCodes(db, destination.code, originCode)
    if (!route) return { destination, route: null, pairs: [], estimatedByMonth: new Map() }

    const fromDate = todayIso(new Date())
    const rows = await getRecentProbes(db, route.id, { fromDate })
    // Las estimaciones de Sabre valen lo mismo que una observación (48 h) y
    // sólo se usan para los chips de meses todavía sin sonda.
    const estimates = await getEstimatesForRoute(db, route.id, { sinceHours: OBSERVATION_WINDOW_HOURS, fromDate })
    return { destination, route, pairs: bestPerPair(rows, { fromDate }), estimatedByMonth: minEstimateByMonth(estimates) }
  })
}

/** El mínimo del destino desde cada ciudad, para la sección "por ciudad". */
async function loadPorCiudad(destination: LandingDestinationRow): Promise<DestinationSummary[]> {
  return ttlMemo(`dest-cities:${destination.code}`, PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const routes = await listRoutes(db, { activeOnly: true, destinationCode: destination.code })
    const fromDate = todayIso(new Date())
    const rowsByRoute = await getRecentProbesForRoutes(
      db,
      routes.map(route => route.id),
      { fromDate }
    )
    return summarizeDestinations({ rowsByRoute, routes, destinations: [destination], fromDate })
  })
}

type MesConPrecio = MonthSummary & { minPrice: number }

/** '2026-12-02' → '02/12/2026'. Sin `Date`: acá no hay que meter zonas horarias. */
function fechaJsonLd(iso: string): string {
  const [año, mes, dia] = iso.split('-')
  return dia && mes && año ? `${dia}/${mes}/${año}` : iso
}

function mesMasBarato(months: MonthSummary[]): MesConPrecio | null {
  return months
    .filter((m): m is MesConPrecio => m.minPrice !== null)
    .sort((a, b) => a.minPrice - b.minPrice || a.month.localeCompare(b.month))[0] ?? null
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params
  if (!SLUG_RE.test(slug)) return { title: 'Vuelos baratos' }

  const sp = await searchParams
  const origen = origenDe(sp)
  const filters = parseExplorerFilters(sp)
  const data = await loadDestino(slug, origen.code)
  if (!data) return { title: 'Vuelos baratos' }

  const { destination, pairs } = data
  const min = bestOverall(pairs)?.pricePp ?? null
  const mes = mesMasBarato(bestPerMonth(pairs, monthsAhead(new Date(), MESES_A_MOSTRAR)))

  const title =
    destination.seo_title ??
    (min === null ? `Vuelos baratos a ${destination.name}` : `Vuelos baratos a ${destination.name} desde ${formatUsd(min)}`)
  const description =
    destination.seo_description ??
    (pairs.length === 0
      ? `Precios de vuelos a ${destination.name} desde ${origen.name}: por persona, ida y vuelta, actualizados todos los días en siviajo.com.`
      : `${pairs.length} ${pairs.length === 1 ? 'combinación' : 'combinaciones'} de fechas para volar a ${destination.name} desde ${origen.name}${
          mes ? `. El mes más barato es ${mes.label} desde ${formatUsd(mes.minPrice)}` : ''
        }. Precios por persona, ida y vuelta, sin valija despachada.`)

  return {
    title,
    description,
    alternates: { canonical: `/vuelos-baratos/${slug}` },
    // Sólo la versión limpia va al índice: filtros y meses son la misma página.
    robots: { index: origen.code === DEFAULT_ORIGIN && !hasActiveFilters(filters) && !filters.month, follow: true },
    // El openGraph de la página pisa al del layout: `locale` y `siteName` van de nuevo.
    openGraph: { ...OG_BASE, title, description, type: 'website', url: `/vuelos-baratos/${slug}` },
  }
}

export default async function DestinoPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  // Un slug raro es una URL inventada, no un destino que se cayó: 404 directo.
  if (!SLUG_RE.test(slug)) notFound()

  const sp = await searchParams
  const origen = origenDe(sp)
  const filters = parseExplorerFilters(sp)
  const data = await loadDestino(slug, origen.code)
  if (!data) notFound()

  const { destination, route, pairs, estimatedByMonth } = data
  const now = new Date()
  const months = bestPerMonth(pairs, monthsAhead(now, MESES_A_MOSTRAR))
  // El estimado sólo completa los meses sin precio confirmado: el H1, la tabla
  // y el JSON-LD siguen mirando `months`, que sale sólo de las sondas.
  const chips = months.map(mes => ({ ...mes, estimated: estimatedByMonth.get(mes.month) ?? null }))
  const overall = bestOverall(pairs)
  const observedAt = lastObservedAt(pairs)
  const limits = priceLimits(pairs)
  const airlines = airlinesWithMin(pairs)
  const filtered = applyFilters(pairs, filters)
  const sorted = sortPairs(filtered, filters.sort, filters.dir)
  const page = paginate(sorted, filters.page, PAGE_SIZE)

  const path = `/vuelos-baratos/${slug}`
  // La base de los links lleva el origen pegado: así ningún click lo pierde.
  const basePath = origen.code === DEFAULT_ORIGIN ? path : `${path}?from=${origen.code}`
  const base = publicBaseUrl()
  const vacio = !route || pairs.length === 0

  const breadcrumb = [
    { label: 'Inicio', href: siviajoBaseUrl(), external: true },
    { label: 'Vuelos baratos', href: '/vuelos-baratos' },
    { label: destination.name },
  ]

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: siviajoBaseUrl() },
      { '@type': 'ListItem', position: 2, name: 'Vuelos baratos', item: `${base}/vuelos-baratos` },
      { '@type': 'ListItem', position: 3, name: destination.name, item: `${base}${path}` },
    ],
  }

  const ofertas = route
    ? page.items.slice(0, MAX_OFERTAS_JSONLD).flatMap((pair, i) => {
        try {
          const url = withUtm(
            buildSiviajoFlightUrl({
              originCode: route.origin_tc_code,
              destCode: destination.tc_code,
              departDate: pair.depart,
              returnDate: pair.return,
              adults: 1,
            }),
            { campaign: slug, content: `${pair.depart}_${pair.return}` }
          )
          return [
            {
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'Offer',
                // Sin `name` cada oferta queda como un precio suelto en el
                // rich result: acá dice de dónde a dónde y en qué fechas.
                name: `Vuelo ${origen.name} → ${destination.name}, ${fechaJsonLd(pair.depart)}–${fechaJsonLd(pair.return)}`,
                price: pair.pricePp,
                priceCurrency: 'USD',
                url,
                availability: 'https://schema.org/InStock',
              },
            },
          ]
        } catch {
          return []
        }
      })
    : []

  const mesBarato = mesMasBarato(months)
  const hayDirectos = pairs.some(pair => pair.stopsOut === 0)
  const directoMin = bestOverall(pairs.filter(pair => pair.stopsOut === 0))
  const faqs: FaqItem[] = [...destination.faq]
  if (!vacio) {
    if (mesBarato) {
      faqs.push({
        q: `¿Cuál es el mes más barato para volar a ${destination.name}?`,
        a: `Con lo que encontramos en las últimas 48 horas, ${mesBarato.label}: hay salidas desde ${origen.name} desde ${formatUsd(
          mesBarato.minPrice
        )} por persona, ida y vuelta.`,
      })
    }
    faqs.push({
      q: `¿Hay vuelos directos a ${destination.name}?`,
      a: hayDirectos
        ? `Sí. Entre las fechas que sondeamos hay vuelos directos desde ${origen.name}${
            directoMin ? ` desde ${formatUsd(directoMin.pricePp)} por persona` : ''
          }.`
        : `En las fechas que sondeamos no encontramos vuelos directos desde ${origen.name}: las opciones más baratas hacen al menos una escala.`,
    })
  }

  const porCiudad = (await loadPorCiudad(destination))
    .filter(ciudad => ciudad.minPrice !== null)
    .flatMap(ciudad => {
      const origin = originByCode(ciudad.originCode)
      return origin ? [{ ciudad, origin }] : []
    })

  return (
    <div className="py-6">
      <Breadcrumb items={breadcrumb} />

      <h1 className="mt-4 text-2xl font-bold leading-tight text-[#1A237E] sm:text-3xl">
        {overall ? `Vuelos baratos a ${destination.name} desde ${formatUsd(overall.pricePp)}` : `Vuelos baratos a ${destination.name}`}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#495057]">
        por persona · ida y vuelta desde {origen.name} · tarifa más baja sin valija despachada · precios encontrados en las
        últimas 48 h{observedAt ? ` · actualizado ${freshnessLabel(observedAt, now)}` : ''}
      </p>

      <div className="mt-5">
        <SearchBox originCode={origen.code} destination={destination} siviajoBase={siviajoBaseUrl()} />
      </div>

      <div className="mt-5">
        <OriginSelect origins={ORIGINS} active={origen.code} path={path} filters={filters} />
      </div>

      <div className="mt-5 flex gap-6 border-b border-[#E3E3E3] text-sm">
        <span className="-mb-px border-b-2 border-[#1A237E] pb-2 font-semibold text-[#1A237E]">Ida y vuelta</span>
        <span className="cursor-not-allowed pb-2 text-[#B2B2B2]" aria-disabled="true" title="Muy pronto">
          Solo ida
        </span>
      </div>

      {vacio ? (
        <section className="mt-6 rounded-[8px] border border-[#E3E3E3] bg-[#F8F9FA] px-4 py-10 text-center">
          <p className="text-sm text-[#495057]">
            Todavía no tenemos precios para {destination.name} desde {origen.name}. Buscá tus fechas en siviajo.com.
          </p>
          <a
            href={`${siviajoBaseUrl()}/es/?tripType=ONLY_FLIGHT`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTON_PRIMARIO} mt-4`}
          >
            Buscar vuelos en siviajo.com
          </a>
        </section>
      ) : (
        <>
          <div className="mt-6">
            <MonthChips months={chips} active={filters.month} filters={filters} basePath={basePath} />
          </div>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row">
            <div className="lg:w-[280px] lg:shrink-0">
              <FilterSidebar filters={filters} priceLimits={limits} airlines={airlines} basePath={basePath} />
            </div>
            <div className="min-w-0 flex-1">
              <FaresTable
                pairs={page.items}
                total={page.total}
                filters={filters}
                basePath={basePath}
                originCode={route.origin_tc_code}
                destCode={destination.tc_code}
                destinationSlug={slug}
              />
              <Pagination page={page.page} pages={page.pages} filters={filters} basePath={basePath} />
            </div>
          </div>
        </>
      )}

      {porCiudad.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-[#1A237E]">Vuelos a {destination.name} por ciudad</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {porCiudad.map(({ ciudad, origin }) => (
              <Link
                key={origin.code}
                href={origin.code === DEFAULT_ORIGIN ? path : `${path}?from=${origin.code}`}
                className={`${CARD} block px-4 py-4 transition hover:border-[#1A237E]`}
              >
                <p className="text-sm font-semibold text-[#1A237E]">Desde {origin.name}</p>
                <p className="mt-2 text-xl font-bold tabular-nums text-[#1A237E]">{formatUsd(ciudad.minPrice as number)}</p>
                <p className="mt-1 text-xs text-[#495057]">por persona, ida y vuelta</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <FaqSection items={faqs} title={`Preguntas frecuentes sobre vuelos a ${destination.name}`} />

      <div className="mt-8">
        <Disclosure />
      </div>

      <JsonLd data={breadcrumbJsonLd} />
      {ofertas.length > 0 ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `Vuelos a ${destination.name} desde ${origen.name}`,
            itemListElement: ofertas,
          }}
        />
      ) : null}
    </div>
  )
}
