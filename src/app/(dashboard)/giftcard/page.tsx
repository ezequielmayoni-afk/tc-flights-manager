'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ExternalLink, Loader2, Save } from 'lucide-react'
import { cashArs, fmtArs, normalizePlans, quotePlans, type GiftcardPlan } from '@/lib/giftcard/quote'

interface Settings { fxRate: number | null; plans: GiftcardPlan[]; note: string; updatedAt: string | null; updatedBy: string | null }
interface Payload { settings: Settings; tcRate: number | null; fx: { rate: number; source: string } | null; mpReference: Array<{ n: number; ratePct: number }>; amountsUsd: number[] }

const LANDING = 'https://www.siviajo.com/es/landing/34533/giftcard'

export default function GiftcardSettingsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [fxText, setFxText] = useState('')
  const [plans, setPlans] = useState<GiftcardPlan[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [newN, setNewN] = useState('')

  const load = async () => {
    const res = await fetch('/api/giftcard/settings')
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'No se pudo cargar la configuración'); return }
    setData(json); setFxText(json.settings.fxRate ? String(json.settings.fxRate) : ''); setPlans(json.settings.plans); setNote(json.settings.note || '')
  }
  useEffect(() => { load() }, [])

  const fxRate = useMemo(() => { const v = Number(fxText.replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null }, [fxText])
  const effectiveRate = fxRate ?? data?.tcRate ?? null
  const enabledPlans = useMemo(() => normalizePlans(plans).filter((p) => p.enabled), [plans])

  const setPlan = (n: number, patch: Partial<GiftcardPlan>) => setPlans((ps) => ps.map((p) => (p.n === n ? { ...p, ...patch } : p)))
  const addPlan = () => {
    const n = Math.round(Number(newN))
    if (!Number.isInteger(n) || n < 2 || n > 24) { toast.error('Cuotas: un entero entre 2 y 24'); return }
    if (plans.some((p) => p.n === n)) { toast.error('Ese plan ya existe'); return }
    setPlans((ps) => [...ps, { n, coef: 1, enabled: true }].sort((a, b) => a.n - b.n)); setNewN('')
  }
  const removePlan = (n: number) => setPlans((ps) => ps.filter((p) => p.n !== n))

  const save = async () => {
    if (fxText.trim() && !fxRate) { toast.error('El tipo de cambio tiene que ser un número mayor a 0 (o vacío para usar el de TC)'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/giftcard/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fxRate, plans: normalizePlans(plans), note }) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudo guardar'); return }
      setData(json); setPlans(json.settings.plans); setFxText(json.settings.fxRate ? String(json.settings.fxRate) : '')
      toast.success('Guardado. La landing lo muestra en menos de un minuto.')
    } finally { setSaving(false) }
  }

  if (!data) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>
  const mpRef = (n: number) => data.mpReference.find((m) => m.n === n)
  const pct = (coef: number) => `${((coef - 1) * 100).toFixed(2).replace('.', ',')} %`

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Gift Card: tipo de cambio y cuotas</h1>
          <p className="text-muted-foreground text-sm">Lo que se muestra y se cobra en <a className="underline inline-flex items-center gap-1" href={LANDING} target="_blank" rel="noreferrer">siviajo.com/giftcard <ExternalLink className="h-3 w-3" /></a>. Cada tarjeta de la landing tiene un desplegable con estos planes; el precio en pesos sale del tipo de cambio y el total en cuotas del coeficiente.</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Guardar</>}</Button>
      </div>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Tipo de cambio (USD → ARS)</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="fx" className="text-sm font-normal">Cotización para la Gift Card</Label>
            <Input id="fx" type="number" step={1} min={1} className="w-40 h-9 mt-1" placeholder={data.tcRate ? String(data.tcRate) : 'ej. 1590'} value={fxText} onChange={(e) => setFxText(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setFxText('')} disabled={!fxText}>Usar la de TC</Button>
          <div className="text-xs text-muted-foreground">
            Vacío = se usa la cotización manual de TC (hoy {data.tcRate ? data.tcRate.toLocaleString('es-AR') : 'sin dato'}). Vigente ahora: <b>{effectiveRate ? effectiveRate.toLocaleString('es-AR') : '—'}</b>{fxRate ? ' (cargada acá)' : ' (TC)'}.
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Cuotas y coeficientes</h2>
        <p className="text-xs text-muted-foreground">Total en n cuotas = contado × coeficiente; la cuota es ese total dividido n. Coeficiente 1 = sin recargo. La columna MP hoy es lo que Mercado Pago cobra hoy con Visa en la mayoría de los bancos (referencia para calibrar; se suma a lo que fijes acá si la cuenta no tiene cuotas sin interés para ese plan).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-3">Activo</th><th className="py-2 pr-3">Cuotas</th><th className="py-2 pr-3">Coeficiente</th><th className="py-2 pr-3">Recargo</th><th className="py-2 pr-3">MP hoy</th><th className="py-2 pr-3">USD 1.000 queda en</th><th className="py-2"></th></tr></thead>
            <tbody>
              {plans.map((p) => {
                const q = effectiveRate ? quotePlans(cashArs(1000, effectiveRate), [{ ...p, enabled: true }])[0] : null
                const ref = mpRef(p.n)
                return (
                  <tr key={p.n} className="border-b last:border-0">
                    <td className="py-2 pr-3"><input type="checkbox" className="h-4 w-4" checked={p.enabled} disabled={p.n === 1} onChange={(e) => setPlan(p.n, { enabled: e.target.checked })} /></td>
                    <td className="py-2 pr-3 font-medium">{p.n === 1 ? '1 pago' : `${p.n} cuotas`}</td>
                    <td className="py-2 pr-3">{p.n === 1 ? <span className="text-muted-foreground">1</span> : <Input type="number" step={0.001} min={0.5} max={5} className="w-28 h-8" value={p.coef} onChange={(e) => setPlan(p.n, { coef: Number(e.target.value) })} />}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.n === 1 ? '—' : pct(p.coef || 1)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{ref ? `${ref.ratePct.toFixed(2).replace('.', ',')} %` : '—'}</td>
                    <td className="py-2 pr-3">{q ? (q.n === 1 ? fmtArs(q.totalArs) : `${q.n} cuotas de ${fmtArs(q.installmentArs)} (total ${fmtArs(q.totalArs)})`) : '—'}</td>
                    <td className="py-2 text-right">{p.n !== 1 && <button className="text-xs text-muted-foreground hover:text-red-600" onClick={() => removePlan(p.n)}>quitar</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" min={2} max={24} className="w-24 h-8" placeholder="ej. 18" value={newN} onChange={(e) => setNewN(e.target.value)} />
          <Button variant="outline" size="sm" onClick={addPlan}>Agregar plan de cuotas</Button>
        </div>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Así queda cada tarjeta de la landing</h2>
        {!effectiveRate ? <p className="text-sm text-muted-foreground">Sin tipo de cambio no se puede calcular.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2 pr-3">Gift Card</th>{enabledPlans.map((p) => <th key={p.n} className="py-2 pr-3">{p.n === 1 ? '1 pago' : `${p.n} cuotas`}</th>)}</tr></thead>
              <tbody>
                {data.amountsUsd.map((usd) => {
                  const qs = quotePlans(cashArs(usd, effectiveRate), enabledPlans)
                  return (
                    <tr key={usd} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">USD {usd.toLocaleString('es-AR')}</td>
                      {qs.map((q) => <td key={q.n} className="py-2 pr-3">{q.n === 1 ? fmtArs(q.totalArs) : <><b>{q.n} × {fmtArs(q.installmentArs)}</b> <span className="text-muted-foreground">= {fmtArs(q.totalArs)}</span></>}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-2">
        <Label htmlFor="note" className="text-sm font-normal">Nota interna (opcional)</Label>
        <Input id="note" className="h-9" maxLength={300} placeholder="ej. coeficientes de noviembre según costo financiero de MP" value={note} onChange={(e) => setNote(e.target.value)} />
        {data.settings.updatedAt && <p className="text-xs text-muted-foreground">Última modificación: {new Date(data.settings.updatedAt).toLocaleString('es-AR')}{data.settings.updatedBy ? ` por ${data.settings.updatedBy}` : ''}</p>}
      </section>
    </div>
  )
}
