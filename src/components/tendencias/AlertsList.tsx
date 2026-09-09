'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TrendAlertRow } from '@/lib/tendencias/queries'

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-200 bg-red-50',
  warning: 'border-amber-200 bg-amber-50',
  info: 'border-gray-200 bg-gray-50',
}
const SEVERITY_LABEL: Record<string, string> = { critical: 'Crítica', warning: 'Atención', info: 'Info' }
const TYPE_LABEL: Record<string, string> = {
  demand_spike: 'Demanda',
  competitor_gap: 'Hueco de catálogo',
  disaster: 'Desastre',
  event: 'Evento',
  price_drop: 'Precio',
}

/**
 * Alertas abiertas con "Descartar". "Crear idea" se habilita en la Fase 3,
 * cuando exista package_ideas.
 */
export function AlertsList({ alerts, weekByRun }: { alerts: TrendAlertRow[]; weekByRun: Record<string, string> }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function dismiss(alert: TrendAlertRow) {
    setBusy(alert.id)
    setError(null)
    try {
      const res = await fetch(`/api/tendencias/alerts/${alert.id}/dismiss`, { method: 'POST' })
      const body = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'No se pudo descartar')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  if (alerts.length === 0) {
    return <p className="px-4 py-6 text-sm text-gray-500">No hay alertas abiertas.</p>
  }

  return (
    <div className="space-y-2 p-4">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {alerts.map(alert => {
        const buyQueries = (alert.data?.buyQueries as string[] | undefined) ?? []
        return (
          <div key={alert.id} className={`rounded-md border px-3 py-2 ${SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold uppercase tracking-wide">{SEVERITY_LABEL[alert.severity] ?? alert.severity}</span>
                  <span>·</span>
                  <span>{TYPE_LABEL[alert.alert_type] ?? alert.alert_type}</span>
                  {weekByRun[alert.trend_run_id] && (<><span>·</span><span>{weekByRun[alert.trend_run_id]}</span></>)}
                </div>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{alert.title}</p>
                {alert.description && <p className="text-xs text-gray-700">{alert.description}</p>}
                {buyQueries.length > 0 && (
                  <p className="mt-1 text-xs text-gray-600">Buscan: {buyQueries.join(' · ')}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(alert)}
                disabled={busy === alert.id}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {busy === alert.id ? '…' : 'Descartar'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
