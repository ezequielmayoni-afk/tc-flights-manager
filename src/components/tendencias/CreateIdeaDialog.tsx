'use client'

import { useEffect, useState } from 'react'

export interface CreateIdeaTarget {
  /** Nombre del destino tal como lo muestra Tendencias. */
  name: string
  slug: string
  /** Alerta de origen, si la hay; se cierra al crear la idea. */
  alertId?: string
  /** Consulta en alza que disparó la alerta ("tamarijn aruba all inclusive"): va como hotel preferido / nota. */
  query?: string
}

interface MatchedProfile { code: string; name: string; family: string; nights_default: number; regimen_required: string | null; stars_min: number; direct_required: boolean; review_pending: boolean; high_season_months: number[] }

const FAMILIES: Array<[string, string]> = [['caribe', 'Caribe'], ['brasil', 'Brasil'], ['usa', 'Estados Unidos'], ['europa', 'Europa'], ['medio_oriente_asia', 'Medio Oriente y Asia'], ['argentina', 'Argentina'], ['sudamerica', 'Sudamérica']]
const REGIMEN: Array<[string, string]> = [['', 'Libre'], ['all_inclusive', 'All inclusive'], ['media_pension', 'Media pensión'], ['desayuno', 'Desayuno'], ['sin_pension', 'Sin pensión']]
const inputCls = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900'

function nextMonths(): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 1; i <= 12; i++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7))
  return out
}

/**
 * De una tendencia a una idea en una ventana: busca el perfil del destino;
 * si no existe, se crea acá mismo con los mínimos y queda pendiente de
 * revisión; la idea se crea con los defaults del perfil y se cotiza sola.
 */
