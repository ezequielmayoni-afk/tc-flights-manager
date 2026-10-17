'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Profile = { code: string; name: string; tc_destination_code: string | null; iata_airport: string | null; nights_default: number | null; family: string | null }
const ORIGINS = [{ code: 'BUE', name: 'Buenos Aires' }, { code: 'COR', name: 'Córdoba' }, { code: 'ROS', name: 'Rosario' }, { code: 'MDZ', name: 'Mendoza' }]
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const nextMonths = (n: number) => { const out: string[] = []; const d = new Date(); d.setUTCDate(1); for (let i = 1; i <= n; i++) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)); out.push(x.toISOString().slice(0, 7)) } return out }
const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })

export function NewCupoRequestDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [origin, setOrigin] = useState('BUE')
  const [profileCode, setProfileCode] = useState('')
  const [months, setMonths] = useState<string[]>([])
  const [weekdays, setWeekdays] = useState<number[]>([4, 6])
  const [nights, setNights] = useState(7)
  const [seats, setSeats] = useState(10)
  const [adults, setAdults] = useState(2)
  const [airlinePref, setAirlinePref] = useState('')
  const [directOnly, setDirectOnly] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/producto/perfiles').then(r => r.json()).then(d => setProfiles((d.profiles ?? []).filter((p: Profile) => p.tc_destination_code))).catch(() => null)
  }, [open])
  useEffect(() => { const p = profiles.find(x => x.code === profileCode); if (p?.nights_default) setNights(p.nights_default) }, [profileCode, profiles])

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const submit = async () => {
    const p = profiles.find(x => x.code === profileCode)
    if (!p?.tc_destination_code) { toast.error('Elegí un destino con código de TC'); return }
    if (months.length === 0) { toast.error('Elegí al menos un mes'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/cupos/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originCode: origin, originName: ORIGINS.find(o => o.code === origin)?.name, destinationCode: p.tc_destination_code, destinationName: p.name, destinationProfileCode: p.code, months: [...months].sort(), weekdays, nights, seatsRequested: seats, adults, airlinePref: airlinePref.split(',').map(s => s.trim()).filter(Boolean), directOnly, notes: notes || null, probeNow: true }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo crear el pedido'); return }
      toast.success(`Pedido #${data.id} creado: el cotizador arma las tiradas (unos minutos)`)
      onOpenChange(false); onCreated()
      setMonths([]); setNotes(''); setAirlinePref('')
    } catch { toast.error('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Nuevo pedido de cupos</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Origen</Label><select value={origin} onChange={e => setOrigin(e.target.value)} className="h-9 w-full rounded border px-2 text-sm">{ORIGINS.map(o => <option key={o.code} value={o.code}>{o.name} ({o.code})</option>)}</select></div>
            <div className="space-y-1"><Label>Destino (perfil)</Label><select value={profileCode} onChange={e => setProfileCode(e.target.value)} className="h-9 w-full rounded border px-2 text-sm"><option value="">Elegir…</option>{profiles.map(p => <option key={p.code} value={p.code}>{p.name}{p.family ? ` · ${p.family}` : ''}</option>)}</select></div>
          </div>
          <div className="space-y-1">
            <Label>Meses de salida</Label>
            <div className="flex flex-wrap gap-1.5">{nextMonths(14).map(m => <button key={m} type="button" onClick={() => setMonths(toggle(months, m))} className={`px-2.5 py-1 rounded-full text-xs border ${months.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>{fmtMonth(m)}</button>)}</div>
          </div>
          <div className="space-y-1">
            <Label>Días de salida a sondear</Label>
            <div className="flex gap-1.5">{WEEKDAYS.map((d, i) => <button key={d} type="button" onClick={() => setWeekdays(toggle(weekdays, i))} className={`w-10 py-1 rounded text-xs border ${weekdays.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>{d}</button>)}</div>
            <p className="text-[11px] text-muted-foreground">Hasta 24 fechas por pedido, repartidas entre los meses. Cada fecha es una consulta real al cotizador (~1 min cada una, de a una).</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Noches</Label><Input type="number" min={1} value={nights} onChange={e => setNights(Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Lugares a pedir</Label><Input type="number" min={1} value={seats} onChange={e => setSeats(Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Adultos por reserva</Label><Input type="number" min={1} max={9} value={adults} onChange={e => setAdults(Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Aerolíneas preferidas (coma)</Label><Input value={airlinePref} onChange={e => setAirlinePref(e.target.value)} placeholder="JetSMART, Aerolíneas" /></div>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={directOnly} onChange={e => setDirectOnly(e.target.checked)} />Sólo vuelos directos</label>
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
