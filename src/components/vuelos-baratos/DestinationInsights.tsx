import { parseDate } from '@/lib/dates'
import { airlinesWithMin, bestOverall, priceLimits } from '@/lib/vuelos-baratos/aggregates'
import type { BestPair, MonthSummary } from '@/lib/vuelos-baratos/types'
import { formatDuration, formatUsd, medianDurationMin } from './ui'

/**
 * Lo que dicen los precios de un destino, en prosa.
 *
 * Cada frase sale de los pares vigentes (rango, meses, directos, duración,
 * estadía): nada de texto de relleno, porque el que llega de Google tiene que
 * encontrar acá la respuesta que la tabla le da en números. Sin pares no se
 * renderiza: una sección que dice "no hay datos" no le sirve a nadie.
 */

type MesConPrecio = MonthSummary & { minPrice: number }

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

function conPrecio(months: MonthSummary[]): MesConPrecio[] {
  return months.filter((m): m is MesConPrecio => m.minPrice !== null)
}

function noches(n: number): string {
  return n === 1 ? '1 noche' : `${n} noches`
}

/** Las 3 primeras aerolíneas (ya vienen ordenadas por precio) alcanzan para una frase. */
const AEROLINEAS_EN_LA_FRASE = 3

export function DestinationInsights({
  destinationName,
  originName,
  pairs,
  months,
}: {
  destinationName: string
  originName: string
  pairs: BestPair[]
  months: MonthSummary[]
}) {
  const limits = priceLimits(pairs)
  const overall = bestOverall(pairs)
  if (pairs.length === 0 || !limits || !overall) return null

  const aerolineas = airlinesWithMin(pairs)
  const directos = pairs.filter(pair => pair.stopsOut === 0)
  const aerolineasDirectas = airlinesWithMin(directos)
  const mesesConPrecio = conPrecio(months)
  const barato = mesesConPrecio.reduce<MesConPrecio | null>((mejor, m) => (!mejor || m.minPrice < mejor.minPrice ? m : mejor), null)
  const caro = mesesConPrecio.reduce<MesConPrecio | null>((peor, m) => (!peor || m.minPrice > peor.minPrice ? m : peor), null)
  const mediana = formatDuration(medianDurationMin(pairs))
  const salida = fechaCorta(overall.depart)

  const frases: string[] = [
    `Entre las ${pairs.length === 1 ? 'única combinación' : `${pairs.length} combinaciones`} de fechas que sondeamos, los pasajes a ${destinationName} desde ${originName} van de ${formatUsd(
      limits.min
    )} a ${formatUsd(limits.max)} por persona, ida y vuelta.`,
  ]

  if (barato && caro && barato.month !== caro.month) {
    frases.push(
      `El mes más barato para volar es ${barato.label}, desde ${formatUsd(barato.minPrice)}; el más caro es ${caro.label}, donde la tarifa más baja arranca en ${formatUsd(
        caro.minPrice
      )}.`
    )
  } else if (barato) {
    frases.push(`Por ahora el único mes con precio confirmado es ${barato.label}, desde ${formatUsd(barato.minPrice)}.`)
  }

  const primerDirecto = bestOverall(directos)
  if (primerDirecto) {
    const conQuien =
      aerolineasDirectas.length > 0
        ? ` con ${listaEs(aerolineasDirectas.slice(0, AEROLINEAS_EN_LA_FRASE).map(a => a.airline))}`
        : ''
    frases.push(
      `Hay vuelos directos desde ${originName}${conQuien}, desde ${formatUsd(primerDirecto.pricePp)} por persona.`
    )
  } else {
    frases.push(
      `En las fechas que sondeamos no aparecen vuelos directos desde ${originName}: las opciones más baratas hacen al menos una escala.`
    )
  }

  if (mediana) frases.push(`La ida típica dura ${mediana}.`)

  frases.push(
    `La combinación más barata de todas es de ${noches(overall.nights)}${salida ? `, saliendo el ${salida}` : ''}, a ${formatUsd(
      overall.pricePp
    )} por persona.`
  )

  return (
    <>
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[#1A237E]">
          Precios de vuelos a {destinationName} desde {originName}
        </h2>
        <div className="mt-4 max-w-3xl space-y-3">
          {frases.map(frase => (
            <p key={frase} className="text-sm leading-relaxed text-[#495057]">
              {frase}
            </p>
          ))}
        </div>
      </section>

      {aerolineas.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-[#1A237E]">Aerolíneas que vuelan a {destinationName}</h2>
          <ul className="mt-4 max-w-3xl divide-y divide-[#E3E3E3] border-y border-[#E3E3E3]">
            {aerolineas.map(a => (
              <li key={a.airline} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <span className="min-w-0 text-[#393939]">{a.airline}</span>
                <span className="shrink-0 tabular-nums font-semibold text-[#1A237E]">desde {formatUsd(a.minPrice)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
