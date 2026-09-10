'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  slug: string
  origin: string
  /** Sabre/mes de la ruta: en 0 no hay nada para estimar. */
  scanPerMonth: number
  months?: number
}

const MESES = 2

/**
 * "Estimar ahora": encola los `flights.estimate` de la ruta con prioridad manual.
 *
 * El lane `sabre` no tiene ventana horaria, así que corre enseguida. Cada par
 * es una búsqueda BFM que se cobra: por eso son 2 meses y no los 12 de la ruta.
 * Comparte la clave de dedupe con el plan nocturno (ruta + meses + día), así
 * que después de las 00:00 UTC devuelve los que ya estaban encolados.
 */
export function EstimateNowButton({ slug, origin, scanPerMonth, months = MESES }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch('/api/vuelos-baratos/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, origin, months }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; jobs?: Array<{ id: number | null; deduped: boolean }> } | null
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? 'No se pudo encolar la estimación')

      const jobs = body.jobs ?? []
      const nuevos = jobs.filter(j => !j.deduped).length
      toast.success(
        nuevos > 0
          ? `Encolados ${nuevos} jobs de estimación (${months} meses).`
          : `Las estimaciones de hoy para esta ruta ya estaban encoladas.`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo encolar la estimación')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || scanPerMonth <= 0}
      title={scanPerMonth <= 0 ? 'Sabre/mes está en 0: esta ruta no se estima' : `Estima ${months} meses de ${origin} con Sabre (BFM)`}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-[#1A237E] hover:text-[#1A237E] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
    >
      {busy ? 'Encolando…' : 'Estimar ahora'}
    </button>
  )
}
