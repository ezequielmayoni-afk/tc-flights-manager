'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  /** Estado del job en cola o corriendo, si hay. */
  pending: { id: number; status: string } | null
}

/** "Correr ahora": encola trend.run + demand.signals con prioridad manual. */
export function RunTrendsButton({ pending }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/tendencias/run', { method: 'POST' })
      const body = await res.json() as { ok?: boolean; error?: string; trend?: { id: number | null; deduped: boolean } }
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'No se pudo encolar')
      setMessage(body.trend?.deduped ? `Ya había una corrida en cola (job #${body.trend.id})` : `Encolada (job #${body.trend?.id}). Corre en el próximo minuto y tarda ~1 minuto.`)
      router.refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {pending && (
        <span className="text-xs text-amber-700">
          {pending.status === 'running' ? 'Corriendo ahora' : 'En cola'} · job #{pending.id}
        </span>
      )}
      <button
        onClick={run}
        disabled={busy || Boolean(pending)}
        className="rounded-md bg-[#1A237E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#283593] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Encolando…' : 'Correr ahora'}
      </button>
      {message && <span className="text-xs text-gray-600">{message}</span>}
    </div>
  )
}
