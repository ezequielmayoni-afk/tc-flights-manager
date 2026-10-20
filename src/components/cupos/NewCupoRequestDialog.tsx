'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Profile = { code: string; name: string; tc_destination_code: string | null; iata_airport: string | null; nights_default: number | null; family: string | null }
const ORIGINS = [{ code: 'BUE', name: 'Buenos Aires' }, { code: 'COR', name: 'Córdoba' }, { code: 'ROS', name: 'Rosario' }, { code: 'MDZ', name: 'Mendoza' }]
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const nextMonths = (n: number) => { const out: string[] = []; const d = new Date(); d.setUTCDate(1); for (let i = 1; i <= n; i++) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)); out.push(x.toISOString().slice(0, 7)) } return out }
const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
const MAX_PROBES = 48
/** Un sondeo del pedido, como lo edita el formulario. */
type Group = { months: string[]; nights: number; count: number; weekdays: number[]; airlinePref: string; directOnly: boolean; seats: string }
const newGroup = (nights = 7, months: string[] = []): Group => ({ months, nights, count: 5, weekdays: [0, 1, 2, 3, 4, 5, 6], airlinePref: '', directOnly: false, seats: '' })

export function NewCupoRequestDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [origin, setOrigin] = useState('BUE')
  const [profileCode, setProfileCode] = useState('')
  const [groups, setGroups] = useState<Group[]>([newGroup()])
  const [seats, setSeats] = useState(10)
  const [adults, setAdults] = useState(2)
  const [notes, setNotes] = useState('')
  const [singleAirline, setSingleAirline] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/producto/perfiles').then(r => r.json()).then(d => setProfiles((d.profiles ?? []).filter((p: Profile) => p.tc_destination_code))).catch(() => null)
  }, [open])
  useEffect(() => { const p = profiles.find(x => x.code === profileCode); if (p?.nights_default) setGroups(gs => gs.length === 1 && !gs[0].months.length ? [{ ...gs[0], nights: p.nights_default! }] : gs) }, [profileCode, profiles])

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const setGroup = (i: number, patch: Partial<Group>) => setGroups(gs => gs.map((g, k) => (k === i ? { ...g, ...patch } : g)))
  const totalProbes = groups.reduce((n, g) => n + (Number(g.count) || 0), 0)

  const submit = async () => {
    const p = profiles.find(x => x.code === profileCode)
    if (!p?.tc_destination_code) { toast.error('Elegí un destino con código de TC'); return }
    if (groups.some(g => g.months.length === 0)) { toast.error('Cada sondeo necesita al menos un mes'); return }
    if (groups.some(g => !g.nights || !g.count)) { toast.error('Cada sondeo necesita noches y cantidad de fechas'); return }
    if (totalProbes > MAX_PROBES) { toast.error(`Entre todos los sondeos, hasta ${MAX_PROBES} fechas`); return }
    setSaving(true)
    try {
      const probeGroups = groups.map(g => ({ months: [...g.months].sort(), nights: Number(g.nights), count: Number(g.count), weekdays: g.weekdays, airlinePref: g.airlinePref.split(',').map(x => x.trim()).filter(Boolean), directOnly: g.directOnly, seats: g.seats ? Number(g.seats) : null }))
      const res = await fetch('/api/cupos/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originCode: origin, originName: ORIGINS.find(o => o.code === origin)?.name, destinationCode: p.tc_destination_code, destinationName: p.name, destinationProfileCode: p.code, probeGroups, singleAirline, seatsRequested: seats, adults, notes: notes || null, probeNow: true }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo crear el pedido'); return }
      toast.success(`Pedido #${data.id} creado: el cotizador arma las tiradas (unos minutos)`)
      onOpenChange(false); onCreated()
      setGroups([newGroup()]); setNotes('')
    } catch { toast.error('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo pedido de cupos</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Origen</Label><select value={origin} onChange={e => setOrigin(e.target.value)} className="h-9 w-full rounded border px-2 text-sm">{ORIGINS.map(o => <option key={o.code} value={o.code}>{o.name} ({o.code})</option>)}</select></div>
            <div className="space-y-1"><Label>Destino (perfil)</Label><select value={profileCode} onChange={e => setProfileCode(e.target.value)} className="h-9 w-full rounded border px-2 text-sm"><option value="">Elegir…</option>{profiles.map(p => <option key={p.code} value={p.code}>{p.name}{p.family ? ` · ${p.family}` : ''}</option>)}</select></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sondeos</Label>
              <span className={`text-[11px] ${totalProbes > MAX_PROBES ? 'text-red-600' : 'text-muted-foreground'}`}>{totalProbes} fecha{totalProbes === 1 ? '' : 's'} en total · máximo {MAX_PROBES} · ~1 min cada una</span>
            </div>
            {groups.map((g, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Sondeo {i + 1}</span>
                  {groups.length > 1 && <button type="button" onClick={() => setGroups(groups.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-red-600" title="Quitar sondeo"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="flex flex-wrap gap-1">{nextMonths(14).map(m => <button key={m} type="button" onClick={() => setGroup(i, { months: toggle(g.months, m) })} className={`px-2 py-0.5 rounded-full text-[11px] border ${g.months.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>{fmtMonth(m)}</button>)}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-0.5"><Label className="text-[11px]">Fechas a sondear</Label><Input type="number" min={1} max={31} value={g.count} onChange={e => setGroup(i, { count: Number(e.target.value) })} className="h-8" /></div>
                  <div className="space-y-0.5"><Label className="text-[11px]">Noches</Label><Input type="number" min={1} max={30} value={g.nights} onChange={e => setGroup(i, { nights: Number(e.target.value) })} className="h-8" /></div>
                  <div className="space-y-0.5"><Label className="text-[11px]">Lugares (si cambia)</Label><Input type="number" min={1} value={g.seats} onChange={e => setGroup(i, { seats: e.target.value })} placeholder={String(seats)} className="h-8" /></div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground mr-1">Días:</span>
                  {WEEKDAYS.map((d, k) => <button key={d} type="button" onClick={() => setGroup(i, { weekdays: toggle(g.weekdays, k) })} className={`w-9 py-0.5 rounded text-[11px] border ${g.weekdays.includes(k) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>{d}</button>)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={g.airlinePref} onChange={e => setGroup(i, { airlinePref: e.target.value })} placeholder="Aerolíneas preferidas (coma)" className="h-8 text-xs" />
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={g.directOnly} onChange={e => setGroup(i, { directOnly: e.target.checked })} />Sólo vuelos directos</label>
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setGroups([...groups, newGroup(groups[groups.length - 1]?.nights ?? 7, groups[groups.length - 1]?.months ?? [])])}><Plus className="h-3.5 w-3.5 mr-1" />Agregar sondeo</Button>
            <p className="text-[11px] text-muted-foreground">Cada sondeo prueba esa cantidad de fechas, repartidas de forma pareja en los meses y días elegidos. Ej.: enero, 5 fechas de 7 noches + 8 fechas de 9 noches.</p>
          </div>
          <label className="flex items-start gap-2 rounded border bg-blue-50/40 p-2 text-sm"><input type="checkbox" className="mt-0.5" checked={singleAirline} onChange={e => setSingleAirline(e.target.checked)} /><span><b>Misma aerolínea en todas las tiradas.</b> <span className="text-xs text-muted-foreground">HUB compara las aerolíneas en todas las fechas (cuántas cubre, precio, directos e historial de la ruta) y arma el pedido con la que más conviene. Después se puede cambiar sin volver a sondear.</span></span></label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Lugares a pedir por salida</Label><Input type="number" min={1} value={seats} onChange={e => setSeats(Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Adultos por reserva</Label><Input type="number" min={1} max={9} value={adults} onChange={e => setAdults(Number(e.target.value))} /></div>
          </div>
          <div className="space-y-1"><Label>Notas para aéreos</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: preferimos salida de mañana; aceptamos 2 fechas" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear y armar tiradas'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
