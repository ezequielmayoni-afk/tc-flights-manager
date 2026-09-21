'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Send, Tag, X } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Temáticas del paquete: chips editables con las que ya existen en TC como
 * sugerencia. "Guardar" deja `themes_local`; "Enviar a TC" además encola el
 * job que las escribe y verifica.
 */
export function ThemesEditor({ packageId, tcThemes, localThemes, taxonomy, pushedAt, onSaved }: {
  packageId: number
  tcThemes: string[]
  localThemes: string[] | null
  taxonomy: Array<{ name: string; count: number }>
  pushedAt: string | null
  onSaved?: (themes: string[]) => void
}) {
  const [themes, setThemes] = useState<string[]>(localThemes ?? tcThemes)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'save' | 'push' | null>(null)
  const listId = `themes-${packageId}`
  const dirtyVsTc = themes.length !== tcThemes.length || themes.some(t => !tcThemes.includes(t))

  const add = (raw: string) => {
    const t = raw.trim()
    if (!t || themes.includes(t)) { setDraft(''); return }
    setThemes([...themes, t]); setDraft('')
  }

  const save = async (push: boolean) => {
    setBusy(push ? 'push' : 'save')
    try {
      const res = await fetch(`/api/packages/${packageId}/themes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ themes, push }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudieron guardar las temáticas'); return }
      toast.success(push ? (data.deduped ? 'Ya había un envío igual en cola' : 'Temáticas guardadas y enviadas a TC (se verifican al escribir)') : 'Temáticas guardadas en HUB')
      onSaved?.(themes)
    } catch { toast.error('Error de conexión') } finally { setBusy(null) }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        {themes.length === 0 && <span className="text-xs text-muted-foreground">Sin temáticas</span>}
        {themes.map(t => (
          <Badge key={t} variant="secondary" className="gap-1 font-normal">
            {t}
            <button type="button" aria-label={`Quitar ${t}`} onClick={() => setThemes(themes.filter(x => x !== t))} className="hover:text-red-600"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input list={listId} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }} placeholder="Agregar temática (Enter)" className="h-8 max-w-xs text-sm" />
        <datalist id={listId}>{taxonomy.filter(t => !themes.includes(t.name)).map(t => <option key={t.name} value={t.name}>{`${t.count} paquete${t.count === 1 ? '' : 's'}`}</option>)}</datalist>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => add(draft)} disabled={!draft.trim()}><Plus className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => save(false)} disabled={busy !== null}>{busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}</Button>
        <Button type="button" size="sm" className="h-8" onClick={() => save(true)} disabled={busy !== null || !dirtyVsTc} title={dirtyVsTc ? 'Escribe las temáticas en Travel Compositor (job verificado)' : 'TC ya tiene estas temáticas'}>
          {busy === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1" />Enviar a TC</>}
        </Button>
      </div>
      {pushedAt && <p className="text-[11px] text-muted-foreground">Última escritura en TC: {new Date(pushedAt).toLocaleString('es-AR')}</p>}
    </div>
  )
}
