'use client'

import { Fragment, useMemo, useState } from 'react'
import type { TrendDestinationRow } from '@/lib/tendencias/queries'

const CLASS_LABEL: Record<string, { label: string; className: string }> = {
  opportunity: { label: 'Oportunidad', className: 'bg-emerald-100 text-emerald-800' },
  gap: { label: 'Hueco', className: 'bg-amber-100 text-amber-800' },
  saturated: { label: 'Saturado', className: 'bg-gray-100 text-gray-700' },
  declining: { label: 'En baja', className: 'bg-gray-100 text-gray-500' },
}

const MOMENTUM_LABEL: Record<string, { label: string; className: string }> = {
  surging: { label: 'Explota', className: 'text-emerald-700 font-semibold' },
  rising: { label: 'Sube', className: 'text-emerald-700' },
  stable: { label: 'Estable', className: 'text-gray-600' },
  falling: { label: 'Cae', className: 'text-red-600' },
  new: { label: 'Nuevo', className: 'text-gray-500' },
}

const REGION_LABEL: Record<string, string> = {
  caribe: 'Caribe', europa: 'Europa', eeuu: 'EE.UU.', brasil: 'Brasil', sudamerica: 'Sudamérica',
  argentina: 'Argentina', ski: 'Ski', exotico: 'Exótico', descubierto: 'Descubierto',
}

type SortKey = 'rank' | 'change' | 'packages'

const SOURCE_LABEL: Record<string, string> = {
  google_trends: 'Google Trends',
  google_related: 'Búsquedas relacionadas',
  autocomplete: 'Autocomplete Google',
  youtube: 'YouTube',
  trending_now: 'Tendencias ahora',
}

/** Las búsquedas concretas que sostienen el score de un destino, por fuente. */
function Evidence({ d }: { d: TrendDestinationRow }) {
  const raw = d.raw_signals ?? {}
  const ac = raw.autocomplete as { sampleQueries?: string[]; mentions?: number; weight?: number } | undefined
  const yt = raw.youtube as { sampleQueries?: string[]; mentions?: number } | undefined
  const rel = raw.google_related as { queries?: Array<{ query: string; value: string; seed: string }> } | undefined
  const gt = raw.google_trends as { templates?: Record<string, { score: number; rawBatchScore: number; batch: number; anchor: string | null } | null>; relatedQueries?: Array<{ query: string; value: string }> } | undefined
  const now = raw.trending_now as { queries?: string[]; volume?: number } | undefined
  const templates = gt?.templates ? Object.entries(gt.templates) : []
  return (
    <div className="grid gap-3 bg-gray-50 px-6 py-3 text-xs text-gray-700 md:grid-cols-2 lg:grid-cols-3">
      <div>
        <p className="font-semibold text-gray-900">{SOURCE_LABEL.google_trends} · {d.signals.google_trends ?? 0}</p>
        {templates.length ? (
          <ul className="mt-1 space-y-0.5">
            {templates.map(([name, t]) => (
              <li key={name}>“{name} {d.destination}”: {t ? `${t.score} (grupo ${t.batch}, ancla ${t.anchor ?? '—'})` : 'sin dato'}</li>
            ))}
            {gt?.relatedQueries?.length ? <li className="text-gray-500">En alza: {gt.relatedQueries.slice(0, 4).map(q => `${q.query} ${q.value}`).join(' · ')}</li> : null}
          </ul>
        ) : <p className="text-gray-400">No se comparó en esta corrida.</p>}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{SOURCE_LABEL.google_related} · {d.signals.google_related ?? 0}</p>
        {rel?.queries?.length ? (
          <ul className="mt-1 space-y-0.5">{rel.queries.map((q, i) => <li key={i}>{q.query} <span className="text-gray-500">{q.value} · {q.seed}</span></li>)}</ul>
        ) : <p className="text-gray-400">No aparece en las relacionadas.</p>}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{SOURCE_LABEL.autocomplete} · {d.signals.autocomplete ?? 0}</p>
        {ac?.sampleQueries?.length ? (
          <ul className="mt-1 space-y-0.5">{ac.sampleQueries.map((q, i) => <li key={i}>{q}</li>)}<li className="text-gray-500">{ac.mentions} sugerencias, peso {ac.weight}</li></ul>
        ) : <p className="text-gray-400">Google no lo completa.</p>}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{SOURCE_LABEL.youtube} · {d.signals.youtube ?? 0}</p>
        {yt?.sampleQueries?.length ? (
          <ul className="mt-1 space-y-0.5">{yt.sampleQueries.map((q, i) => <li key={i}>{q}</li>)}</ul>
        ) : <p className="text-gray-400">YouTube no lo completa.</p>}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{SOURCE_LABEL.trending_now} · {d.signals.trending_now ?? 0}</p>
        {now?.queries?.length ? (
          <ul className="mt-1 space-y-0.5">{now.queries.map((q, i) => <li key={i}>{q}</li>)}</ul>
        ) : <p className="text-gray-400">No está en tendencias ahora.</p>}
      </div>
    </div>
  )
}

