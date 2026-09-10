/**
 * Títulos y descripciones de vuelos.siviajo.com.
 *
 * Google recorta el título alrededor de los 60 caracteres y la descripción
 * alrededor de los 160. Los títulos se arman para entrar con la marca puesta
 * (el layout le pega ' | Sí, Viajo' a todos) y las descripciones se arman
 * **por frases**: primero la obligatoria de apertura y la del cierre —el
 * llamado a la acción, que nunca se puede perder— y después las opcionales que
 * entren enteras. Nada de dejar una frase cortada a la mitad en el resultado
 * de búsqueda.
 *
 * Todo puro (entra el dato ya agregado, sale texto): las páginas leen la base,
 * agregan con `aggregates.ts` y llaman a estas funciones desde
 * `generateMetadata`.
 */

export const TITLE_MAX = 60
export const DESC_MAX = 160

/**
 * Lo que el template del layout le agrega a cada título.
 *
 * Está escrito dos veces a propósito: el template vive en
 * `src/app/(public)/layout.tsx` (`'%s | Sí, Viajo'`) y acá se necesita el largo
 * para medir. Si cambia allá, cambia acá.
 */
export const TITLE_BRAND = ' | Sí, Viajo'

/** Lo que le queda al título de la página una vez descontada la marca. */
export const TITLE_BUDGET = TITLE_MAX - TITLE_BRAND.length

/** Los que entran en la descripción de la home sin comerse el llamado a la acción. */
const DESTINOS_MAX = 3

const CTA_HOME = 'Compará por mes y fecha y comprá en siviajo.com.'
const CTA_DESTINO = 'Elegí tu fecha y comprá en siviajo.com.'
/** El cierre de los textos que todavía no tienen precio que mostrar. */
const CTA_SIN_PRECIO = 'Elegí fecha y comprá en siviajo.com.'

/**
 * Lo que se le deja pasar a un título cargado a mano en la ficha.
 *
 * Más que los 60 del calculado: el que lo escribió sabe lo que quiere decir y
 * Google lo va a cortar solo. El tope existe para que un copy/paste enorme no
 * termine de título.
 */
export const SEO_TITLE_MAX = 70

/**
 * El año que va en los títulos ("Pasajes 2026").
 *
 * Desde noviembre pasa al que viene: el que busca en diciembre está planeando
 * las vacaciones del año nuevo, no las del que se termina.
 */
export function seoYear(now: Date): number {
  const year = now.getUTCFullYear()
  return now.getUTCMonth() >= 10 ? year + 1 : year
}

/**
 * Recorta `text` a `max` caracteres cortando en el último espacio entero.
 *
 * Es el último recurso de las descripciones (con nombres imposibles), no el
 * camino normal: el puntito ('…', un solo carácter) se agrega SÓLO si hubo
 * corte, y la puntuación que queda colgando se va con él.
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

/** El título de la página entra en los 60 de Google recién con la marca puesta. */
function conMarcaEntra(title: string): boolean {
  return title.length + TITLE_BRAND.length <= TITLE_MAX
}

/**
 * Apertura + cierre obligatorios, y en el medio las opcionales que entren.
 *
 * `first` es la frase de apertura y `firstCorta` la misma sin la parte del
 * origen: si con la larga no entra ni el llamado a la acción, se usa la corta
 * antes de pensar en recortar. Las opcionales se prueban en orden y la que no
 * entra se saltea (no corta la lista: una frase más corta más abajo puede
 * entrar igual).
 */
function componerDescripcion(first: string, firstCorta: string, opcionales: string[], cta: string): string {
  const apertura = `${first} ${cta}`.length <= DESC_MAX ? first : firstCorta

  let largo = apertura.length + 1 + cta.length
  const medio: string[] = []
  for (const frase of opcionales) {
    if (largo + 1 + frase.length > DESC_MAX) continue
    medio.push(frase)
    largo += 1 + frase.length
  }

  const texto = [apertura, ...medio, cta].join(' ')
  // Sólo si ni la apertura corta con el cierre entraban: un nombre imposible.
  return texto.length <= DESC_MAX ? texto : truncate(texto, DESC_MAX)
}

