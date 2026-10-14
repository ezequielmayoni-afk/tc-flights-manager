'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import type { MarketingFamily } from '@/lib/marketing/families'

type Campaign = { meta_campaign_id: string; name: string; status: string; objective: string | null; daily_budget: string | null }
type Adset = { meta_adset_id: string; meta_campaign_id: string; name: string; status: string; daily_budget: string | null; optimization_goal: string | null }

/**
 * Fase 5: por familia de destino, en qué campaña y desde qué conjunto plantilla
 * se lanzan los paquetes, presupuesto, objetivos y si se lanza solo.
 */
export default function FamiliasPage() {
  const [families, setFamilies] = useState<MarketingFamily[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<Adset[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const res = await fetch('/api/marketing/families')
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'No se pudieron cargar las familias'); return }
    setFamilies(data.families); setCampaigns(data.campaigns); setAdsets(data.adsets); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const patch = (key: string, p: Partial<MarketingFamily>) => setFamilies(fs => fs.map(f => f.key === key ? { ...f, ...p } : f))

  const save = async (f: MarketingFamily) => {
    setSaving(f.key)
    try {
      const res = await fetch('/api/marketing/families', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: f.key, name: f.name, metaCampaignId: f.metaCampaignId, templateAdsetId: f.templateAdsetId, dailyBudgetCents: f.dailyBudgetCents, targetCpconUsd: f.targetCpconUsd, targetCpaUsd: f.targetCpaUsd, maxActiveAdsPerAdset: f.maxActiveAdsPerAdset, autoLaunch: f.autoLaunch, active: f.active, notes: f.notes }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo guardar'); return }
      toast.success(`Familia ${f.name} guardada`); setFamilies(data.families)
    } finally { setSaving(null) }
  }

  const num = (v: number | null) => (v === null ? '' : String(v))
  const toNum = (s: string) => (s.trim() === '' ? null : Number(s))

  if (loading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/packages/marketing" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold">Familias de destino en Meta</h1>
          <p className="text-muted-foreground text-sm">Cada paquete se lanza en la campaña de su familia, copiando la segmentación y el presupuesto del conjunto plantilla. El conjunto nuevo se llama DESTINO_MES_SIV_ID y nace en pausa.</p>
        </div>
      </div>

      <div className="space-y-4">
        {families.map(f => {
          const famAdsets = adsets.filter(a => a.meta_campaign_id === f.metaCampaignId)
          const campaign = campaigns.find(c => c.meta_campaign_id === f.metaCampaignId)
          const cbo = Boolean(campaign?.daily_budget && Number(campaign.daily_budget) > 0)
          return (
            <div key={f.key} className={`bg-white border rounded-lg p-4 space-y-3 ${f.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Input value={f.name} onChange={e => patch(f.key, { name: e.target.value })} className="h-9 w-64 font-semibold" />
                <span className="font-mono text-xs text-muted-foreground">{f.key}</span>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.active} onChange={e => patch(f.key, { active: e.target.checked })} />Activa</label>
                <label className="flex items-center gap-1.5 text-sm" title="Al terminar diseño, HUB lanza solo (siempre en pausa)"><input type="checkbox" checked={f.autoLaunch} onChange={e => patch(f.key, { autoLaunch: e.target.checked })} />Lanzar solo al terminar diseño</label>
                <span className="flex-1" />
                <Button size="sm" onClick={() => save(f)} disabled={saving === f.key}>{saving === f.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Guardar</>}</Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="text-sm space-y-1">
                  <span className="text-muted-foreground text-xs">Campaña de Meta</span>
                  <select value={f.metaCampaignId ?? ''} onChange={e => patch(f.key, { metaCampaignId: e.target.value || null, templateAdsetId: null })} className="h-9 w-full rounded border px-2 text-sm">
                    <option value="">Sin campaña</option>
                    {campaigns.map(c => <option key={c.meta_campaign_id} value={c.meta_campaign_id}>{c.name} · {c.status}{c.daily_budget && Number(c.daily_budget) > 0 ? ' · CBO' : ''}</option>)}
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-muted-foreground text-xs">Conjunto plantilla (se copia segmentación, puja y presupuesto)</span>
                  <select value={f.templateAdsetId ?? ''} onChange={e => patch(f.key, { templateAdsetId: e.target.value || null })} className="h-9 w-full rounded border px-2 text-sm" disabled={!f.metaCampaignId}>
                    <option value="">Sin plantilla</option>
                    {famAdsets.map(a => <option key={a.meta_adset_id} value={a.meta_adset_id}>{a.name} · {a.status}{a.daily_budget ? ` · ${Number(a.daily_budget).toLocaleString('es-AR')}/día` : ''}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid sm:grid-cols-4 gap-3">
                <label className="text-sm space-y-1"><span className="text-muted-foreground text-xs">Presupuesto diario del conjunto (centavos){cbo ? ' · la campaña es CBO: se ignora' : ''}</span><Input type="number" value={num(f.dailyBudgetCents)} onChange={e => patch(f.key, { dailyBudgetCents: toNum(e.target.value) })} className="h-9" placeholder="como la plantilla" /></label>
                <label className="text-sm space-y-1"><span className="text-muted-foreground text-xs">Costo por conversación objetivo (USD)</span><Input type="number" step="0.1" value={num(f.targetCpconUsd)} onChange={e => patch(f.key, { targetCpconUsd: toNum(e.target.value) })} className="h-9" /></label>
                <label className="text-sm space-y-1"><span className="text-muted-foreground text-xs">Costo por venta objetivo (USD)</span><Input type="number" step="1" value={num(f.targetCpaUsd)} onChange={e => patch(f.key, { targetCpaUsd: toNum(e.target.value) })} className="h-9" /></label>
                <label className="text-sm space-y-1"><span className="text-muted-foreground text-xs">Máximo de anuncios por conjunto</span><Input type="number" value={String(f.maxActiveAdsPerAdset)} onChange={e => patch(f.key, { maxActiveAdsPerAdset: Number(e.target.value) || 4 })} className="h-9" /></label>
              </div>
              <Input value={f.notes ?? ''} onChange={e => patch(f.key, { notes: e.target.value || null })} className="h-8 text-xs" placeholder="Notas" />
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Los objetivos de costo todavía no frenan nada: los va a usar el autopilot de anuncios (Fase 9). Hoy sirven de referencia en Analytics.</p>
    </div>
  )
}
