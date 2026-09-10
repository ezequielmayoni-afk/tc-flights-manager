'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Profile {
  code: string; name: string; family: string; cotizador_instance: string; tc_destination_code: string | null; iata_airport: string | null
  regimen_required: string | null; nights_default: number; nights_allowed: number[]; stars_min: number; high_season_months: number[]
  booking_window_days: number; stopover_threshold_pct: number | null; direct_required: boolean; active: boolean; notes: string | null; trend_slug: string | null; review_pending?: boolean
}

const FAMILY_LABEL: Record<string, string> = { caribe: 'Caribe', brasil: 'Brasil', usa: 'Estados Unidos', europa: 'Europa', medio_oriente_asia: 'Medio Oriente y Asia', argentina: 'Argentina', sudamerica: 'Sudamérica' }
const REGIMEN_LABEL: Record<string, string> = { all_inclusive: 'All inclusive', media_pension: 'Media pensión', desayuno: 'Desayuno', sin_pension: 'Sin pensión' }
const inputCls = 'rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-900'

/** Usos y costumbres por destino, editables en línea. Cada cambio se guarda al salir del campo. */
export function ProfilesTable({ profiles }: { profiles: Profile[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  async function save(code: string, patch: Record<string, unknown>) {
    setSaving(code)
    setError(null)
    try {
      const res = await fetch('/api/producto/perfiles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...patch }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  const parseList = (v: string) => v.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)
  const families = [...new Set(profiles.map(p => p.family))]

  return (
    <div>
      {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Destino</th>
              <th className="px-3 py-2">Código TC / aeropuerto</th>
              <th className="px-3 py-2">Régimen obligatorio</th>
              <th className="px-3 py-2">Noches (default · habituales)</th>
              <th className="px-3 py-2">Estrellas mín.</th>
              <th className="px-3 py-2" title="Meses de temporada alta">Temporada alta</th>
              <th className="px-3 py-2" title="Días de anticipación habituales de compra">Ventana</th>
              <th className="px-3 py-2" title="Ahorro mínimo para aceptar escala en vez de directo. Vacío = manda el precio">Umbral escala %</th>
              <th className="px-3 py-2">Directo obligatorio</th>
              <th className="px-3 py-2">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {families.map(family => (
              <FamilyRows key={family} family={family} profiles={profiles.filter(p => p.family === family)} save={save} saving={saving} parseList={parseList} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FamilyRows({ family, profiles, save, saving, parseList }: { family: string; profiles: Profile[]; save: (code: string, patch: Record<string, unknown>) => Promise<void>; saving: string | null; parseList: (v: string) => number[] }) {
  return (
    <>
      <tr className="bg-gray-50/60"><td colSpan={10} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{FAMILY_LABEL[family] ?? family}</td></tr>
      {profiles.map(p => (
        <tr key={p.code} className={`align-top ${saving === p.code ? 'opacity-60' : ''} ${!p.active ? 'text-gray-400' : ''}`}>
          <td className="px-3 py-2">
            <div className="font-medium text-gray-900">{p.name} <span className="font-normal text-gray-400">{p.code}</span>{p.review_pending && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">pendiente de revisión</span>}</div>
            {p.review_pending && <button onClick={() => save(p.code, { review_pending: false })} className="mt-1 text-[11px] text-emerald-700 hover:underline">Marcar como revisado</button>}
            <div className="text-[11px] text-gray-500">{p.cotizador_instance === 'nacional' ? 'cotizador nacional' : ''}{p.notes ? ` ${p.notes}` : ''}</div>
          </td>
          <td className="px-3 py-2 text-gray-600">{p.tc_destination_code ?? '—'} / {p.iata_airport ?? '—'}</td>
          <td className="px-3 py-2">
            <select className={inputCls} defaultValue={p.regimen_required ?? ''} onChange={e => save(p.code, { regimen_required: e.target.value || null })}>
              <option value="">Libre</option>
              {Object.entries(REGIMEN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </td>
          <td className="px-3 py-2">
            <input type="number" min={1} max={30} className={`${inputCls} w-12`} defaultValue={p.nights_default} onBlur={e => Number(e.target.value) !== p.nights_default && save(p.code, { nights_default: Number(e.target.value) })} />
            <span className="mx-1 text-gray-400">·</span>
            <input className={`${inputCls} w-24`} defaultValue={p.nights_allowed.join(', ')} onBlur={e => save(p.code, { nights_allowed: parseList(e.target.value) })} />
          </td>
          <td className="px-3 py-2"><input type="number" min={1} max={5} className={`${inputCls} w-12`} defaultValue={p.stars_min} onBlur={e => Number(e.target.value) !== p.stars_min && save(p.code, { stars_min: Number(e.target.value) })} /></td>
          <td className="px-3 py-2"><input className={`${inputCls} w-24`} defaultValue={p.high_season_months.join(', ')} onBlur={e => save(p.code, { high_season_months: parseList(e.target.value) })} /></td>
          <td className="px-3 py-2"><input type="number" min={0} className={`${inputCls} w-14`} defaultValue={p.booking_window_days} onBlur={e => Number(e.target.value) !== p.booking_window_days && save(p.code, { booking_window_days: Number(e.target.value) })} /></td>
          <td className="px-3 py-2"><input type="number" min={0} max={100} className={`${inputCls} w-14`} defaultValue={p.stopover_threshold_pct ?? ''} onBlur={e => save(p.code, { stopover_threshold_pct: e.target.value === '' ? null : Number(e.target.value) })} /></td>
          <td className="px-3 py-2"><input type="checkbox" defaultChecked={p.direct_required} onChange={e => save(p.code, { direct_required: e.target.checked })} /></td>
          <td className="px-3 py-2"><input type="checkbox" defaultChecked={p.active} onChange={e => save(p.code, { active: e.target.checked })} /></td>
        </tr>
      ))}
    </>
  )
}
