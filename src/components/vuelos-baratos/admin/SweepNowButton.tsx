'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  slug: string
  origin: string
  /** Jobs de esta ruta ya en cola o corriendo: encolar de nuevo no haría nada. */
  pendingJobs: number
  months?: number
}

const MESES = 3

/**
 * "Barrer ahora": encola los `flights.sweep` de la ruta con prioridad manual.
 *
 * Salta la ventana nocturna del lane `cotizador`, así que de día compite con
 * el bot del CRM por el único worker del cotizador: es para probar una ruta
 * antes de publicarla, no para refrescar precios a mano todos los días.
 */
export function SweepNowButton({ slug, origin, pendingJobs, months = MESES }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch('/api/vuelos-baratos/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, origin, months }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; jobs?: Array<{ id: number | null; deduped: boolean }> } | null
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? 'No se pudo encolar el barrido')

      const jobs = body.jobs ?? []
      const nuevos = jobs.filter(j => !j.deduped).length
      toast.success(
        nuevos > 0
          ? `Encolado ${nuevos} jobs. De día compite con el bot del CRM.`
          : `Los ${jobs.length} jobs de esta noche ya estaban encolados.`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo encolar el barrido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || pendingJobs > 0}
      title={pendingJobs > 0 ? `${pendingJobs} jobs de esta ruta ya están en cola` : `Sondea ${months} meses de ${origin} con prioridad manual`}
      className="rounded-md border border-[#1A237E] px-2.5 py-1 text-xs font-medium text-[#1A237E] transition-colors hover:bg-[#1A237E] hover:text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-transparent disabled:text-gray-400"
    >
      {busy ? 'Encolando…' : pendingJobs > 0 ? `${pendingJobs} en cola` : 'Barrer ahora'}
    </button>
  )
}
