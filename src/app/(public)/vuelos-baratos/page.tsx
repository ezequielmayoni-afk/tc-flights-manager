import type { Metadata } from 'next'
import { DestinationCard } from '@/components/vuelos-baratos/DestinationCard'
import { Disclosure } from '@/components/vuelos-baratos/Disclosure'
import { JsonLd } from '@/components/vuelos-baratos/JsonLd'
import { OriginTabs } from '@/components/vuelos-baratos/OriginTabs'
import { PublicHero } from '@/components/vuelos-baratos/PublicHero'
import { SearchBox } from '@/components/vuelos-baratos/SearchBox'
import { OG_BASE } from '@/components/vuelos-baratos/seo'
import { BOTON_PRIMARIO } from '@/components/vuelos-baratos/ui'
import { DEFAULT_ORIGIN, ORIGINS, publicBaseUrl, siviajoBaseUrl } from '@/lib/vuelos-baratos/config'
import { buildHomeMeta } from '@/lib/vuelos-baratos/seo-meta'
import { type SearchParams, loadHome, masBaratos, origenDe } from './_data'

/**
 * Home de vuelos.siviajo.com: el precio más bajo vigente de cada destino
 * activo saliendo de la ciudad elegida.
 *
 * Todo lo que se muestra sale del barrido nocturno (observaciones de las
 * últimas 48 h), nunca de una búsqueda en vivo: la búsqueda real recién pasa
 * cuando el visitante toca "Seleccionar" y se va a siviajo.com.
 */

/** Los que entran en la descripción del resultado de Google sin que se coma el resto. */
const DESTINOS_EN_LA_META = 3

interface PageProps {
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const origen = origenDe(await searchParams)
  const resumen = await loadHome(origen.code)
  const { title, description } = buildHomeMeta({
    originName: origen.name,
    top: masBaratos(resumen, DESTINOS_EN_LA_META),
    now: new Date(),
  })

  return {
    // `absolute`: el layout le pega '| Sí, Viajo' a todo, y el título ya viene
    // medido para los 60 caracteres que muestra Google.
    title: { absolute: title },
    description,
    alternates: { canonical: '/vuelos-baratos' },
    // Una sola versión indexable: las demás ciudades son la misma página filtrada.
    robots: { index: origen.code === DEFAULT_ORIGIN, follow: true },
    // El openGraph de la página pisa al del layout: `locale` y `siteName` van de nuevo.
    // `images` NO se declara: lo llena `opengraph-image.tsx` de este segmento.
    openGraph: { ...OG_BASE, title, description, type: 'website', url: '/vuelos-baratos' },
    // El título, la descripción y la imagen los hereda del openGraph de arriba.
    twitter: { card: 'summary_large_image' },
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
        intro={`Compará ofertas de vuelos ida y vuelta desde ${origen.name} y encontrá los pasajes más baratos a cada destino. Elegí el mes que más te conviene y mirá el precio de cada fecha antes de comprar.`}
        subtitle="Los mejores precios que encontramos en siviajo.com en las últimas 48 horas. Por persona, ida y vuelta, tarifa más baja sin valija despachada."
      >
        <SearchBox originCode={origen.code} siviajoBase={siviajoBaseUrl()} />
      </PublicHero>

      <OriginTabs origins={ORIGINS} active={origen.code} />

      {conDatos.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-[#1A237E]">Destinos más buscados desde {origen.name}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {conDatos.map(destino => (
              <DestinationCard key={`${destino.code}-${destino.originCode}`} summary={destino} originName={origen.name} now={now} />
            ))}
          </div>
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
