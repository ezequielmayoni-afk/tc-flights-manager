import { airlinesWithMin } from '@/lib/vuelos-baratos/aggregates'
import { frasesInsights } from '@/lib/vuelos-baratos/insights'
import type { BestPair, MonthSummary } from '@/lib/vuelos-baratos/types'
import { formatUsd } from './ui'

/**
 * La sección "Precios de vuelos a X": las frases calculadas y las aerolíneas.
 *
 * Las frases las arma `lib/vuelos-baratos/insights.ts` (puro y con tests);
 * acá sólo se pintan. Sin pares no se renderiza nada: una sección que dice
 * "no hay datos" no le sirve a nadie.
 */
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
  const frases = frasesInsights({ destinationName, originName, pairs, months })
  if (frases.length === 0) return null

  const aerolineas = airlinesWithMin(pairs)

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
