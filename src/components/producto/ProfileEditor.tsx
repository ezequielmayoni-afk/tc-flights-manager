'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface ProfileFormValues {
  code: string; name: string; aliases: string[]; family: string; tc_destination_code: string | null; iata_airport: string | null; cotizador_instance: string
  regimen_required: string | null; regimen_allowed: string[]; nights_default: number; nights_allowed: number[]; stars_default: number; stars_min: number
  high_season_months: number[]; booking_window_days: number; stopover_threshold_pct: number | null; stopover_modifiers: Record<string, number>
  airlines_by_origin: Record<string, string[]>; themes_default: string[]; direct_required: boolean; auto_publish: boolean; auto_requote: boolean
  price_tolerance_pct: number; trend_slug: string | null; active: boolean; review_pending?: boolean; notes: string | null
}

const FAMILIES: Array<[string, string]> = [['caribe', 'Caribe'], ['brasil', 'Brasil'], ['usa', 'Estados Unidos'], ['europa', 'Europa'], ['medio_oriente_asia', 'Medio Oriente y Asia'], ['argentina', 'Argentina'], ['sudamerica', 'Sudamérica']]
const REGIMENES: Array<[string, string]> = [['all_inclusive', 'All inclusive'], ['media_pension', 'Media pensión'], ['desayuno', 'Desayuno'], ['sin_pension', 'Sin pensión']]
const inputCls = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900'

export const EMPTY_PROFILE: ProfileFormValues = {
  code: '', name: '', aliases: [], family: 'caribe', tc_destination_code: null, iata_airport: null, cotizador_instance: 'emisivo',
  regimen_required: null, regimen_allowed: [], nights_default: 7, nights_allowed: [6, 7, 8], stars_default: 4, stars_min: 3,
  high_season_months: [], booking_window_days: 90, stopover_threshold_pct: 17, stopover_modifiers: { short_trip: 10, kids: 5, overnight: 12, origin_interior: -7, half_direct: 0.66 },
  airlines_by_origin: {}, themes_default: [], direct_required: false, auto_publish: false, auto_requote: false, price_tolerance_pct: 3, trend_slug: null, active: true, notes: null,
}

const list = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)
const nums = (v: string) => list(v).map(Number).filter(n => Number.isFinite(n))

