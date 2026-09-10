import { parseDate } from '@/lib/dates'
import { airlinesWithMin, bestOverall, priceLimits } from './aggregates'
import type { BestPair, MonthSummary } from './types'

/**
 * Lo que dicen los precios de un destino, en prosa.
 *
 * Cada frase sale de los pares vigentes (rango, meses, directos, duración,
 * estadía): nada de texto de relleno, porque el que llega de Google tiene que
 * encontrar en palabras la misma respuesta que la tabla le da en números.
 *
 * Está acá y no en el componente porque los casos raros (un solo par, todos
 * los meses empatados, ninguna observación con duración) sólo se pueden probar
 * con tests, y una frase mal conjugada —"Entre las única combinación…"— en una
 * página indexada se paga caro.
 */

type MesConPrecio = MonthSummary & { minPrice: number }

/** Las 3 primeras aerolíneas (ya vienen ordenadas por precio) alcanzan para una frase. */
const AEROLINEAS_EN_LA_FRASE = 3

/** 'US$ 1.234' (sin decimales: son precios de vidriera, igual que en la grilla). */
function usd(price: number): string {
  return `US$ ${Math.round(price).toLocaleString('es-AR')}`
}

/** 'Aerolíneas Argentinas, LATAM y Copa'. */
function listaEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/** '2026-12-02' → '02/12/2026'. */
function fechaCorta(iso: string): string | null {
  const fecha = parseDate(iso)
  return fecha ? fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
}

function noches(n: number): string {
  return n === 1 ? '1 noche' : `${n} noches`
}

/**
 * 555 → '9 h 15 m'. Sin dato (null o ≤ 0) devuelve `null`: la tabla pone '—' y
 * el texto de la ficha directamente se saltea la frase.
 */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null
  const horas = Math.floor(minutes / 60)
  const resto = minutes % 60
  if (horas === 0) return `${resto} m`
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} m`
}

/**
 * Mediana de la duración de ida de los pares.
 *
 * Mediana y no promedio: una sola combinación con dos escalas largas corre el
 * promedio horas enteras y la ficha diría una duración que no vuela nadie. Las
 * observaciones sin duración (Sabre no manda `ElapsedTime`) no cuentan; si no
 * queda ninguna, `null` y no se dice nada.
 */
export function medianDurationMin(pairs: BestPair[]): number | null {
  const valores = pairs
    .map(pair => pair.durationOutMin)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b)
  if (valores.length === 0) return null
  const medio = Math.floor(valores.length / 2)
  return valores.length % 2 === 1 ? valores[medio] : Math.round((valores[medio - 1] + valores[medio]) / 2)
}

/** La primera frase: cuántas combinaciones hay y en qué rango de precios. */
function fraseRango(input: {
  pairs: number
  limits: { min: number; max: number }
  destinationName: string
  originName: string
}): string {
  const { destinationName: destino, originName: origen, limits } = input
  if (input.pairs === 1) {
    return `La única combinación de fechas que sondeamos para volar a ${destino} desde ${origen} cuesta ${usd(
      limits.min
    )} por persona, ida y vuelta.`
  }
  if (limits.min === limits.max) {
    return `Entre las ${input.pairs} combinaciones de fechas que sondeamos, todos los pasajes a ${destino} desde ${origen} cuestan ${usd(
      limits.min
    )} por persona, ida y vuelta.`
  }
  return `Entre las ${input.pairs} combinaciones de fechas que sondeamos, los pasajes a ${destino} desde ${origen} van de ${usd(
    limits.min
  )} a ${usd(limits.max)} por persona, ida y vuelta.`
}

/** La frase de los meses; `null` si no hay nada honesto que decir. */
function fraseMeses(meses: MesConPrecio[]): string | null {
  if (meses.length === 0) return null
  const barato = meses.reduce((mejor, m) => (m.minPrice < mejor.minPrice ? m : mejor))
  const caro = meses.reduce((peor, m) => (m.minPrice > peor.minPrice ? m : peor))

  if (meses.length === 1) {
    return `Por ahora el único mes con precio confirmado es ${barato.label}, desde ${usd(barato.minPrice)}.`
  }
  // Varios meses empatados en el mínimo: no hay "más barato" ni "más caro".
  if (barato.minPrice === caro.minPrice) {
    return `Los ${meses.length} meses con precio confirmado arrancan todos en ${usd(barato.minPrice)}.`
  }
  return `El mes más barato para volar es ${barato.label}, desde ${usd(barato.minPrice)}; el más caro es ${caro.label}, donde la tarifa más baja arranca en ${usd(
    caro.minPrice
  )}.`
}

/**
 * La última frase: la estadía y la salida de la combinación más barata.
 *
 * Con un solo par el precio ya lo dijo la primera frase, así que acá no se
 * repite: quedan las fechas, que es lo único nuevo.
 */
function fraseEstadia(mejor: BestPair, pairs: number): string {
  const salida = fechaCorta(mejor.depart)
  if (pairs === 1) {
    return salida ? `Sale el ${salida} y son ${noches(mejor.nights)}.` : `Son ${noches(mejor.nights)}.`
  }
  return `La combinación más barata de todas es de ${noches(mejor.nights)}${
    salida ? `, saliendo el ${salida}` : ''
  }, a ${usd(mejor.pricePp)} por persona.`
}

/**
 * Las 3 a 5 frases de la sección "Precios de vuelos a X".
 *
 * Sin pares devuelve una lista vacía: el componente no renderiza nada.
 */
export function frasesInsights(input: {
  destinationName: string
  originName: string
  pairs: BestPair[]
  months: MonthSummary[]
}): string[] {
  const limits = priceLimits(input.pairs)
  const overall = bestOverall(input.pairs)
  if (input.pairs.length === 0 || !limits || !overall) return []

  const frases: string[] = [
    fraseRango({
      pairs: input.pairs.length,
      limits,
      destinationName: input.destinationName,
      originName: input.originName,
    }),
  ]

  const meses = fraseMeses(input.months.filter((m): m is MesConPrecio => m.minPrice !== null))
  if (meses) frases.push(meses)

  const directos = input.pairs.filter(pair => pair.stopsOut === 0)
  const masBaratoDirecto = bestOverall(directos)
  if (masBaratoDirecto) {
    const aerolineas = airlinesWithMin(directos).slice(0, AEROLINEAS_EN_LA_FRASE)
    const conQuien = aerolineas.length > 0 ? ` con ${listaEs(aerolineas.map(a => a.airline))}` : ''
    frases.push(
      `Hay vuelos directos desde ${input.originName}${conQuien}, desde ${usd(masBaratoDirecto.pricePp)} por persona.`
    )
  } else {
    frases.push(
      `En las fechas que sondeamos no aparecen vuelos directos desde ${input.originName}: las opciones más baratas hacen al menos una escala.`
    )
  }

  const mediana = formatDuration(medianDurationMin(input.pairs))
  if (mediana) frases.push(`La ida típica dura ${mediana}.`)

  frases.push(fraseEstadia(overall, input.pairs.length))

  return frases
}
