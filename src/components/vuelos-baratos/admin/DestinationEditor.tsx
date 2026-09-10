'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface DestinationFormValues {
  code: string
  name: string
  slug: string
  tc_code: string
  iata_display: string | null
  haul: 'short' | 'medium' | 'long'
  seo_title: string | null
  seo_description: string | null
  hero_image_url: string | null
  faq: Array<{ q: string; a: string }>
  active: boolean
  sort_order: number
}

interface ProfileOption { code: string; name: string; family: string; tc_destination_code: string | null; iata_airport: string | null }

const EMPTY: DestinationFormValues = { code: '', name: '', slug: '', tc_code: '', iata_display: null, haul: 'long', seo_title: null, seo_description: null, hero_image_url: null, faq: [], active: false, sort_order: 100 }
const inputCls = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900'

const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
/** Distancia por familia del perfil: sólo un punto de partida, se corrige a mano. */
const HAUL_BY_FAMILY: Record<string, DestinationFormValues['haul']> = { argentina: 'short', brasil: 'short', sudamerica: 'short', caribe: 'long', usa: 'long', europa: 'long', medio_oriente_asia: 'long' }

/**
 * Alta y edición de un destino de vuelos.siviajo.com. En el alta el código es
 * un perfil de `destination_profiles` que todavía no tiene landing: la landing
 * es una extensión 1:1 del perfil, por eso no se inventa un código nuevo acá.
 */
export function DestinationEditor({ mode, initial, existingCodes, onClose }: { mode: 'create' | 'edit'; initial?: DestinationFormValues; existingCodes: string[]; onClose: () => void }) {
  const router = useRouter()
  const [v, setV] = useState<DestinationFormValues>(initial ?? EMPTY)
  const [faqText, setFaqText] = useState(JSON.stringify(initial?.faq ?? [], null, 2))
  const [withBue, setWithBue] = useState(true)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'create') return
    fetch('/api/producto/perfiles')
      .then(r => r.json())
      .then((body: { profiles?: ProfileOption[] }) => setProfiles((body.profiles ?? []).filter(p => !existingCodes.includes(p.code))))
      .catch(() => setError('No se pudieron cargar los perfiles de destino'))
  }, [mode, existingCodes])

  function pickProfile(code: string) {
    const p = profiles.find(x => x.code === code)
    if (!p) return setV({ ...v, code })
    setV({ ...v, code, name: p.name, slug: v.slug || slugify(p.name), tc_code: v.tc_code || p.tc_destination_code || '', iata_display: v.iata_display ?? p.iata_airport ?? null, haul: HAUL_BY_FAMILY[p.family] ?? v.haul })
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      let faq: DestinationFormValues['faq']
      try {
        faq = JSON.parse(faqText || '[]')
        if (!Array.isArray(faq) || faq.some(f => typeof f?.q !== 'string' || typeof f?.a !== 'string')) throw new Error()
      } catch { throw new Error('FAQ: tiene que ser una lista JSON de {"q": "...", "a": "..."}') }
      const payload = { slug: v.slug.trim(), tc_code: v.tc_code.trim().toUpperCase(), iata_display: v.iata_display?.trim().toUpperCase() || null, haul: v.haul, seo_title: v.seo_title, seo_description: v.seo_description, hero_image_url: v.hero_image_url, faq, active: v.active, sort_order: v.sort_order }
      const res = mode === 'create'
        ? await fetch('/api/vuelos-baratos/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, code: v.code, with_bue_route: withBue }) })
        : await fetch(`/api/vuelos-baratos/destinations/${v.code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar')
      toast.success(mode === 'create' ? `${v.name || v.code}: destino creado` : `${v.name}: guardado`)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, node: React.ReactNode, span = 1) => <label className={`text-xs text-gray-600 ${span === 2 ? 'sm:col-span-2' : ''}`}>{label}{node}</label>

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nuevo destino en vuelos.siviajo.com' : `Editar ${v.name}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'El destino sale de un perfil de Producto. Nace sin publicar y con la ruta BUE apagada.' : 'Cambiar el slug cambia la URL pública de la landing.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === 'create'
            ? field('Perfil de destino', (
                <select className={inputCls} value={v.code} onChange={e => pickProfile(e.target.value)}>
                  <option value="">Elegí un perfil…</option>
                  {profiles.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                </select>
              ), 2)
            : field('Código', <input className={inputCls} value={v.code} disabled />)}
          {field('Slug (URL)', <input className={inputCls} value={v.slug} placeholder="punta-cana" onChange={e => setV({ ...v, slug: e.target.value })} />)}
          {field('Código destino TC', <input className={inputCls} value={v.tc_code} placeholder="PUJ" onChange={e => setV({ ...v, tc_code: e.target.value.toUpperCase() })} />)}
          {field('IATA para mostrar', <input className={inputCls} value={v.iata_display ?? ''} maxLength={3} placeholder="PUJ" onChange={e => setV({ ...v, iata_display: e.target.value.toUpperCase() || null })} />)}
          {field('Distancia', (
            <select className={inputCls} value={v.haul} onChange={e => setV({ ...v, haul: e.target.value as DestinationFormValues['haul'] })}>
              <option value="short">Corta (4/7 noches)</option>
              <option value="medium">Media (5/7/10 noches)</option>
              <option value="long">Larga (7/10/14 noches)</option>
            </select>
          ))}
          {field('Orden en la landing', <input type="number" min={0} className={inputCls} value={v.sort_order} onChange={e => setV({ ...v, sort_order: Number(e.target.value) })} />)}
          {field('Título SEO', <input className={inputCls} value={v.seo_title ?? ''} maxLength={200} onChange={e => setV({ ...v, seo_title: e.target.value || null })} />, 2)}
          {field('Descripción SEO', <textarea className={inputCls} rows={2} maxLength={400} value={v.seo_description ?? ''} onChange={e => setV({ ...v, seo_description: e.target.value || null })} />, 2)}
          {field('Imagen de portada (URL)', <input className={inputCls} value={v.hero_image_url ?? ''} onChange={e => setV({ ...v, hero_image_url: e.target.value || null })} />, 2)}
          {field('FAQ (JSON)', <textarea className={`${inputCls} font-mono text-xs`} rows={4} value={faqText} onChange={e => setFaqText(e.target.value)} />, 2)}
          <div className="flex flex-wrap gap-4 text-xs text-gray-700 sm:col-span-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /> Publicado en la landing</label>
            {mode === 'create' && <label className="flex items-center gap-1"><input type="checkbox" checked={withBue} onChange={e => setWithBue(e.target.checked)} /> Crear la ruta desde Buenos Aires (apagada)</label>}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={save} disabled={busy || !v.code || !v.slug.trim() || !v.tc_code.trim()} className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593] disabled:opacity-50">
            {busy ? 'Guardando…' : mode === 'create' ? 'Crear destino' : 'Guardar cambios'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
