import type { TrendBuzz } from '@/lib/tendencias/types'
import { isTravelQuery } from '@/lib/tendencias/travel-terms'

const SEED_LABEL: Record<string, string> = {
  paquetes: 'paquetes', viajes: 'viajes', vuelos: 'vuelos', vacaciones: 'vacaciones', 'all inclusive': 'all inclusive', escapadas: 'escapadas', crucero: 'crucero',
}

function volume(n: number | null): string {
  if (n === null) return ''
  return n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n)
}

/**
 * Qué se busca y de qué se habla esta semana, tal cual lo devuelve Google:
 * sirve para ver lo que el ranking resume y para detectar cosas que no son
 * un destino (Travel Sale, una aerolínea nueva, un crucero).
 */
export function BuzzPanel({ buzz }: { buzz: Partial<TrendBuzz> | null }) {
  const related = buzz?.related ?? []
  const trending = buzz?.trendingNow ?? []
  const youtube = buzz?.youtube ?? []
  const rising = related.flatMap(l => l.rising.map(r => ({ ...r, seed: l.seed }))).filter(r => r.slug || isTravelQuery(r.query)).slice(0, 40)
  const top = related.flatMap(l => l.top.slice(0, 10).map(t => ({ ...t, seed: l.seed }))).filter(t => t.slug || isTravelQuery(t.query))
  const travel = trending.filter(t => t.travel).slice(0, 20)
  const withDestination = trending.filter(t => !t.travel && t.slug).slice(0, 12)

  if (related.length === 0 && trending.length === 0 && youtube.length === 0) {
    return <p className="px-4 py-6 text-sm text-gray-500">Esta corrida no tiene datos de búsqueda guardados. Corré una nueva.</p>
  }

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">En alza en Google · último mes</h3>
        <p className="text-xs text-gray-400">Búsquedas relacionadas con {Object.values(SEED_LABEL).join(', ')} que más crecieron.</p>
        <ul className="mt-2 space-y-1 text-sm text-gray-800">
          {rising.map((r, i) => (
            <li key={`${r.seed}-${i}`} className="flex items-baseline justify-between gap-2">
              <span className={r.slug ? 'font-medium' : ''}>{r.query}</span>
              <span className="shrink-0 text-xs tabular-nums text-emerald-700">{r.value}</span>
            </li>
          ))}
          {rising.length === 0 && <li className="text-gray-500">Sin datos.</li>}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lo más buscado · último mes</h3>
        <p className="text-xs text-gray-400">Volumen relativo dentro de cada término (100 = la más buscada).</p>
        <ul className="mt-2 space-y-1 text-sm text-gray-800">
          {top.slice(0, 40).map((t, i) => (
            <li key={`${t.seed}-${i}`} className="flex items-baseline justify-between gap-2">
              <span className={t.slug ? 'font-medium' : ''}>{t.query} <span className="text-xs text-gray-400">· {t.seed}</span></span>
              <span className="shrink-0 text-xs tabular-nums text-gray-600">{t.value}</span>
            </li>
          ))}
          {top.length === 0 && <li className="text-gray-500">Sin datos.</li>}
        </ul>
      </div>
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">De qué se habla · Argentina, 7 días</h3>
          <p className="text-xs text-gray-400">Tendencias de Google en viajes y transporte, con búsquedas estimadas.</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            {travel.map(t => (
              <li key={t.query} className="flex items-baseline justify-between gap-2">
                <span className={t.slug ? 'font-medium' : ''}>{t.query}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-600">{volume(t.volume)}{t.increasePct ? <span className="text-emerald-700"> +{t.increasePct}%</span> : null}</span>
              </li>
            ))}
            {travel.length === 0 && <li className="text-gray-500">Sin temas de viajes esta semana.</li>}
          </ul>
          {withDestination.length > 0 && (
            <>
              <p className="mt-3 text-xs text-gray-400">Otros temas que nombran un destino:</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {withDestination.map(t => (
                  <li key={t.query} className="flex items-baseline justify-between gap-2">
                    <span>{t.query} <span className="text-xs text-gray-400">· {t.categories[0] ?? ''}</span></span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-600">{volume(t.volume)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">YouTube · qué se mira</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            {youtube.slice(0, 10).map(y => (
              <li key={y.slug} className="flex items-baseline justify-between gap-2">
                <span>{y.name} <span className="text-xs text-gray-400">· {y.sampleQueries[0] ?? ''}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-gray-600">{y.weight}</span>
              </li>
            ))}
            {youtube.length === 0 && <li className="text-gray-500">Sin datos.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