/** Alta y edición completa de un perfil de destino (todos los campos). */
export function ProfileEditor({ initial, mode, onClose }: { initial: ProfileFormValues; mode: 'create' | 'edit'; onClose: () => void }) {
  const router = useRouter()
  const [v, setV] = useState<ProfileFormValues>(initial)
  const [modifiersText, setModifiersText] = useState(JSON.stringify(initial.stopover_modifiers ?? {}, null, 0))
  const [airlinesText, setAirlinesText] = useState(JSON.stringify(initial.airlines_by_origin ?? {}, null, 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      let stopover_modifiers: Record<string, number>
      let airlines_by_origin: Record<string, string[]>
      try { stopover_modifiers = JSON.parse(modifiersText || '{}') } catch { throw new Error('Moduladores: JSON inválido') }
      try { airlines_by_origin = JSON.parse(airlinesText || '{}') } catch { throw new Error('Aerolíneas por origen: JSON inválido') }
      const payload = { ...v, stopover_modifiers, airlines_by_origin, created_from: 'perfiles' }
      const res = await fetch('/api/producto/perfiles', { method: mode === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, node: React.ReactNode, span = 1) => <label className={`text-xs text-gray-600 ${span === 2 ? 'md:col-span-2' : span === 3 ? 'md:col-span-3' : ''}`}>{label}{node}</label>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">{mode === 'create' ? 'Nuevo perfil de destino' : `Editar perfil ${v.code}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {field('Código', <input className={inputCls} value={v.code} disabled={mode === 'edit'} placeholder="PUJ, ROE, CFE-1… (vacío = del aeropuerto)" onChange={e => setV({ ...v, code: e.target.value.toUpperCase() })} />)}
          {field('Nombre', <input className={inputCls} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />)}
          {field('Familia', <select className={inputCls} value={v.family} onChange={e => setV({ ...v, family: e.target.value })}>{FAMILIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
          {field('Alias (coma)', <input className={inputCls} value={v.aliases.join(', ')} onChange={e => setV({ ...v, aliases: list(e.target.value) })} />, 2)}
          {field('Slug en Tendencias', <input className={inputCls} value={v.trend_slug ?? ''} placeholder="punta-cana" onChange={e => setV({ ...v, trend_slug: e.target.value || null })} />)}
          {field('Código destino TC', <input className={inputCls} value={v.tc_destination_code ?? ''} placeholder="PUJ" onChange={e => setV({ ...v, tc_destination_code: e.target.value || null })} />)}
          {field('Aeropuerto (IATA)', <input className={inputCls} value={v.iata_airport ?? ''} maxLength={3} onChange={e => setV({ ...v, iata_airport: e.target.value.toUpperCase() || null })} />)}
          {field('Cotizador', <select className={inputCls} value={v.cotizador_instance} onChange={e => setV({ ...v, cotizador_instance: e.target.value })}><option value="emisivo">Emisivo (siviajo.com)</option><option value="nacional">Nacional (cabotaje)</option></select>)}
          {field('Régimen obligatorio', <select className={inputCls} value={v.regimen_required ?? ''} onChange={e => setV({ ...v, regimen_required: e.target.value || null })}><option value="">Libre</option>{REGIMENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
          {field('Regímenes permitidos (coma)', <input className={inputCls} value={v.regimen_allowed.join(', ')} placeholder="all_inclusive, desayuno" onChange={e => setV({ ...v, regimen_allowed: list(e.target.value) })} />, 2)}
          {field('Noches por defecto', <input type="number" min={1} max={30} className={inputCls} value={v.nights_default} onChange={e => setV({ ...v, nights_default: Number(e.target.value) })} />)}
          {field('Noches habituales (coma)', <input className={inputCls} value={v.nights_allowed.join(', ')} onChange={e => setV({ ...v, nights_allowed: nums(e.target.value) })} />)}
          {field('Meses de temporada alta (1-12, coma)', <input className={inputCls} value={v.high_season_months.join(', ')} onChange={e => setV({ ...v, high_season_months: nums(e.target.value) })} />)}
          {field('Estrellas por defecto', <input type="number" min={1} max={5} className={inputCls} value={v.stars_default} onChange={e => setV({ ...v, stars_default: Number(e.target.value) })} />)}
          {field('Estrellas mínimas', <input type="number" min={1} max={5} className={inputCls} value={v.stars_min} onChange={e => setV({ ...v, stars_min: Number(e.target.value) })} />)}
          {field('Ventana de compra (días)', <input type="number" min={0} className={inputCls} value={v.booking_window_days} onChange={e => setV({ ...v, booking_window_days: Number(e.target.value) })} />)}
          {field('Umbral escala % (vacío = manda el precio)', <input type="number" min={0} max={100} className={inputCls} value={v.stopover_threshold_pct ?? ''} onChange={e => setV({ ...v, stopover_threshold_pct: e.target.value === '' ? null : Number(e.target.value) })} />)}
          {field('Tolerancia de precio % (recotización)', <input type="number" min={0} className={inputCls} value={v.price_tolerance_pct} onChange={e => setV({ ...v, price_tolerance_pct: Number(e.target.value) })} />)}
          {field('Temáticas por defecto (coma)', <input className={inputCls} value={v.themes_default.join(', ')} onChange={e => setV({ ...v, themes_default: list(e.target.value) })} />)}
          {field('Moduladores del umbral (JSON)', <textarea className={`${inputCls} font-mono text-xs`} rows={2} value={modifiersText} onChange={e => setModifiersText(e.target.value)} />, 2)}
          {field('Aerolíneas por origen (JSON)', <textarea className={`${inputCls} font-mono text-xs`} rows={2} value={airlinesText} placeholder='{"EZE": ["AR","CM"]}' onChange={e => setAirlinesText(e.target.value)} />)}
          {field('Notas', <textarea className={inputCls} rows={2} value={v.notes ?? ''} onChange={e => setV({ ...v, notes: e.target.value || null })} />, 3)}
          <div className="flex flex-wrap gap-4 text-xs text-gray-700 md:col-span-3">
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.direct_required} onChange={e => setV({ ...v, direct_required: e.target.checked })} /> Directo obligatorio</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.auto_publish} onChange={e => setV({ ...v, auto_publish: e.target.checked })} /> Publicar ideas sin aprobación (Fase 6)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.auto_requote} onChange={e => setV({ ...v, auto_requote: e.target.checked })} /> Recotizar solo (Fase 10)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /> Activo</label>
            {mode === 'edit' && <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(v.review_pending)} onChange={e => setV({ ...v, review_pending: e.target.checked })} /> Pendiente de revisión</label>}
          </div>
        </div>
        {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button onClick={save} disabled={busy || !v.name.trim()} className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593] disabled:opacity-50">{busy ? 'Guardando…' : mode === 'create' ? 'Crear perfil' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}
