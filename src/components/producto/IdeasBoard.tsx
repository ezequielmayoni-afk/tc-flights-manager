'use client'

import { useCallback, useEffect, useState } from 'react'
import { siviajoPackageSearchUrl } from '@/lib/packages/public-url'

interface ProfileOption { code: string; name: string; family: string; nights_default: number; regimen_required: string | null; stars_min: number; direct_required: boolean; cotizador_instance: string; tc_destination_code: string | null; iata_airport: string | null }

interface Idea {
  id: number; kind: string; source: string; status: string; destination_code: string | null; destination_name: string; origin: string
  month: string | null; departure_date: string | null; chosen_departure_date: string | null; return_date: string | null; date_choice_reason: string | null
  nights: number; adults: number; children: number; children_ages: number[] | null; regimen: string | null; stars_min: number | null; direct_flight: boolean | null; budget_max_pp: number | null
  quoted_price_pp: number | null; quoted_currency: string | null; quote_summary: { chosen?: { hotelName?: string; hotelUrl?: string | null; board?: string; stars?: number; airline?: string; direct?: boolean | null; flightNumbers?: string[]; durationMinutes?: number | null; regimenConfirmed?: boolean; alternatives?: Array<{ date: string; pricePerPax: number; direct: boolean }> }; stopover?: string | null } | null
  validation: { ok: boolean; hard: string[]; soft: string[] }; title_suggested: string | null; tc_package_id: number | null; error: string | null; created_at: string; updated_at: string; notes: string | null
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', probing: 'Sondeando fechas', quoting: 'Cotizando', priced: 'Cotizada', needs_review: 'Revisar', failed: 'Falló',
  approved: 'Aprobada', rejected: 'Rechazada', saving: 'Guardando', saved: 'Guardada en siviajo.com', save_unknown: 'Guardado sin confirmar', verified: 'Verificada', imported: 'Importada',
}
const STATUS_STYLE: Record<string, string> = {
  priced: 'bg-emerald-100 text-emerald-800', needs_review: 'bg-amber-100 text-amber-800', failed: 'bg-red-100 text-red-700', approved: 'bg-blue-100 text-blue-800',
  probing: 'bg-gray-100 text-gray-700', quoting: 'bg-gray-100 text-gray-700', saved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-gray-100 text-gray-500',
}
const REGIMEN_LABEL: Record<string, string> = { all_inclusive: 'All inclusive', media_pension: 'Media pensión', desayuno: 'Desayuno', sin_pension: 'Sin pensión' }

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—'
}
function fmtDate(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'
}

const inputCls = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900'

