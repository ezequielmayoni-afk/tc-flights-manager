'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, RefreshCw, Save } from 'lucide-react'
import { FAMILY_LABELS, TRACK_COLORS, TRACK_LABELS, WEIGHT_LABELS } from '@/lib/marketing/labels'
import type { MarketingRules } from '@/lib/marketing/criteria'

interface RulesResponse { rules: MarketingRules; weightKeys: string[]; familyKeys: string[]; byTrack: Record<string, number>; lastEvaluatedAt: string | null }

const THRESHOLDS: Array<{ key: keyof MarketingRules; label: string; hint: string }> = [
  { key: 'marketingMin', label: 'Score mínimo para "Marketing"', hint: 'Desde este score el paquete se recomienda para pauta.' },
  { key: 'manualMin', label: 'Score mínimo para "Para decidir"', hint: 'Entre este valor y el anterior queda en zona gris; por debajo, sólo web.' },
  { key: 'marginGoodPct', label: 'Margen bueno (%)', hint: 'Fee de agencia sobre el total del paquete.' },
  { key: 'marginGreatPct', label: 'Margen excelente (%)', hint: 'Suma el extra de "excelente".' },
  { key: 'marginBadPct', label: 'Margen bajo (%)', hint: 'Por debajo penaliza.' },
  { key: 'minDaysToDeparture', label: 'Días mínimos hasta la salida', hint: 'Menos que esto no llega diseño (48 h) más aprendizaje.' },
  { key: 'cupoMinSeats', label: 'Lugares mínimos del cupo', hint: 'Con menos lugares no vale la pena pautar.' },
  { key: 'cupoWindowFromDays', label: 'Ventana de pauta del cupo: desde (días)', hint: '' },
  { key: 'cupoWindowToDays', label: 'Ventana de pauta del cupo: hasta (días)', hint: '' },
  { key: 'maxInMarketingPerDestination', label: 'Máximo en marketing por destino', hint: 'A partir de este número penaliza por canibalización.' },
  { key: 'ticketLowUsd', label: 'Ticket bajo (USD por pasajero)', hint: 'Por debajo la pauta no se paga.' },
  { key: 'ticketHighUsd', label: 'Ticket alto (USD por pasajero)', hint: 'Suma sólo si el peso "ticket alto" no es 0.' },
]

export default function MarketingRulesPage() {
  const [data, setData] = useState<RulesResponse | null>(null)
  const [rules, setRules] = useState<MarketingRules | null>(null)
  const [saving, setSaving] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const load = async () => {
    const res = await fetch('/api/marketing/rules')
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'No se pudieron cargar las reglas'); return }
    setData(json); setRules(json.rules)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!rules) return
    setSaving(true)
    try {
      const res = await fetch('/api/marketing/rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudieron guardar'); return }
      toast.success('Reglas guardadas. La próxima evaluación las usa.')
      setRules(json.rules)
    } finally { setSaving(false) }
  }

  const evaluateNow = async () => {
    setEvaluating(true)
    try {
      const res = await fetch('/api/marketing/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudo encolar'); return }
      toast.info('Evaluación encolada: en un minuto se actualizan las vías')
      setTimeout(load, 45_000)
    } finally { setEvaluating(false) }
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

  if (!rules || !data) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/packages/marketing" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Criterio marketing vs web</h1>
          <p className="text-muted-foreground text-sm">Cada paquete activo recibe un score sumando estos pesos. El envío a diseño sigue siendo una decisión de una persona en Tareas.</p>
        </div>
        <Button variant="outline" onClick={evaluateNow} disabled={evaluating}>{evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" />Evaluar ahora</>}</Button>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Guardar</>}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {Object.entries(data.byTrack).map(([k, v]) => <Badge key={k} className={`${TRACK_COLORS[k] ?? ''}`}>{TRACK_LABELS[k] ?? k}: {v}</Badge>)}
        {data.lastEvaluatedAt && <span className="text-xs text-muted-foreground">Última evaluación: {new Date(data.lastEvaluatedAt).toLocaleString('es-AR')}</span>}
      </div>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Pesos del score</h2>
        <p className="text-xs text-muted-foreground">Positivo suma, negativo penaliza. El score se recorta a −100…100.</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {data.weightKeys.map(k => (
            <div key={k} className="flex items-center gap-3">
              <Label htmlFor={`w-${k}`} className="flex-1 text-sm font-normal">{WEIGHT_LABELS[k] ?? k}</Label>
              <Input id={`w-${k}`} type="number" step={5} className="w-20 h-8 text-right" value={num(rules.weights[k])} onChange={e => setRules({ ...rules, weights: { ...rules.weights, [k]: Number(e.target.value) } })} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Familia del destino</h2>
        <p className="text-xs text-muted-foreground">Lo que históricamente rinde en pauta (según el perfil del destino). 0 = neutro.</p>
        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-2">
          {data.familyKeys.map(k => (
            <div key={k} className="flex items-center gap-3">
              <Label htmlFor={`f-${k}`} className="flex-1 text-sm font-normal">{FAMILY_LABELS[k] ?? k}</Label>
              <Input id={`f-${k}`} type="number" step={5} className="w-20 h-8 text-right" value={num(rules.familyWeights[k])} onChange={e => setRules({ ...rules, familyWeights: { ...rules.familyWeights, [k]: Number(e.target.value) } })} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Umbrales</h2>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {THRESHOLDS.map(t => (
            <div key={t.key} className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor={`t-${t.key}`} className="text-sm font-normal">{t.label}</Label>
                {t.hint && <p className="text-[11px] text-muted-foreground">{t.hint}</p>}
              </div>
              <Input id={`t-${t.key}`} type="number" className="w-24 h-8 text-right" value={num(rules[t.key])} onChange={e => setRules({ ...rules, [t.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Modo</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rules.autoApprove} onChange={e => setRules({ ...rules, autoApprove: e.target.checked })} />
          Aprobación automática: los recomendados para marketing van solos a diseño
        </label>
        <p className="text-xs text-muted-foreground">Todavía no está conectada: queda como decisión explícita después de cuatro semanas de acuerdo ≥ 80 % en Tareas. Hoy el envío a diseño es siempre una persona.</p>
      </section>
    </div>
  )
}