/** El `n` más grande (de `max` para abajo) que cumple; 1 si no cumple ninguno. */
function masGrandeQueEntra(max: number, entra: (n: number) => boolean): number {
  for (let n = max; n >= 1; n--) if (entra(n)) return n
  return 1
}

export function buildHomeMeta(input: {
  originName: string
  top: Array<{ name: string; minPrice: number }>
  now: Date
}): { title: string; description: string } {
  const sinAno = `Vuelos baratos desde ${input.originName}`
  const conAno = `${sinAno} · Pasajes ${seoYear(input.now)}`
  const title = conMarcaEntra(conAno) ? conAno : sinAno

  return { title, description: descripcionHome(input) }
}

function descripcionHome(input: { originName: string; top: Array<{ name: string; minPrice: number }> }): string {
  if (input.top.length === 0) {
    return componerDescripcion(
      `Los vuelos más baratos saliendo de ${input.originName}, por persona e ida y vuelta, actualizados todos los días.`,
      'Los vuelos más baratos, por persona e ida y vuelta, actualizados todos los días.',
      [],
      CTA_SIN_PRECIO
    )
  }

  const lista = (n: number): string => listaEs(input.top.slice(0, n).map(d => `${d.name} desde ${usd(d.minPrice)}`))
  const conOrigen = (n: number): string => `Ofertas de pasajes ida y vuelta desde ${input.originName}: ${lista(n)}.`
  const sinOrigen = (n: number): string => `Ofertas de pasajes ida y vuelta: ${lista(n)}.`

  // Cuántos destinos entran enteros: la lista nunca se muestra cortada.
  const cuantos = masGrandeQueEntra(Math.min(DESTINOS_MAX, input.top.length), n => `${conOrigen(n)} ${CTA_HOME}`.length <= DESC_MAX)

  // Sin frases opcionales: lo que varía acá es cuántos destinos entran. La
  // tercera frase del molde original ('Precios por persona encontrados hoy en
  // siviajo.com.') se cayó a propósito — no entra con ningún nombre de ciudad
  // real y, si entrara, dejaría 'siviajo.com' dos veces seguidas junto al
  // llamado a la acción.
  return componerDescripcion(conOrigen(cuantos), sinOrigen(cuantos), [], CTA_HOME)
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
  // Con un nombre larguísimo se pasa igual: mejor un título largo que Google
  // corta, que uno sin el dato que hace que te clickeen (el precio).
  const calculado = conMarcaEntra(conAno) ? conAno : sinAno

  const tituloFicha = cargado(input.seoTitle)
  const descripcionFicha = cargado(input.seoDescription)

  return {
    title: tituloFicha ? truncate(tituloFicha, SEO_TITLE_MAX) : calculado,
    description: descripcionFicha ? truncate(descripcionFicha, DESC_MAX) : descripcionDestino(input),
  }
}

function descripcionDestino(input: {
  name: string
  originName: string
  minPrice: number | null
  cheapestMonth: { label: string; minPrice: number } | null
  pairs: number
  directAvailable: boolean
}): string {
  if (input.minPrice === null) {
    return componerDescripcion(
      `Vuelos a ${input.name} desde ${input.originName}: precios por persona, ida y vuelta, actualizados todos los días.`,
      `Vuelos a ${input.name}: precios por persona, ida y vuelta, actualizados todos los días.`,
      [],
      CTA_SIN_PRECIO
    )
  }

  const precio = usd(input.minPrice)
  const opcionales = [
    input.cheapestMonth ? `El mes más barato es ${input.cheapestMonth.label} desde ${usd(input.cheapestMonth.minPrice)}.` : null,
    input.directAvailable ? 'Hay vuelos directos.' : null,
    input.pairs > 0 ? `Compará ${input.pairs} ${input.pairs === 1 ? 'fecha' : 'fechas'}.` : null,
  ].filter((frase): frase is string => frase !== null)

  return componerDescripcion(
    `Pasajes a ${input.name} ida y vuelta desde ${input.originName} desde ${precio} por persona.`,
    `Pasajes a ${input.name} ida y vuelta desde ${precio} por persona.`,
    opcionales,
    CTA_DESTINO
  )
}
