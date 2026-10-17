'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, Mail, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AirlineContact, CupoMailSettings } from '@/lib/cupos/contacts'

type Airline = { code: string; name: string }
type Draft = { airlineCode: string; airlineName: string; contactName: string; email: string; ccEmails: string; phone: string; notes: string; active: boolean }
const empty: Draft = { airlineCode: '', airlineName: '', contactName: '', email: '', ccEmails: '', phone: '', notes: '', active: true }
const toDraft = (c: AirlineContact): Draft => ({ airlineCode: c.airline_code, airlineName: c.airline_name, contactName: c.contact_name ?? '', email: c.email, ccEmails: c.cc_emails.join(', '), phone: c.phone ?? '', notes: c.notes ?? '', active: c.active })
const splitMails = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)

/** Casilla desde la que salen los pedidos de cupos y contactos por aerolínea. El agente de mail usa las dos cosas. */
export function AirlineContactsPanel() {
  const [contacts, setContacts] = useState<AirlineContact[]>([])
  const [airlines, setAirlines] = useState<Airline[]>([])
  const [settings, setSettings] = useState<CupoMailSettings | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [creating, setCreating] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch('/api/cupos/contacts'), fetch('/api/cupos/mail-settings')])
      const da = await a.json(); const dbb = await b.json()
      if (!a.ok) { toast.error(da.error || 'No se pudieron cargar los contactos'); return }
      setContacts(da.contacts ?? []); setAirlines(da.airlines ?? []); setDrafts(Object.fromEntries((da.contacts ?? []).map((c: AirlineContact) => [c.id, toDraft(c)])))
      if (b.ok) setSettings(dbb.settings)
    } catch { toast.error('Error de conexión') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const saveSettings = async () => {
    if (!settings) return
    setBusy('settings')
    try {
      const res = await fetch('/api/cupos/mail-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: settings.enabled, from: settings.from || null, fromName: settings.fromName || null, cc: settings.cc, subjectPrefix: settings.subjectPrefix || null, signature: settings.signature || null, slaHours: settings.slaHours, slackChannelAereos: settings.slackChannelAereos || null }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo guardar'); return }
      toast.success('Casilla guardada'); setSettings(data.settings)
    } finally { setBusy(null) }
  }

  const body = (d: Draft) => ({ airlineCode: d.airlineCode, airlineName: d.airlineName, contactName: d.contactName || null, email: d.email, ccEmails: splitMails(d.ccEmails), phone: d.phone || null, notes: d.notes || null, active: d.active })

  const saveContact = async (id: number) => {
    setBusy(`c${id}`)
    try {
      const res = await fetch(`/api/cupos/contacts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(drafts[id])) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo guardar'); return }
      toast.success('Contacto guardado'); await load()
    } finally { setBusy(null) }
  }
  const createContact = async () => {
    if (!creating) return
    setBusy('new')
    try {
      const res = await fetch('/api/cupos/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(creating)) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo crear'); return }
      toast.success('Contacto creado'); setCreating(null); await load()
    } finally { setBusy(null) }
  }
  const remove = async (c: AirlineContact) => {
    if (!window.confirm(`¿Borrar el contacto ${c.email} de ${c.airline_name}?`)) return
    setBusy(`d${c.id}`)
    try { const res = await fetch(`/api/cupos/contacts/${c.id}`, { method: 'DELETE' }); if (!res.ok) { toast.error('No se pudo borrar'); return } await load() } finally { setBusy(null) }
  }
  const pickAirline = (d: Draft, code: string): Draft => ({ ...d, airlineCode: code, airlineName: code === '*' ? (d.airlineName || 'Consolidador') : (airlines.find(a => a.code === code)?.name ?? d.airlineName) })

  const row = (d: Draft, set: (x: Draft) => void, key: string) => (
    <>
      <td className="px-2 py-1.5"><select value={d.airlineCode} onChange={e => set(pickAirline(d, e.target.value))} className="h-8 w-full rounded border px-1 text-xs"><option value="">Aerolínea…</option><option value="*">* Cualquiera (consolidador)</option>{airlines.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></td>
      <td className="px-2 py-1.5"><Input value={d.contactName} onChange={e => set({ ...d, contactName: e.target.value })} className="h-8 text-xs" placeholder="Nombre" /></td>
      <td className="px-2 py-1.5"><Input value={d.email} onChange={e => set({ ...d, email: e.target.value })} className="h-8 text-xs" placeholder="mail@aerolinea.com" /></td>
      <td className="px-2 py-1.5"><Input value={d.ccEmails} onChange={e => set({ ...d, ccEmails: e.target.value })} className="h-8 text-xs" placeholder="copias, separadas por coma" /></td>
      <td className="px-2 py-1.5"><Input value={d.phone} onChange={e => set({ ...d, phone: e.target.value })} className="h-8 text-xs" placeholder="Tel." /></td>
      <td className="px-2 py-1.5"><Input value={d.notes} onChange={e => set({ ...d, notes: e.target.value })} className="h-8 text-xs" placeholder="Notas" /></td>
      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={d.active} onChange={e => set({ ...d, active: e.target.checked })} title="Activo" aria-label={`activo ${key}`} /></td>
    </>
  )

  if (loading || !settings) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/flights/pedidos" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold">Contactos de aerolíneas y casilla de envío</h1><p className="text-sm text-muted-foreground">Desde qué mail salen los pedidos de cupos y a quién le llegan por aerolínea. El agente que manda el mail y lee la respuesta usa esta configuración.</p></div>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-blue-600" /><h2 className="font-semibold">Casilla de envío</h2>{settings.enabled ? <Badge className="bg-green-100 text-green-700 text-[10px]">Envío por mail habilitado</Badge> : <Badge className="bg-slate-100 text-slate-600 text-[10px]">Sólo Slack por ahora</Badge>}</div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="space-y-1 text-sm"><Label>Mail desde el que se envía</Label><Input type="email" value={settings.from ?? ''} onChange={e => setSettings({ ...settings, from: e.target.value })} placeholder="cupos@siviajo.com" /></label>
          <label className="space-y-1 text-sm"><Label>Nombre que ve el destinatario</Label><Input value={settings.fromName ?? ''} onChange={e => setSettings({ ...settings, fromName: e.target.value })} placeholder="Sí, viajo · Cupos" /></label>
          <label className="space-y-1 text-sm"><Label>Copia interna (coma)</Label><Input value={settings.cc.join(', ')} onChange={e => setSettings({ ...settings, cc: splitMails(e.target.value) })} placeholder="vos@siviajo.com" /></label>
          <label className="space-y-1 text-sm"><Label>Prefijo del asunto</Label><Input value={settings.subjectPrefix ?? ''} onChange={e => setSettings({ ...settings, subjectPrefix: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><Label>Plazo de respuesta (horas)</Label><Input type="number" min={1} value={settings.slaHours} onChange={e => setSettings({ ...settings, slaHours: Number(e.target.value) || 72 })} /></label>
          <label className="space-y-1 text-sm"><Label>Canal de Slack de aéreos</Label><Input value={settings.slackChannelAereos ?? ''} onChange={e => setSettings({ ...settings, slackChannelAereos: e.target.value })} placeholder="#aereos" /></label>
        </div>
        <label className="space-y-1 text-sm block"><Label>Firma del mail</Label><textarea value={settings.signature ?? ''} onChange={e => setSettings({ ...settings, signature: e.target.value })} rows={3} className="w-full rounded border px-2 py-1 text-sm" placeholder={'Ezequiel Mayoni\nSí, viajo · Producto\n+54 9 11 …'} /></label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Mandar el pedido por mail (además de Slack)</label>
          <span className="text-xs text-muted-foreground">Requiere que el administrador del Workspace delegue la casilla a la cuenta de servicio de HUB. Hasta entonces el envío queda registrado pero el mail no sale.</span>
          <span className="flex-1" />
          <Button size="sm" onClick={saveSettings} disabled={busy === 'settings'}>{busy === 'settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Guardar</>}</Button>
        </div>
      </div>

      <div className="bg-white border rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 border-b"><h2 className="font-semibold">Contactos por aerolínea</h2><span className="text-sm text-muted-foreground">{contacts.length}</span><span className="flex-1" /><Button size="sm" variant="outline" onClick={() => setCreating({ ...empty })} disabled={creating !== null}><Plus className="h-4 w-4 mr-1" />Agregar</Button></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-2 py-2 text-left w-48">Aerolínea</th><th className="px-2 py-2 text-left">Contacto</th><th className="px-2 py-2 text-left">Mail</th><th className="px-2 py-2 text-left">Copias</th><th className="px-2 py-2 text-left w-28">Teléfono</th><th className="px-2 py-2 text-left">Notas</th><th className="px-2 py-2 w-12">Activo</th><th className="px-2 py-2 w-24"></th></tr></thead>
          <tbody className="divide-y">
            {creating && <tr className="bg-blue-50/40">{row(creating, setCreating, 'nuevo')}<td className="px-2 py-1.5 whitespace-nowrap"><Button size="sm" className="h-7 mr-1" onClick={createContact} disabled={busy === 'new' || !creating.email || !creating.airlineCode}>Crear</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => setCreating(null)}>✕</Button></td></tr>}
            {contacts.length === 0 && !creating && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Todavía no hay contactos. Agregá uno por aerolínea (o un consolidador con "*").</td></tr>}
            {contacts.map(c => { const d = drafts[c.id] ?? toDraft(c); const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(c)); return (
              <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
                {row(d, x => setDrafts({ ...drafts, [c.id]: x }), String(c.id))}
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Button size="sm" variant={dirty ? 'default' : 'ghost'} className="h-7 mr-1" onClick={() => saveContact(c.id)} disabled={busy === `c${c.id}` || !dirty} title="Guardar cambios"><Save className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => remove(c)} disabled={busy === `d${c.id}`} title="Borrar"><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ) })}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted-foreground">Un pedido se manda a los contactos de las aerolíneas que aparecen en sus tiradas, más los consolidadores (*). Si ninguna aerolínea de la tirada tiene contacto, se manda a todos los activos.</p>
      </div>
    </div>
  )
}
