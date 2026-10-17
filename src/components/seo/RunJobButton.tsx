'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface RunJobButtonProps {
  /** Ruta POST que encola el job (p. ej. `/api/seo/monitor/gsc`). */
  endpoint: string
  label: string
  busyLabel?: string
  title?: string
}

interface EnqueueResponse {
  ok?: boolean
  error?: string
  job?: { id: number | null; deduped: boolean }
}

/**
 * "Correr ahora" genérico de la Fase 14: hace POST al endpoint, que encola el
 * mismo job del cron con prioridad manual y dedupe por día. Dos clics seguidos
 * devuelven el job que ya estaba encolado, y el toast lo dice.
 */
export function RunJobButton({ endpoint, label, busyLabel = 'Encolando…', title }: RunJobButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const body = (await res.json().catch(() => null)) as EnqueueResponse | null
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? `No se pudo encolar: ${label}`)

      toast.success(
        body.job?.deduped ? `${label}: la corrida manual de hoy ya estaba encolada.` : `${label}: encolado, corre en el próximo tick (hasta 1 min).`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `No se pudo encolar: ${label}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={title}
      className="rounded-md border border-[#1A237E] px-2.5 py-1 text-xs font-medium text-[#1A237E] transition-colors hover:bg-[#1A237E] hover:text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-transparent disabled:text-gray-400"
    >
      {busy ? busyLabel : label}
    </button>
  )
}
