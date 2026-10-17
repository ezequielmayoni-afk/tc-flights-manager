'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Check, Loader2, Plane, RefreshCw, Send, ShieldCheck, X, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { OPTION_STATUS_LABELS, REQUEST_STATUS_LABELS, type CupoRequest, type CupoRequestOption } from '@/lib/cupos/requests'
import type { ReplyProposal, ParsedTerms } from '@/lib/cupos/reply-extract'
import { ReplyReader } from './ReplyReader'

type Detail = { request: CupoRequest; options: CupoRequestOption[]; waitingHours: number | null; probeJob: { id: number; status: string; last_error: string | null } | null; recipients: Array<{ id: number; airline: string; name: string | null; email: string }> }

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' })
const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
const fmtShort = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : null)
/** Resumen de condiciones de una tirada: depósito, vencimientos, release, lista de nombres. */
function termsLine(o: CupoRequestOption): string {
  const parts: string[] = []
  if (o.seats_offered !== null && o.seats_offered !== undefined) parts.push(`${o.seats_offered} lugares ofrecidos`)
  if (o.deposit_pct) parts.push(`depósito ${o.deposit_pct}%${o.deposit_due_date ? ` al ${fmtShort(o.deposit_due_date)}` : ''}`)
  else if (o.deposit_amount_pp) parts.push(`depósito USD ${o.deposit_amount_pp} pp${o.deposit_due_date ? ` al ${fmtShort(o.deposit_due_date)}` : ''}`)
  else if (o.deposit_due_date) parts.push(`depósito al ${fmtShort(o.deposit_due_date)}`)
  if (o.balance_due_date) parts.push(`saldo al ${fmtShort(o.balance_due_date)}`)
  if (o.release_date) parts.push(`release ${fmtShort(o.release_date)}`)
  if (o.name_list_due_date) parts.push(`nombres al ${fmtShort(o.name_list_due_date)}`)
  if (o.valid_until) parts.push(`vale hasta ${fmtShort(o.valid_until)}`)
  if (o.cancellation_terms) parts.push(`cancelación: ${o.cancellation_terms}`)
  if (o.payment_conditions) parts.push(o.payment_conditions)
  return parts.join(' · ')
}
void (null as unknown as ReplyProposal | ParsedTerms | null)
const OPT_CLS: Record<string, string> = { probed: 'bg-slate-100 text-slate-700', requested: 'bg-amber-100 text-amber-700', quoted: 'bg-blue-100 text-blue-700', accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', loaded: 'bg-emerald-100 text-emerald-800' }

/** Detalle de un pedido: tiradas con precio de sistema, carga del precio de aéreos, delta, aceptar/rechazar, confirmar y cargar el cupo. */
export function CupoRequestDetail({ id }: { id: number }) {
  const [d, setD] = useState<Detail | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    const res = await fetch(`/api/cupos/requests/${id}`)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'No se pudo cargar el pedido'); return }
    setD(data)
    setPrices(Object.fromEntries((data.options as CupoRequestOption[]).map(o => [o.id, o.airline_price_pp === null ? '' : String(o.airline_price_pp)])))
    setNotes(Object.fromEntries((data.options as CupoRequestOption[]).map(o => [o.id, o.airline_notes ?? ''])))
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (d?.request.status !== 'probing') return
    const t = setInterval(load, 15_000); return () => clearInterval(t)
  }, [d?.request.status, load])

  const call = async (key: string, url: string, method: string, body?: unknown, ok?: string) => {
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo'); return false }
      if (ok) toast.success(ok)
      await load(); return true
    } catch { toast.error('Error de conexión'); return false } finally { setBusy(null) }
  }

  if (!d) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>
  const { request: r, options } = d
  const canSend = ['ready', 'draft'].includes(r.status) && options.some(o => o.status === 'probed')
  const canAnswer = ['sent', 'answered', 'confirming'].includes(r.status)
  const accepted = options.filter(o => o.status === 'accepted' || o.status === 'loaded')
  const canConfirm = ['answered', 'confirming'].includes(r.status) && accepted.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/flights/pedidos" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{r.title}</h1>
          <p className="text-sm text-muted-foreground">{r.origin_code} → {r.destination_name} ({r.destination_code}) · {r.months.map(fmtMonth).join(', ')} · {r.nights} noches · {r.seats_requested} lugares · {r.adults} adultos por reserva{r.direct_only ? ' · sólo directos' : ''}{r.airline_pref.length ? ` · preferencia ${r.airline_pref.join(', ')}` : ''}</p>
        </div>
        <Badge variant="secondary">{REQUEST_STATUS_LABELS[r.status]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {r.status === 'probing' && <span className="inline-flex items-center gap-1 text-blue-700"><Loader2 className="h-3 w-3 animate-spin" />El cotizador está sondeando fechas (unos minutos; de a una, ~1 min cada una)</span>}
        {r.probe_error && <span className="text-red-600">{r.probe_error}</span>}
        {r.last_probe_at && <span>Última sonda: {new Date(r.last_probe_at).toLocaleString('es-AR')}</span>}
        {r.sent_at && <span>Enviado {new Date(r.sent_at).toLocaleString('es-AR')}{r.response_deadline_at ? ` · plazo ${new Date(r.response_deadline_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>}
        {d.waitingHours !== null && <span className={r.answered_at ? '' : 'text-amber-700'}>{r.answered_at ? `Aéreos respondió en ${Math.round(d.waitingHours)} h` : `${Math.round(d.waitingHours)} h esperando a aéreos`}</span>}
        {r.confirmed_at && <span>Confirmado {new Date(r.confirmed_at).toLocaleString('es-AR')} por {r.confirmed_by}</span>}
        {(r.sent_to?.length ? r.sent_to : d.recipients.map(x => x.email)).length > 0 && <span title="Contactos de aerolínea a los que va (o fue) el pedido">✉ {r.sent_to?.length ? 'Enviado a' : 'Iría a'}: {(r.sent_to?.length ? r.sent_to : d.recipients.map(x => `${x.airline} ${x.email}`)).join(', ')}</span>}
        {!r.sent_to?.length && d.recipients.length === 0 && <Link href="/flights/pedidos/contactos" className="text-amber-700 hover:underline">Sin contactos de aerolínea cargados</Link>}
        <span className="flex-1" />
        {['draft', 'ready'].includes(r.status) && <Button size="sm" variant="outline" onClick={() => call('probe', `/api/cupos/requests/${id}/probe`, 'POST', undefined, 'Sondeo en cola')} disabled={busy !== null}><RefreshCw className="h-3.5 w-3.5 mr-1" />{options.length ? 'Volver a sondear' : 'Armar tiradas'}</Button>}
        {canSend && <Button size="sm" onClick={() => { if (window.confirm(`¿Mandar ${options.filter(o => o.status === 'probed').length} tiradas a aéreos por Slack?`)) call('send', `/api/cupos/requests/${id}/send`, 'POST', undefined, 'Pedido enviado a aéreos') }} disabled={busy !== null}><Send className="h-3.5 w-3.5 mr-1" />Enviar a aéreos</Button>}
        {r.status === 'sent' && <Button size="sm" variant="outline" onClick={() => call('send', `/api/cupos/requests/${id}/send`, 'POST', undefined, 'Recordatorio enviado')} disabled={busy !== null}><Send className="h-3.5 w-3.5 mr-1" />Reenviar</Button>}
        {canConfirm && <Button size="sm" onClick={() => { if (window.confirm(`¿Confirmar ${accepted.length} tirada(s)? Después se cargan como cupo en Vuelos.`)) call('confirm', `/api/cupos/requests/${id}/confirm`, 'POST', undefined, 'Pedido confirmado') }} disabled={busy !== null}><ShieldCheck className="h-3.5 w-3.5 mr-1" />Confirmar</Button>}
        {!['loaded', 'closed', 'cancelled'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('¿Cancelar el pedido?')) call('cancel', `/api/cupos/requests/${id}`, 'PATCH', { status: 'cancelled' }, 'Pedido cancelado') }} disabled={busy !== null}>Cancelar</Button>}
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Salida</th><th className="px-3 py-2 text-left">Regreso</th><th className="px-3 py-2 text-left">Aerolínea · vuelos</th><th className="px-3 py-2 text-left">Horarios</th>
              <th className="px-3 py-2 text-right">Sistema pp</th><th className="px-3 py-2 text-right">Aéreos pp</th><th className="px-3 py-2 text-right">Δ</th><th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {options.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">{r.status === 'probing' ? 'Sondeando…' : 'Sin tiradas todavía'}</td></tr>}
            {options.map(o => {
              const delta = o.delta_pct
              return (
                <tr key={o.id} className={o.status === 'rejected' ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 font-mono text-xs">{o.rank}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(o.departure_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmt(o.return_date)}</td>
                  <td className="px-3 py-2"><div className="font-medium">{o.airline ?? '?'}</div><div className="text-xs text-muted-foreground">{[o.flight_out, o.flight_back].filter(Boolean).join(' / ')} · {o.direct ? 'directo' : `escala${o.stops_out ? ` (${o.stops_out})` : ''}`}{o.checked_bag ? ' · con valija' : ''}</div></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{o.depart_out ?? '–'}→{o.arrive_out ?? '–'}<br />{o.depart_back ?? '–'}→{o.arrive_back ?? '–'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.system_price_pp !== null ? `USD ${Math.round(o.system_price_pp)}` : '–'}</td>
                  <td className="px-3 py-2 text-right">
                    {canAnswer && o.status !== 'rejected' && o.status !== 'loaded' ? (
                      <div className="flex flex-col items-end gap-1">
                        <Input type="number" value={prices[o.id] ?? ''} onChange={e => setPrices({ ...prices, [o.id]: e.target.value })} onBlur={() => { const v = prices[o.id]; if (v !== '' && Number(v) !== (o.airline_price_pp ?? -1)) call(`ans-${o.id}`, `/api/cupos/requests/${id}/answer`, 'POST', { options: [{ id: o.id, airlinePricePp: Number(v), currency: 'USD', notes: notes[o.id] || null }] }, 'Precio guardado') }} placeholder="USD" className="h-8 w-24 text-right" />
                        <Input value={notes[o.id] ?? ''} onChange={e => setNotes({ ...notes, [o.id]: e.target.value })} onBlur={() => { if ((notes[o.id] || '') !== (o.airline_notes || '') && prices[o.id] !== '') call(`note-${o.id}`, `/api/cupos/requests/${id}/answer`, 'POST', { options: [{ id: o.id, airlinePricePp: Number(prices[o.id]), currency: 'USD', notes: notes[o.id] || null }] }) }} placeholder="nota" className="h-7 w-24 text-xs" />
                      </div>
                    ) : <span className="tabular-nums">{o.airline_price_pp !== null ? `USD ${Math.round(o.airline_price_pp)}` : '–'}</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${delta === null ? 'text-muted-foreground' : delta <= 0 ? 'text-green-700' : delta <= 10 ? 'text-amber-700' : 'text-red-600'}`}>{delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta}%`}</td>
                  <td className="px-3 py-2"><Badge className={`${OPT_CLS[o.status]} text-[10px]`}>{OPTION_STATUS_LABELS[o.status]}</Badge>{o.decision_reason && <div className="text-[11px] text-muted-foreground">{o.decision_reason}</div>}{termsLine(o) && <div className="text-[11px] text-muted-foreground mt-0.5" title="Condiciones informadas por aéreos">{termsLine(o)}</div>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {o.status === 'quoted' && <><Button size="sm" variant="outline" className="h-7 mr-1" onClick={() => call(`acc-${o.id}`, `/api/cupos/requests/${id}/options/${o.id}`, 'PATCH', { decision: 'accept' }, 'Tirada aceptada')} disabled={busy !== null}><Check className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className="h-7" onClick={() => { const reason = window.prompt('Motivo del rechazo (opcional)') ?? null; call(`rej-${o.id}`, `/api/cupos/requests/${id}/options/${o.id}`, 'PATCH', { decision: 'reject', reason }, 'Tirada rechazada') }} disabled={busy !== null}><X className="h-3.5 w-3.5" /></Button></>}
                    {(o.status === 'accepted' || o.status === 'rejected') && r.status !== 'loaded' && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => call(`re-${o.id}`, `/api/cupos/requests/${id}/options/${o.id}`, 'PATCH', { decision: 'reopen' })} disabled={busy !== null}>Deshacer</Button>}
                    {o.status === 'accepted' && r.status === 'confirmed' && <Button size="sm" className="h-7 ml-1" asChild><Link href={`/flights/new?option=${o.id}`}><Upload className="h-3.5 w-3.5 mr-1" />Cargar cupo</Link></Button>}
                    {o.status === 'loaded' && o.flight_id && <Button size="sm" variant="outline" className="h-7 ml-1" asChild><Link href={`/flights/${o.flight_id}`}><Plane className="h-3.5 w-3.5 mr-1" />Ver vuelo</Link></Button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {canAnswer && <ReplyReader requestId={id} onApplied={load} />}
      {r.notes && <p className="text-sm text-muted-foreground">📝 {r.notes}</p>}
      <p className="text-xs text-muted-foreground">Precio de sistema: la tarifa de línea más barata que el cotizador encontró para esa fecha (ida y vuelta, por persona). Δ = cuánto más (o menos) pide aéreos respecto del sistema: negativo es buen negocio.</p>
    </div>
  )
}