export function CreateIdeaDialog({ target, onClose }: { target: CreateIdeaTarget | null; onClose: () => void }) {
  const [phase, setPhase] = useState<'loading' | 'form' | 'done'>('loading')
  const [profile, setProfile] = useState<MatchedProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ideaId: number; status: string; profileCode: string; createdProfile: boolean } | null>(null)
  const [idea, setIdea] = useState({ month: nextMonths()[2], nights: '', adults: 2, children: 0, regimen: '', starsMin: '', directFlight: '', origin: 'BUE', hotelPreferred: '' })
  const [newProfile, setNewProfile] = useState({ name: '', family: 'caribe', iata: '', tcCode: '', regimen: '', nights: 7, starsMin: 3, direct: false })

  useEffect(() => {
    if (!target) return
    setPhase('loading'); setError(null); setResult(null); setProfile(null)
    setNewProfile(p => ({ ...p, name: target.name }))
    setIdea(i => ({ ...i, hotelPreferred: target.query && /hotel|resort|inclusive|palace|club|riu|iberostar|barcel|bahia|grand/i.test(target.query) && !/^paquete|^vuelo|^viaje/i.test(target.query) ? target.query : '' }))
    fetch(`/api/producto/perfiles?match=${encodeURIComponent(target.slug || target.name)}`)
      .then(r => r.json())
      .then(body => {
        const p = body.profile as MatchedProfile | null
        setProfile(p)
        if (p) {
          const season = p.high_season_months ?? []
          const months = nextMonths()
          const preferred = months.find(m => season.includes(Number(m.slice(5, 7)))) ?? months[2]
          setIdea(i => ({ ...i, month: preferred }))
        }
        setPhase('form')
      })
      .catch(err => { setError(err instanceof Error ? err.message : 'Error'); setPhase('form') })
  }, [target])

  if (!target) return null

  async function submit() {
    setBusy(true); setError(null)
    try {
      let code = profile?.code ?? null
      let createdProfile = false
      if (!code) {
        const res = await fetch('/api/producto/perfiles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newProfile.name, family: newProfile.family, iata_airport: newProfile.iata || null, tc_destination_code: newProfile.tcCode || null, regimen_required: newProfile.regimen || null, nights_default: Number(newProfile.nights) || 7, stars_min: Number(newProfile.starsMin) || 3, direct_required: newProfile.direct, trend_slug: target!.slug, created_from: 'tendencias' }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'No se pudo crear el perfil')
        code = body.profile.code
        createdProfile = true
      }
      const res = await fetch('/api/producto/ideas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCode: code, origin: idea.origin, month: idea.month,
          nights: idea.nights ? Number(idea.nights) : null, adults: Number(idea.adults), children: Number(idea.children),
          regimen: idea.regimen || null, starsMin: idea.starsMin ? Number(idea.starsMin) : null,
          directFlight: idea.directFlight === '' ? null : idea.directFlight === 'si',
          hotelPreferred: idea.hotelPreferred || null,
          source: 'trend', trendAlertId: target!.alertId ?? null,
          notes: `Desde Tendencias: ${target!.name}${target!.query ? ` · búsqueda en alza: "${target!.query}"` : ''}`,
          autoStart: true,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo crear la idea')
      setResult({ ideaId: body.id, status: body.status, profileCode: code!, createdProfile })
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Crear idea: {target.name}</h2>
            <p className="text-xs text-gray-500">{target.query ? `Búsqueda en alza: "${target.query}"` : 'Se cotiza sola con el precio real de siviajo.com según el perfil del destino.'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {phase === 'loading' && <p className="px-4 py-6 text-sm text-gray-500">Buscando el perfil del destino…</p>}

        {phase === 'form' && (
          <div className="space-y-4 p-4">
            {profile ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Perfil: <b>{profile.name}</b> ({profile.code}) · {profile.nights_default} noches · {profile.regimen_required ? profile.regimen_required.replace('_', ' ') : 'régimen libre'} · desde {profile.stars_min}★{profile.direct_required ? ' · directo obligatorio' : ''}{profile.review_pending ? ' · pendiente de revisión' : ''}
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">No hay perfil para este destino. Creá uno acá con lo mínimo; queda marcado como pendiente de revisión en Perfiles.</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <label className="text-xs text-gray-600 md:col-span-2">Nombre<input className={inputCls} value={newProfile.name} onChange={e => setNewProfile({ ...newProfile, name: e.target.value })} /></label>
                  <label className="text-xs text-gray-600">Familia
                    <select className={inputCls} value={newProfile.family} onChange={e => setNewProfile({ ...newProfile, family: e.target.value })}>{FAMILIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </label>
                  <label className="text-xs text-gray-600">Aeropuerto (IATA)<input className={inputCls} placeholder="SJO" maxLength={3} value={newProfile.iata} onChange={e => setNewProfile({ ...newProfile, iata: e.target.value.toUpperCase() })} /></label>
                  <label className="text-xs text-gray-600">Código destino TC<input className={inputCls} placeholder="opcional" value={newProfile.tcCode} onChange={e => setNewProfile({ ...newProfile, tcCode: e.target.value })} /></label>
                  <label className="text-xs text-gray-600">Régimen obligatorio
                    <select className={inputCls} value={newProfile.regimen} onChange={e => setNewProfile({ ...newProfile, regimen: e.target.value })}>{REGIMEN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </label>
                  <label className="text-xs text-gray-600">Noches habituales<input type="number" min={1} max={30} className={inputCls} value={newProfile.nights} onChange={e => setNewProfile({ ...newProfile, nights: Number(e.target.value) })} /></label>
                  <label className="text-xs text-gray-600">Estrellas mínimas<input type="number" min={1} max={5} className={inputCls} value={newProfile.starsMin} onChange={e => setNewProfile({ ...newProfile, starsMin: Number(e.target.value) })} /></label>
                  <label className="flex items-end gap-2 text-xs text-gray-600"><input type="checkbox" checked={newProfile.direct} onChange={e => setNewProfile({ ...newProfile, direct: e.target.checked })} /> Sólo vuelo directo</label>
                </div>
              </div>
            )}

            <div className="grid gap-2 md:grid-cols-4">
              <label className="text-xs text-gray-600">Mes
                <select className={inputCls} value={idea.month} onChange={e => setIdea({ ...idea, month: e.target.value })}>{nextMonths().map(m => <option key={m} value={m}>{m}</option>)}</select>
              </label>
              <label className="text-xs text-gray-600">Origen
                <select className={inputCls} value={idea.origin} onChange={e => setIdea({ ...idea, origin: e.target.value })}>{['BUE', 'COR', 'ROS', 'MDZ', 'TUC', 'SLA'].map(o => <option key={o} value={o}>{o}</option>)}</select>
              </label>
              <label className="text-xs text-gray-600">Noches<input type="number" min={1} max={30} placeholder={String(profile?.nights_default ?? newProfile.nights)} className={inputCls} value={idea.nights} onChange={e => setIdea({ ...idea, nights: e.target.value })} /></label>
              <label className="text-xs text-gray-600">Adultos / menores
                <div className="mt-1 flex gap-1">
                  <input type="number" min={1} max={10} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={idea.adults} onChange={e => setIdea({ ...idea, adults: Number(e.target.value) })} />
                  <input type="number" min={0} max={6} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={idea.children} onChange={e => setIdea({ ...idea, children: Number(e.target.value) })} />
                </div>
              </label>
              <label className="text-xs text-gray-600">Régimen
                <select className={inputCls} value={idea.regimen} onChange={e => setIdea({ ...idea, regimen: e.target.value })}><option value="">Según perfil</option>{REGIMEN.slice(1).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label className="text-xs text-gray-600">Estrellas mín.<input type="number" min={1} max={5} placeholder={String(profile?.stars_min ?? newProfile.starsMin)} className={inputCls} value={idea.starsMin} onChange={e => setIdea({ ...idea, starsMin: e.target.value })} /></label>
              <label className="text-xs text-gray-600">Vuelo directo
                <select className={inputCls} value={idea.directFlight} onChange={e => setIdea({ ...idea, directFlight: e.target.value })}><option value="">Regla directo/escala</option><option value="si">Sólo directo</option><option value="no">Puede tener escala</option></select>
              </label>
              <label className="text-xs text-gray-600">Hotel preferido<input className={inputCls} placeholder="opcional" value={idea.hotelPreferred} onChange={e => setIdea({ ...idea, hotelPreferred: e.target.value })} /></label>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Cancelar</button>
              <button onClick={submit} disabled={busy || (!profile && !newProfile.name.trim())} className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593] disabled:opacity-50">{busy ? 'Creando…' : profile ? 'Crear idea y cotizar' : 'Crear perfil, idea y cotizar'}</button>
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-3 p-4 text-sm">
            <p className="text-gray-900">Idea <b>#{result.ideaId}</b> creada{result.createdProfile ? ` con el perfil ${result.profileCode} (pendiente de revisión)` : ''}. Estado: {result.status === 'quoting' ? 'cotizando' : result.status === 'probing' ? 'sondeando fechas' : result.status}. La cotización tarda alrededor de un minuto.</p>
            <div className="flex justify-end gap-2">
              <a href="/producto/ideas" className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593]">Ver en Ideas</a>
              <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
