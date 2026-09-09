'use client'

import { useCallback, useEffect, useState } from 'react'

interface Decision {
  id: number
  meta_ad_id: string
  rule: string
  action: string
  mode: string
  status: string
  reason: string
  inputs: Record<string, unknown>
  proposed_at: string
  applied_at: string | null
  applied_result: Record<string, unknown> | null
  decided_by: string | null
  packages: { id: number; tc_package_id: number; title: string; status: string; tc_active: boolean; departure_date: string | null } | null
  ad: { ad_name: string | null; variant: number | null; status: string; thumbnail_url: string | null } | null
}

const RULE_LABEL: Record<string, string> = {
  expired: 'Paquete vencido', not_visible: 'Paquete no visible', tc_inactive: 'Inactivo en TC', sold_out: 'Cupo agotado',
  sold_out_unconfirmed: 'Cupo agotado (vínculo sin confirmar)', price_drift: 'Precio distinto al de la creatividad', underperforming: 'Bajo rendimiento',
}
const ACTION_LABEL: Record<string, string> = {
  pause: 'Pausar anuncio', activate: 'Reactivar anuncio', redirect: 'Redirigir SIV a la siguiente salida', request_creative: 'Pedir creatividad nueva', alert: 'Avisar', hide_in_tc: 'Ocultar en TC',
}
const STATUS_LABEL: Record<string, string> = { proposed: 'Propuesta', approved: 'Aprobada', applied: 'Aplicada', rejected: 'Rechazada', failed: 'Falló', expired: 'Vencida', reverted: 'Deshecha' }
const MODE_LABEL: Record<string, string> = { shadow: 'sombra: sólo propone', semi: 'semi: aplica lo seguro y avisa', auto: 'auto' }

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—'
}

/**
 * Decisiones del guard de marketing: lo que haría (sombra), lo que hizo
 * (semi/auto) y los botones para aprobar, rechazar o deshacer.
 */
export function AdDecisionsSection({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [open, setOpen] = useState<Decision[]>([])
  const [recent, setRecent] = useState<Decision[]>([])
  const [mode, setMode] = useState<string>('shadow')
  const [busy, setBusy] = useState<number | 'run' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([
        fetch('/api/marketing/decisions?status=open').then(r => r.json()),
        fetch('/api/marketing/decisions?status=applied&limit=30').then(r => r.json()),
      ])
      setOpen(o.decisions ?? [])
      setRecent(a.decisions ?? [])
      setMode(o.mode?.mode ?? 'shadow')
      onCountChange?.((o.decisions ?? []).length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => { void load() }, [load])

  async function act(id: number, action: 'approve' | 'reject' | 'revert') {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/decisions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const body = await res.json()
      if (!res.ok || body.ok === false) throw new Error(body.error ?? 'No se pudo')
      if (body.note) setError(body.note)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  async function runNow() {
    setBusy('run')
    setError(null)
    try {
      const res = await fetch('/api/marketing/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run' }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo')
      setError(`Guard encolado (job #${body.job?.id}). Recargá en un minuto.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const row = (d: Decision, kind: 'open' | 'recent') => {
    const p = d.packages
    const isAd = d.meta_ad_id !== 'package'
    return (
      <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="font-semibold uppercase tracking-wide text-gray-700">{RULE_LABEL[d.rule] ?? d.rule}</span>
            <span>·</span>
            <span>{ACTION_LABEL[d.action] ?? d.action}</span>
            <span>·</span>
            <span>{STATUS_LABEL[d.status] ?? d.status}</span>
            <span>·</span>
            <span>{fmt(kind === 'open' ? d.proposed_at : d.applied_at)}</span>
            {d.decided_by && <span>· por {d.decided_by}</span>}
          </div>
          <p className="mt-0.5 font-medium text-gray-900">
            {p ? <>SIV {p.tc_package_id} · {p.title}</> : `Decisión #${d.id}`}
            {isAd && d.ad ? <span className="ml-2 text-xs font-normal text-gray-500">anuncio {d.ad.ad_name ?? d.meta_ad_id}{d.ad.variant ? ` · v${d.ad.variant}` : ''} · {d.ad.status}</span> : isAd ? <span className="ml-2 text-xs font-normal text-gray-500">anuncio {d.meta_ad_id}</span> : null}
          </p>
          <p className="text-xs text-gray-700">{d.reason}</p>
          {d.status === 'failed' && d.applied_result?.error ? <p className="text-xs text-red-600">{String(d.applied_result.error)}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {kind === 'open' && (
            <>
              <button onClick={() => act(d.id, 'approve')} disabled={busy === d.id} className="rounded-md bg-[#1A237E] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#283593] disabled:opacity-50">Aplicar</button>
              <button onClick={() => act(d.id, 'reject')} disabled={busy === d.id} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50">Rechazar</button>
            </>
          )}
          {kind === 'recent' && d.status === 'applied' && d.action !== 'alert' && (
            <button onClick={() => act(d.id, 'revert')} disabled={busy === d.id} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50">Deshacer</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Guard de marketing</h2>
          <p className="text-xs text-gray-500">Modo {MODE_LABEL[mode] ?? mode}. Anuncios de paquetes vencidos, no visibles o con cupo agotado; precio distinto al de la creatividad; bajo rendimiento.</p>
        </div>
        <button onClick={runNow} disabled={busy === 'run'} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50">{busy === 'run' ? 'Encolando…' : 'Revisar ahora'}</button>
      </div>
      {error && <p className="px-4 py-2 text-xs text-amber-700">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-gray-500">Cargando…</p>
      ) : (
        <>
          <div>
            <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Esperando decisión ({open.length})</h3>
            {open.length === 0 ? <p className="px-4 py-4 text-sm text-gray-500">Nada pendiente.</p> : open.map(d => row(d, 'open'))}
          </div>
          <div className="border-t border-gray-200">
            <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Aplicadas recientemente</h3>
            {recent.length === 0 ? <p className="px-4 py-4 text-sm text-gray-500">Todavía no se aplicó ninguna.</p> : recent.map(d => row(d, 'recent'))}
          </div>
        </>
      )}
    </div>
  )
}