/** Ideas de paquete: alta con los defaults del perfil, seguimiento y aprobación. */
export function IdeasBoard({ profiles }: { profiles: ProfileOption[] }) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | 'new' | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [form, setForm] = useState({ destinationCode: profiles[0]?.code ?? '', origin: 'BUE', month: '', nights: '', adults: 2, children: 0, regimen: '', starsMin: '', directFlight: '', budgetMaxPp: '', autoStart: true })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/producto/ideas?limit=150')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Error')
      setIdeas(body.ideas ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const active = ideas.some(i => i.status === 'probing' || i.status === 'quoting')
    if (!active) return
    const t = setInterval(() => { void load() }, 15_000)
    return () => clearInterval(t)
  }, [ideas, load])

  const selected = profiles.find(p => p.code === form.destinationCode)

  async function create() {
    setBusy('new')
    setError(null)
    try {
      const res = await fetch('/api/producto/ideas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCode: form.destinationCode, origin: form.origin, month: form.month || null,
          nights: form.nights ? Number(form.nights) : null, adults: Number(form.adults), children: Number(form.children),
          regimen: form.regimen || null, starsMin: form.starsMin ? Number(form.starsMin) : null,
          directFlight: form.directFlight === '' ? null : form.directFlight === 'si', budgetMaxPp: form.budgetMaxPp ? Number(form.budgetMaxPp) : null,
          autoStart: form.autoStart,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo crear')
      if (body.validation && !body.validation.ok) setError(`Idea creada como borrador: ${body.validation.hard.join(' · ')}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  async function act(id: number, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/producto/ideas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const groups: Array<[string, string[]]> = [
    ['En curso', ['probing', 'quoting', 'draft']],
    ['Para decidir', ['priced', 'needs_review', 'failed']],
    ['Aprobadas: guardar en siviajo.com', ['approved', 'saving', 'save_unknown']],
    ['Cerradas', ['saved', 'verified', 'imported', 'rejected']],
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Nueva idea</h2>
          <p className="text-xs text-gray-500">Los valores vacíos toman el perfil del destino: régimen, noches, categoría y si exige vuelo directo. Al crearla se sondean fechas y se cotiza con el precio real de siviajo.com.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-4 lg:grid-cols-6">
          <label className="text-xs text-gray-600 md:col-span-2">Destino
            <select className={`${inputCls} mt-1 w-full`} value={form.destinationCode} onChange={e => setForm({ ...form, destinationCode: e.target.value })}>
              {profiles.map(p => <option key={p.code} value={p.code}>{p.name} · {p.family}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Origen
            <select className={`${inputCls} mt-1 w-full`} value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })}>
              {['BUE', 'COR', 'ROS', 'MDZ', 'TUC', 'SLA'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Mes
            <input type="month" className={`${inputCls} mt-1 w-full`} value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} />
          </label>
          <label className="text-xs text-gray-600">Noches
            <input type="number" min={1} max={30} placeholder={String(selected?.nights_default ?? 7)} className={`${inputCls} mt-1 w-full`} value={form.nights} onChange={e => setForm({ ...form, nights: e.target.value })} />
          </label>
          <label className="text-xs text-gray-600">Adultos / menores
            <div className="mt-1 flex gap-1">
              <input type="number" min={1} max={10} className={`${inputCls} w-full`} value={form.adults} onChange={e => setForm({ ...form, adults: Number(e.target.value) })} />
              <input type="number" min={0} max={6} className={`${inputCls} w-full`} value={form.children} onChange={e => setForm({ ...form, children: Number(e.target.value) })} />
            </div>
          </label>
          <label className="text-xs text-gray-600">Régimen
            <select className={`${inputCls} mt-1 w-full`} value={form.regimen} onChange={e => setForm({ ...form, regimen: e.target.value })}>
              <option value="">{selected?.regimen_required ? `Perfil: ${REGIMEN_LABEL[selected.regimen_required]}` : 'Según perfil'}</option>
              {Object.entries(REGIMEN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Estrellas mín.
            <input type="number" min={1} max={5} placeholder={String(selected?.stars_min ?? 3)} className={`${inputCls} mt-1 w-full`} value={form.starsMin} onChange={e => setForm({ ...form, starsMin: e.target.value })} />
          </label>
          <label className="text-xs text-gray-600">Vuelo directo
            <select className={`${inputCls} mt-1 w-full`} value={form.directFlight} onChange={e => setForm({ ...form, directFlight: e.target.value })}>
              <option value="">{selected?.direct_required ? 'Perfil: obligatorio' : 'Regla directo/escala'}</option>
              <option value="si">Sólo directo</option>
              <option value="no">Puede tener escala</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">Tope USD por pax
            <input type="number" min={0} className={`${inputCls} mt-1 w-full`} value={form.budgetMaxPp} onChange={e => setForm({ ...form, budgetMaxPp: e.target.value })} />
          </label>
          <label className="flex items-end gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={form.autoStart} onChange={e => setForm({ ...form, autoStart: e.target.checked })} /> Cotizar enseguida
          </label>
          <div className="flex items-end">
            <button onClick={create} disabled={busy === 'new' || !form.destinationCode} className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593] disabled:opacity-50">{busy === 'new' ? 'Creando…' : 'Crear idea'}</button>
          </div>
        </div>
        {error && <p className="px-4 pb-3 text-xs text-amber-700">{error}</p>}
      </section>

      {loading ? <p className="text-sm text-gray-500">Cargando…</p> : groups.map(([title, statuses]) => {
        const list = ideas.filter(i => statuses.includes(i.status))
        return (
          <section key={title} className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3"><h2 className="text-sm font-semibold text-gray-900">{title} <span className="text-xs font-normal text-gray-500">({list.length})</span></h2></div>
            {list.length === 0 ? <p className="px-4 py-4 text-sm text-gray-500">Nada por acá.</p> : list.map(i => {
              const q = i.quote_summary?.chosen
              const isOpen = openId === i.id
              return (
                <div key={i.id} className="border-b border-gray-100 px-4 py-3 text-sm last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[i.status] ?? 'bg-gray-100 text-gray-700'}`}>{STATUS_LABEL[i.status] ?? i.status}</span>
                        <span>#{i.id}</span><span>·</span><span>{i.source}</span><span>·</span><span>{fmt(i.updated_at)}</span>
                      </div>
                      <button onClick={() => setOpenId(isOpen ? null : i.id)} className="mt-0.5 text-left font-medium text-gray-900 hover:underline">
                        {i.title_suggested ?? `${i.destination_name} · ${i.nights} noches · ${i.month ?? fmtDate(i.departure_date)}`}
                      </button>
                      <p className="text-xs text-gray-600">
                        {i.origin} → {i.destination_name} · {i.adults} ad{i.children ? ` + ${i.children} men` : ''} · {i.regimen ? REGIMEN_LABEL[i.regimen] ?? i.regimen : 'régimen según perfil'}
                        {i.quoted_price_pp ? <> · <span className="font-semibold text-gray-900">USD {Math.round(i.quoted_price_pp).toLocaleString('es-AR')} por pax</span></> : null}
                        {i.chosen_departure_date ? ` · sale ${fmtDate(i.chosen_departure_date)}` : ''}
                        {q?.hotelName ? ` · ${q.hotelName}${q.stars ? ` ${q.stars}★` : ''}${q.board ? ` (${q.board})` : ''}` : ''}
                        {q?.airline ? ` · ${q.airline}${q.direct === true ? ' directo' : q.direct === false ? ' con escala' : ''}` : ''}
                      </p>
                      {i.validation && (i.validation.hard.length > 0 || i.validation.soft.length > 0) && (
                        <ul className="mt-1 text-xs">
                          {i.validation.hard.map((h, k) => <li key={`h${k}`} className="text-red-600">✕ {h}</li>)}
                          {i.validation.soft.map((s, k) => <li key={`s${k}`} className="text-amber-700">! {s}</li>)}
                        </ul>
                      )}
                      {i.error && <p className="text-xs text-red-600">{i.error}</p>}
                      {i.tc_package_id && <p className="text-xs text-emerald-700">SIV {i.tc_package_id}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {(i.status === 'draft' || i.status === 'failed' || i.status === 'needs_review') && <button onClick={() => act(i.id, 'start')} disabled={busy === i.id} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-100 disabled:opacity-50">Cotizar</button>}
                      {(i.status === 'priced' || i.status === 'needs_review') && <button onClick={() => act(i.id, 'approve')} disabled={busy === i.id} className="rounded-md bg-[#1A237E] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#283593] disabled:opacity-50">Aprobar</button>}
                      {['draft', 'priced', 'needs_review', 'failed', 'approved'].includes(i.status) && <button onClick={() => { const reason = window.prompt('Motivo (opcional)') ?? undefined; void act(i.id, 'reject', { reason }) }} disabled={busy === i.id} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-100 disabled:opacity-50">Rechazar</button>}
                      {i.status === 'approved' && <button onClick={() => { const v = window.prompt('ID del paquete guardado en siviajo.com (SIV)'); if (v && /^\d+$/.test(v)) void act(i.id, 'saved', { tcPackageId: Number(v) }) }} disabled={busy === i.id} className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">Ya la guardé: pegar ID</button>}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-2 grid gap-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700 md:grid-cols-3">
                      <div>
                        <p className="font-semibold text-gray-900">Fecha</p>
                        <p>{i.chosen_departure_date ? `${fmtDate(i.chosen_departure_date)} → ${fmtDate(i.return_date)}` : 'Sin elegir'}</p>
                        <p className="mt-1 text-gray-600">{i.date_choice_reason ?? '—'}</p>
                        {i.quote_summary?.stopover && <p className="mt-1 text-gray-600">{i.quote_summary.stopover}</p>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Cotización</p>
                        {q ? (
                          <ul className="space-y-0.5">
                            <li>{q.hotelName ?? '—'}{q.stars ? ` · ${q.stars}★` : ''}{q.board ? ` · ${q.board}` : ''}{q.regimenConfirmed === false ? ' (régimen sin confirmar)' : ''}</li>
                            <li>{q.airline ?? '—'} {q.flightNumbers?.join(' / ') ?? ''}{q.direct === true ? ' · directo' : q.direct === false ? ' · con escala' : ''}{q.durationMinutes ? ` · ${Math.floor(q.durationMinutes / 60)}h${q.durationMinutes % 60}m` : ''}</li>
                            <li className="font-semibold text-gray-900">USD {i.quoted_price_pp ? Math.round(i.quoted_price_pp).toLocaleString('es-AR') : '—'} por pax</li>
                          </ul>
                        ) : <p>Todavía sin cotizar.</p>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Otras fechas sondeadas</p>
                        {q?.alternatives?.length ? <ul className="space-y-0.5">{q.alternatives.slice(0, 5).map(a => <li key={a.date}>{fmtDate(a.date)} · USD {Math.round(a.pricePerPax)}{a.direct ? ' directo' : ''}</li>)}</ul> : <p>—</p>}
                        {(() => {
                          const prof = profiles.find(p => p.code === i.destination_code)
                          const searchInput = { origin: i.origin, destinationTcCode: prof?.tc_destination_code ?? null, departDate: i.chosen_departure_date ?? i.departure_date, returnDate: i.return_date, adults: i.adults, childrenAges: i.children_ages ?? [] }
                          const url = siviajoPackageSearchUrl(searchInput)
                          const formUrl = siviajoPackageSearchUrl({ ...searchInput, autoSubmit: false })
                          return (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-[#1A237E] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#283593]" title={prof?.tc_destination_code ? 'Abre siviajo.com y dispara esta búsqueda' : 'El perfil no tiene código de destino de TC: el buscador abre con fechas y pasajeros, elegí el destino a mano'}>
                                Abrir búsqueda en siviajo.com
                              </a>
                              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100" title="Abre siviajo.com con el formulario cargado, sin buscar: tocás Buscar vos. Usalo si el otro botón te devuelve al home (pasa con la sesión de agente)">
                                Sólo cargar el formulario
                              </a>
                              {q?.hotelUrl && <a href={q.hotelUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100">Ver hotel cotizado</a>}
                              {!prof?.tc_destination_code && (
                                <span className="self-center text-[11px] text-amber-700">
                                  El perfil {i.destination_code} no tiene código de destino de TC: siviajo.com abre sin destino. <a href="/producto/perfiles" className="underline">Completalo en Perfiles</a>.
                                </span>
                              )}
                            </div>
                          )
                        })()}
                        {i.status === 'approved' && (
                          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">Hasta la Fase 6 se guarda a mano: abrí la búsqueda, armá la idea con estos datos, guardala y pegá el ID acá.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
