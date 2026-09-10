'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

/**
 * "Sincronizar Search Console": encola el mismo `gsc.vuelos_sync` del cron
 * diario con prioridad manual.
 *
 * El lane `gsc` no tiene ventana horaria, así que corre en el próximo tick del
 * runner (hasta un minuto). Gasta de la cuota diaria de la propiedad (100
 * llamadas; una corrida son ~23), por eso dedupea por día: dos clics seguidos
 * devuelven el job que ya estaba encolado.
 */
export function GscSyncButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch('/api/vuelos-baratos/gsc-sync', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; job?: { id: number | null; deduped: boolean } } | null
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? 'No se pudo encolar la sincronización')

      toast.success(
        body.job?.deduped
          ? 'La sincronización manual de hoy ya estaba encolada.'
          : 'Sincronización encolada: corre en el próximo tick (hasta 1 min).'
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo encolar la sincronización')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Reenvía el sitemap, trae clics e impresiones e inspecciona hasta 20 URLs (~23 llamadas de la cuota diaria)"
      className="rounded-md border border-[#1A237E] px-2.5 py-1 text-xs font-medium text-[#1A237E] transition-colors hover:bg-[#1A237E] hover:text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-transparent disabled:text-gray-400"
    >
      {busy ? 'Encolando…' : 'Sincronizar Search Console'}
    </button>
  )
}