/** Tabla de destinos de una corrida con filtros por clasificación, región y catálogo. */
export function TrendsTable({ destinations }: { destinations: TrendDestinationRow[] }) {
  const [classification, setClassification] = useState<string>('')
  const [region, setRegion] = useState<string>('')
  const [onlyWithPackages, setOnlyWithPackages] = useState(false)
  const [sort, setSort] = useState<SortKey>('rank')
  const [open, setOpen] = useState<string | null>(null)

  const regions = useMemo(() => [...new Set(destinations.map(d => d.region))].sort(), [destinations])

  const rows = useMemo(() => {
    const filtered = destinations.filter(d =>
      (!classification || d.classification === classification) &&
      (!region || d.region === region) &&
      (!onlyWithPackages || d.has_packages)
    )
    const sorted = [...filtered]
    if (sort === 'change') sorted.sort((a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity))
    else if (sort === 'packages') sorted.sort((a, b) => b.matching_package_count - a.matching_package_count || a.rank - b.rank)
    else sorted.sort((a, b) => a.rank - b.rank)
    return sorted
  }, [destinations, classification, region, onlyWithPackages, sort])

  const select = 'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-2 text-xs text-gray-600">
        <label className="flex items-center gap-1">Clasificación
          <select className={select} value={classification} onChange={e => setClassification(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Región
          <select className={select} value={region} onChange={e => setRegion(e.target.value)}>
            <option value="">Todas</option>
            {regions.map(r => <option key={r} value={r}>{REGION_LABEL[r] ?? r}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyWithPackages} onChange={e => setOnlyWithPackages(e.target.checked)} />
          Sólo con paquetes
        </label>
        <label className="flex items-center gap-1">Orden
          <select className={select} value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="rank">Score</option>
            <option value="change">Variación</option>
            <option value="packages">Paquetes</option>
          </select>
        </label>
        <span className="ml-auto">{rows.length} de {destinations.length} · clic en un destino para ver sus búsquedas</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">Ningún destino con esos filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Región</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Momentum</th>
                <th className="px-3 py-2 text-right" title="Google Trends: comparación directa con 'paquetes X', 'viaje X' y 'vuelos X' (45 %)">Trends</th>
                <th className="px-3 py-2 text-right" title="Volumen relativo en las búsquedas relacionadas de 'paquetes', 'viajes', 'vuelos'… (20 %)">Relac.</th>
                <th className="px-3 py-2 text-right" title="Qué completa Google Argentina (20 %)">Autoc.</th>
                <th className="px-3 py-2 text-right" title="Qué completa YouTube (10 %)">YouTube</th>
                <th className="px-3 py-2 text-right" title="Aparece en 'tendencias ahora' de Argentina (5 %)">Ahora</th>
                <th className="px-3 py-2">Clasificación</th>
                <th className="px-3 py-2 text-right">Paquetes</th>
                <th className="px-3 py-2 text-right">Desde</th>
                <th className="px-3 py-2">Qué buscan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(d => {
                const cls = CLASS_LABEL[d.classification] ?? CLASS_LABEL.declining
                const mom = MOMENTUM_LABEL[d.momentum] ?? MOMENTUM_LABEL.new
                const buy = d.related_queries.filter(q => q.intent === 'buy').slice(0, 3)
                const isOpen = open === d.id
                return (
                  <Fragment key={d.id}>
                  <tr className={`align-top ${isOpen ? 'bg-gray-50' : ''}`}>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{d.rank}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <button type="button" onClick={() => setOpen(isOpen ? null : d.id)} className="text-left hover:underline">{d.destination}</button>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{REGION_LABEL[d.region] ?? d.region}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{d.trend_score}</td>
                    <td className={`px-3 py-2 ${mom.className}`}>
                      {mom.label}{d.change_pct !== null && <span className="ml-1 text-xs tabular-nums">({d.change_pct > 0 ? '+' : ''}{d.change_pct}%)</span>}
                    </td>
                    {(['google_trends', 'google_related', 'autocomplete', 'youtube', 'trending_now'] as const).map(source => (
                      <td key={source} className={`px-3 py-2 text-right tabular-nums ${d.signals[source] ? 'text-gray-700' : 'text-gray-300'}`}>{d.signals[source] ?? 0}</td>
                    ))}
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls.className}`}>{cls.label}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{d.matching_package_count || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{d.cheapest_package_price ? `USD ${Math.round(d.cheapest_package_price).toLocaleString('es-AR')}` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{buy.map(q => q.query).join(' · ') || '—'}</td>
                  </tr>
                  {isOpen && <tr><td colSpan={13} className="p-0"><Evidence d={d} /></td></tr>}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
