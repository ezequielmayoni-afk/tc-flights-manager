/**
 * Títulos y descripciones de vuelos.siviajo.com.
 *
 * Google recorta el título alrededor de los 60 caracteres y la descripción
 * alrededor de los 160: acá se arman ya cortados, así lo que se ve en el
 * resultado de búsqueda es lo que decidimos nosotros y no lo que sobró.
 *
 * Todo puro (entra el dato ya agregado, sale texto): las páginas leen la base,
 * agregan con `aggregates.ts` y llaman a estas funciones desde
 * `generateMetadata`.
 */

export const TITLE_MAX = 60
export const DESC_MAX = 160

/** El año que va en los títulos ("Pasajes 2026"), en UTC como todo el módulo de fechas. */
export function seoYear(now: Date): number {
  return now.getUTCFullYear()
}

/**
 * Recorta `text` a `max` caracteres cortando en el último espacio entero.
 *
 * El puntito ('…', un solo carácter) se agrega SÓLO si hubo corte, y la
 * puntuación que queda colgando se va con él: "Miami, Madrid…" y no
 * "Miami, Madrid,…".
 */
export function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  const limpio = text.trim()
  if (limpio.length <= max) return limpio

  // Un carácter menos: el '…' también ocupa lugar.
  const corte = limpio.slice(0, max - 1)
  const espacio = corte.lastIndexOf(' ')
  const base = espacio > 0 ? corte.slice(0, espacio) : corte
  return `${base.replace(/[\s.,;:·-]+$/, '')}…`
}

/** 'US$ 1.234' (sin decimales: son precios de vidriera, igual que en la grilla). */
function usd(price: number): string {
  return `US$ ${Math.round(price).toLocaleString('es-AR')}`
}

/** 'Miami desde US$ 665, Madrid desde US$ 904 y Río desde US$ 304'. */
function listaEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/** Un texto de la ficha (`seo_title`, `seo_description`) sólo pisa al calculado si tiene algo. */
function cargado(value: string | null | undefined): string | null {
  const limpio = value?.trim()
  return limpio ? limpio : null
}

export function buildHomeMeta(input: {
  originName: string
  top: Array<{ name: string; minPrice: number }>
  now: Date
}): { title: string; description: string } {
  const sinAno = `Vuelos baratos desde ${input.originName}`
  const conAno = `${sinAno} · Pasajes ${seoYear(input.now)}`
  const title = conAno.length <= TITLE_MAX ? conAno : truncate(sinAno, TITLE_MAX)

  const description =
    input.top.length > 0
      ? truncate(
          `Ofertas de pasajes ida y vuelta desde ${input.originName}: ${listaEs(
            input.top.map(d => `${d.name} desde ${usd(d.minPrice)}`)
          )}. Precios por persona encontrados hoy en siviajo.com. Compará por mes y fecha y comprá online.`,
          DESC_MAX
        )
      : truncate(
          `Los vuelos más baratos saliendo de ${input.originName}, por persona e ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.`,
          DESC_MAX
        )

  return { title, description }
}

export function buildDestinationMeta(input: {
  name: string
  originName: string
  minPrice: number | null
  cheapestMonth: { label: string; minPrice: number } | null
  pairs: number
  directAvailable: boolean
  now: Date
  seoTitle?: string | null
  seoDescription?: string | null
}): { title: string; description: string } {
  const sinAno =
    input.minPrice === null
      ? `Vuelos baratos a ${input.name}`
      : `Vuelos baratos a ${input.name} desde ${usd(input.minPrice)}`
  const conAno = `${sinAno} · Pasajes ${seoYear(input.now)}`
  const calculado = conAno.length <= TITLE_MAX ? conAno : truncate(sinAno, TITLE_MAX)
  // Lo de la ficha manda, pero el largo lo seguimos garantizando nosotros.
  const title = truncate(cargado(input.seoTitle) ?? calculado, TITLE_MAX)

  const description = truncate(cargado(input.seoDescription) ?? descripcionCalculada(input), DESC_MAX)

  return { title, description }
}

function descripcionCalculada(input: {
  name: string
  originName: string
  minPrice: number | null
  cheapestMonth: { label: string; minPrice: number } | null
  pairs: number
  directAvailable: boolean
}): string {
  if (input.minPrice === null) {
    return `Vuelos a ${input.name} desde ${input.originName}: precios por persona, ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.`
  }

  const mes = input.cheapestMonth ? ` El mes más barato es ${input.cheapestMonth.label} desde ${usd(input.cheapestMonth.minPrice)}.` : ''
  const directos = input.directAvailable ? ' Hay vuelos directos.' : ''
  const fechas = `${input.pairs} ${input.pairs === 1 ? 'fecha' : 'fechas'}`

  return `Pasajes a ${input.name} ida y vuelta desde ${input.originName} desde ${usd(
    input.minPrice
  )} por persona.${mes}${directos} Compará ${fechas} y comprá en siviajo.com.`
}
