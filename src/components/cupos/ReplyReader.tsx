'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, MailOpen, Sparkles, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { ReplyProposal, ParsedTerms } from '@/lib/cupos/reply-extract'

type Read = { replyId: number; proposals: ReplyProposal[]; terms: ParsedTerms; generalNotes: string | null; confidence: string; model: string }
const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' }) : '–')

/**
 * Lectura de la respuesta de aéreos: hoy se pega el mail; cuando la casilla
 * esté delegada, el agente la trae solo. Claude extrae precio, lugares y
 * condiciones por salida; la persona revisa y aplica.
 */
export function ReplyReader({ requestId, onApplied }: { requestId: number; onApplied: () => void }) {
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [read, setRead] = useState<Read | null>(null)
  const [edits, setEdits] = useState<Record<number, { price: string; seats: string }>>({})

  const readReply = async () => {
    setReading(true)
    try {
      const res = await fetch(`/api/cupos/requests/${requestId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, source: 'paste' }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo leer la respuesta'); return }
      setRead(data)
      setEdits(Object.fromEntries((data.proposals as ReplyProposal[]).map((p, i) => [i, { price: p.price_pp === null ? '' : String(p.price_pp), seats: p.seats_offered === null ? '' : String(p.seats_offered) }])))
      const matched = (data.proposals as ReplyProposal[]).filter(p => p.matched).length
      toast.success(`Leída: ${matched} de ${data.proposals.length} salidas asociadas a tiradas (confianza ${data.confidence})`)
    } catch { toast.error('Error de conexión') } finally { setReading(false) }
  }

  const apply = async () => {
    if (!read) return
    const proposals = read.proposals.map((p, i) => ({ ...p, price_pp: edits[i]?.price === '' ? null : Number(edits[i]?.price ?? p.price_pp), seats_offered: edits[i]?.seats === '' ? null : Number(edits[i]?.seats ?? p.seats_offered) })).filter(p => p.optionId !== null).map(p => ({ optionId: p.optionId as number, price_pp: p.price_pp, currency: p.currency ?? 'USD', seats_offered: p.seats_offered, available: p.available, notes: p.notes, terms: p.terms as unknown as Record<string, string | number | null> }))
    if (proposals.length === 0) { toast.error('Ninguna salida de la respuesta coincide con una tirada pedida'); return }
    setApplying(true)
    try {
      const res = await fetch(`/api/cupos/requests/${requestId}/reply/${read.replyId}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposals }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo aplicar'); return }
      toast.success(`${data.applied} tirada(s) actualizadas con precio y condiciones`)
      setRead(null); setText(''); onApplied()
    } catch { toast.error('Error de conexión') } finally { setApplying(false) }
  }

  const t = read?.terms
  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2"><MailOpen className="h-4 w-4 text-blue-600" /><h3 className="font-semibold">Respuesta de aéreos</h3><span className="text-xs text-muted-foreground">Pegá el mail tal cual llegó (precios, lugares, depósito, vencimientos, release). Se lee y se propone; vos aplicás.</span></div>
      {!read && (
        <div className="space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full rounded border px-3 py-2 text-sm font-mono" placeholder={'Ej: "Confirmamos disponibilidad 13/03 Arajet 10 lugares a USD 690 + tax por pax RT. Depósito 30% a 7 días, saldo 30 días antes de la salida. Release 15/02. Lista de nombres 20 días antes."'} />
          <div className="flex justify-end"><Button size="sm" onClick={readReply} disabled={reading || text.trim().length < 10}>{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" />Leer respuesta</>}</Button></div>
        </div>
      )}
      {read && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge className={`${read.confidence === 'alta' ? 'bg-green-100 text-green-700' : read.confidence === 'media' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'} text-[10px]`}>confianza {read.confidence}</Badge>
            {t && (t.deposit_pct || t.deposit_amount_pp) && <span>Depósito {t.deposit_pct ? `${t.deposit_pct}%` : `USD ${t.deposit_amount_pp} pp`}{t.deposit_due_date ? ` al ${fmt(t.deposit_due_date)}` : ''}</span>}
            {t?.balance_due_date && <span>Saldo al {fmt(t.balance_due_date)}</span>}
            {t?.release_date && <span>Release {fmt(t.release_date)}</span>}
            {t?.name_list_due_date && <span>Nombres al {fmt(t.name_list_due_date)}</span>}
            {t?.valid_until && <span>Vale hasta {fmt(t.valid_until)}</span>}
            {t?.cancellation_terms && <span>Cancelación: {t.cancellation_terms}</span>}
            {t?.payment_conditions && <span>{t.payment_conditions}</span>}
            {read.generalNotes && <span>📝 {read.generalNotes}</span>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-2 py-1.5 text-left">Salida</th><th className="px-2 py-1.5 text-left">Aerolínea</th><th className="px-2 py-1.5 text-left">Tirada</th><th className="px-2 py-1.5 text-right">Precio pp</th><th className="px-2 py-1.5 text-right">Lugares</th><th className="px-2 py-1.5 text-right">Δ sistema</th><th className="px-2 py-1.5 text-left">Notas / condiciones propias</th></tr></thead>
            <tbody className="divide-y">
              {read.proposals.map((p, i) => (
                <tr key={i} className={p.matched ? '' : 'bg-amber-50/50'}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmt(p.departure_date)}</td>
                  <td className="px-2 py-1.5">{p.airline ?? '–'}</td>
                  <td className="px-2 py-1.5 text-xs">{p.matched ? <span className="text-green-700 inline-flex items-center gap-1"><Check className="h-3 w-3" />asociada</span> : <span className="text-amber-700">no estaba pedida: no se aplica</span>}{p.available === false && <span className="ml-1 text-red-600">sin cupo</span>}</td>
                  <td className="px-2 py-1.5 text-right"><Input type="number" value={edits[i]?.price ?? ''} onChange={e => setEdits({ ...edits, [i]: { ...edits[i], price: e.target.value } })} className="h-7 w-24 text-right text-xs ml-auto" disabled={!p.matched} /></td>
                  <td className="px-2 py-1.5 text-right"><Input type="number" value={edits[i]?.seats ?? ''} onChange={e => setEdits({ ...edits, [i]: { ...edits[i], seats: e.target.value } })} className="h-7 w-16 text-right text-xs ml-auto" disabled={!p.matched} /></td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${p.delta_pct === null ? 'text-muted-foreground' : p.delta_pct <= 0 ? 'text-green-700' : p.delta_pct <= 10 ? 'text-amber-700' : 'text-red-600'}`}>{p.delta_pct === null ? '–' : `${p.delta_pct > 0 ? '+' : ''}${p.delta_pct}%`}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">{[p.notes, p.terms?.release_date && p.terms.release_date !== t?.release_date ? `release ${fmt(p.terms.release_date)}` : null].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setRead(null)}>Descartar</Button><Button size="sm" onClick={apply} disabled={applying}>{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar a las tiradas'}</Button></div>
        </div>
      )}
    </div>
  )
}
