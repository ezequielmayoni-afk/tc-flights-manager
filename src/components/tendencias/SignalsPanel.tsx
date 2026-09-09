import type { LatestSignals } from '@/lib/tendencias/queries'

interface FxMeta {
  minorista?: { last: number | null; change7dPct: number | null; change30dPct: number | null }
  mayorista?: { last: number | null; change7dPct: number | null; change30dPct: number | null }
  blue?: { last: number | null; brechaPct: number | null }
}

interface FeriadosMeta {
  longWeekends?: Array<{ start: string; end: string; days: number; names: string[]; daysUntil: number }>
}

function money(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function delta(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return ` (${n > 0 ? '+' : ''}${n}%)`
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Señales macro de la última semana con datos: dólar, feriados, Search Console. */
export function SignalsPanel({ signals }: { signals: LatestSignals }) {
  const fx = (signals.fx?.metadata ?? {}) as FxMeta
  const feriados = (signals.feriados?.metadata ?? {}) as FeriadosMeta
  const weekends = (feriados.longWeekends ?? []).slice(0, 5)

  return (
    <div className="grid gap-4 p-4 md:grid-cols-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dólar {signals.fx ? `· ${signals.fx.week_label}` : ''}</h3>
        {signals.fx ? (
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            <li>Minorista {money(fx.minorista?.last)}<span className="text-xs text-gray-500">{delta(fx.minorista?.change7dPct)} 7d{delta(fx.minorista?.change30dPct)} 30d</span></li>
            <li>Mayorista {money(fx.mayorista?.last)}<span className="text-xs text-gray-500">{delta(fx.mayorista?.change7dPct)} 7d</span></li>
            <li>Blue {money(fx.blue?.last)}<span className="text-xs text-gray-500">{fx.blue?.brechaPct !== null && fx.blue?.brechaPct !== undefined ? ` · brecha ${fx.blue.brechaPct}%` : ''}</span></li>
          </ul>
        ) : <p className="mt-2 text-sm text-gray-500">Sin datos todavía.</p>}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fines de semana largos</h3>
        {weekends.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            {weekends.map(w => (
              <li key={w.start}>
                {fmtDate(w.start)} – {fmtDate(w.end)} <span className="text-xs text-gray-500">({w.days} días, en {w.daysUntil} d) · {w.names.join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-gray-500">Sin datos todavía.</p>}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search Console · impresiones 28 d</h3>
        {signals.searchConsole.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            {signals.searchConsole.slice(0, 8).map(s => {
              const meta = s.metadata as { name?: string; clicks?: number }
              return (
                <li key={s.destination_code} className="flex justify-between">
                  <span>{meta.name ?? s.destination_code}</span>
                  <span className="tabular-nums text-gray-600">{Number(s.value ?? 0).toLocaleString('es-AR')} <span className="text-xs text-gray-400">/ {meta.clicks ?? 0} clics</span></span>
                </li>
              )
            })}
          </ul>
        ) : <p className="mt-2 text-sm text-gray-500">Sin datos todavía.</p>}
      </div>
    </div>
  )
}
