'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface RouteFormValues {
  id?: number
  origin_tc_code: string
  origin_name: string
  stay_nights: number[]
  weekdays: number[]
  probes_per_month: number
  /** Pares por mes que estima Sabre (BFM); 0 = ruta sin estimador. */
  scan_per_month: number
  /** De los estimados, cuántos por mes confirma el barrido con una sonda. */
  confirm_per_month: number
  months_ahead: number
  active: boolean
}

/** Orígenes que ya conoce la landing (códigos de ciudad de Travel Compositor). */
const KNOWN_ORIGINS: Array<[string, string]> = [['BUE', 'Buenos Aires'], ['CRD', 'Córdoba'], ['RO6', 'Rosario'], ['MEZ', 'Mendoza'], ['SLT', 'Salta'], ['TUC', 'Tucumán']]
const WEEKDAYS: Array<[number, string]> = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']]
const EMPTY: RouteFormValues = { origin_tc_code: 'BUE', origin_name: 'Buenos Aires', stay_nights: [7, 10, 14], weekdays: [2, 5], probes_per_month: 8, scan_per_month: 8, confirm_per_month: 3, months_ahead: 12, active: false }
const inputCls = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900'

/** Alta y edición de una ruta del barrido (origen × destino). */
export function RouteEditor({ mode, destinationCode, destinationName, initial, onClose }: { mode: 'create' | 'edit'; destinationCode: string; destinationName: string; initial?: RouteFormValues; onClose: () => void }) {
  const router = useRouter()
  const [v, setV] = useState<RouteFormValues>(initial ?? EMPTY)
  const [nightsText, setNightsText] = useState((initial ?? EMPTY).stay_nights.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickOrigin(code: string) {
    const known = KNOWN_ORIGINS.find(([c]) => c === code)
    setV({ ...v, origin_tc_code: code, origin_name: known ? known[1] : v.origin_name })
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const stay_nights = nightsText.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)
      if (stay_nights.length === 0) throw new Error('Estadías: al menos una cantidad de noches')
      const payload = { origin_tc_code: v.origin_tc_code.trim().toUpperCase(), origin_name: v.origin_name.trim(), stay_nights, weekdays: v.weekdays, probes_per_month: v.probes_per_month, scan_per_month: v.scan_per_month, confirm_per_month: v.confirm_per_month, months_ahead: v.months_ahead, active: v.active }
      const res = mode === 'create'
        ? await fetch('/api/vuelos-baratos/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, destination_code: destinationCode }) })
        : await fetch(`/api/vuelos-baratos/routes/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar')
      toast.success(`${payload.origin_tc_code}→${destinationCode}: ${mode === 'create' ? 'ruta creada' : 'guardada'}`)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  // Con el estimador prendido el barrido sondea `confirm_per_month` por mes;
  // apagado (scan 0) se cae a las sondas fijas de siempre.
  const sondasPorNoche = (v.scan_per_month > 0 ? v.confirm_per_month : v.probes_per_month) * v.months_ahead
  const estimacionesPorNoche = v.scan_per_month * v.months_ahead
  const field = (label: string, node: React.ReactNode, span = 1) => <label className={`text-xs text-gray-600 ${span === 2 ? 'sm:col-span-2' : ''}`}>{label}{node}</label>

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? `Nueva ruta a ${destinationName}` : `Editar ruta ${v.origin_tc_code}→${destinationCode}`}</DialogTitle>
          <DialogDescription>Activa, esta ruta suma ~{sondasPorNoche} búsquedas por noche en siviajo.com y ~{estimacionesPorNoche} estimaciones de Sabre.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('Origen (código TC)', (
            <>
              <select className={inputCls} value={KNOWN_ORIGINS.some(([c]) => c === v.origin_tc_code) ? v.origin_tc_code : '__otro'} onChange={e => { if (e.target.value !== '__otro') pickOrigin(e.target.value) }}>
                {KNOWN_ORIGINS.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
                <option value="__otro">Otro…</option>
              </select>
              <input className={`${inputCls} font-mono`} value={v.origin_tc_code} maxLength={10} placeholder="BUE" onChange={e => setV({ ...v, origin_tc_code: e.target.value.toUpperCase() })} />
            </>
          ))}
          {field('Nombre del origen', <input className={inputCls} value={v.origin_name} onChange={e => setV({ ...v, origin_name: e.target.value })} />)}
          {field('Estadías (noches, coma)', <input className={inputCls} value={nightsText} placeholder="7, 10, 14" onChange={e => setNightsText(e.target.value)} />)}
          {field('Días de salida', (
            <div className="mt-1 flex gap-1">
              {WEEKDAYS.map(([d, l]) => (
                <button key={d} type="button" onClick={() => setV({ ...v, weekdays: v.weekdays.includes(d) ? v.weekdays.filter(x => x !== d) : [...v.weekdays, d].sort() })} className={`h-7 w-7 rounded border text-xs ${v.weekdays.includes(d) ? 'border-[#1A237E] bg-[#1A237E] text-white' : 'border-gray-300 bg-white text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          ))}
          {field('Sondas por mes (1–31)', <input type="number" min={1} max={31} className={inputCls} value={v.probes_per_month} onChange={e => setV({ ...v, probes_per_month: Number(e.target.value) })} />)}
          {field('Estimaciones de Sabre por mes (0–62)', <input type="number" min={0} max={62} className={inputCls} value={v.scan_per_month} onChange={e => setV({ ...v, scan_per_month: Number(e.target.value) })} />)}
          {field('Confirmaciones por mes (1–31)', <input type="number" min={1} max={31} className={inputCls} value={v.confirm_per_month} onChange={e => setV({ ...v, confirm_per_month: Number(e.target.value) })} />)}
          {field('Meses hacia adelante (1–18)', <input type="number" min={1} max={18} className={inputCls} value={v.months_ahead} onChange={e => setV({ ...v, months_ahead: Number(e.target.value) })} />)}
          <label className="flex items-center gap-1 text-xs text-gray-700 sm:col-span-2"><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /> Activa (entra en el barrido nocturno)</label>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={save} disabled={busy || !v.origin_tc_code.trim() || !v.origin_name.trim()} className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593] disabled:opacity-50">
            {busy ? 'Guardando…' : mode === 'create' ? 'Crear ruta' : 'Guardar cambios'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
