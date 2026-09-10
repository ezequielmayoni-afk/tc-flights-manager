'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Flag {
  key: string
  enabled: boolean
  reason: string | null
  updated_by: string | null
  updated_at: string
}

const LABELS: Record<string, string> = {
  'automation.global': 'Interruptor general',
  'automation.tc_writes': 'Escrituras en Travel Compositor',
  'automation.jsf_writes': 'Guardar idea / recotizar en siviajo.com',
  'automation.meta_writes': 'Escrituras en Meta (crear, pausar, activar)',
  'automation.cotizador_calls': 'Cotizaciones (cotizador-bot)',
  'automation.serpapi_calls': 'Búsquedas en SerpAPI',
  'automation.crm_reads': 'Lectura nocturna del CRM',
  'automation.gsc_writes': 'Envío de sitemaps a Search Console',
  'automation.vuelos_calls': 'vuelos-siviajo (app interna): matrix de precios',
  'automation.flights_sweep': 'Barrido nocturno de vuelos.siviajo.com',
  'automation.sabre_calls': 'Sabre: búsquedas BFM (estimador de vuelos.siviajo.com)',
}

/**
 * Kill switches. Apagar pide motivo: queda en el flag y en los logs, así
 * cuando alguien pregunta "¿por qué no corrió X?" la respuesta está a mano.
 */
export function FlagsPanel({ flags }: { flags: Flag[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(flag: Flag) {
    let reason: string | undefined
    if (flag.enabled) {
      const answer = window.prompt(`Apagar "${LABELS[flag.key] ?? flag.key}". ¿Motivo?`)
      if (answer === null) return
      reason = answer.trim()
      if (!reason) { setError('Para apagar hace falta un motivo'); return }
    }
    setBusy(flag.key)
    setError(null)
    try {
      const res = await fetch('/api/automation/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flag.key, enabled: !flag.enabled, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Interruptores</h2>
        <p className="text-xs text-gray-500">Apagado, los jobs de ese proveedor terminan &quot;omitidos&quot;, nunca fallan. Se prende de vuelta con un clic.</p>
      </div>
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {flags.map(flag => (
          <li key={flag.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{LABELS[flag.key] ?? flag.key}</p>
              <p className="truncate text-xs text-gray-500">
                <code className="text-[11px]">{flag.key}</code>
                {!flag.enabled && flag.reason && <> · {flag.reason}</>}
                {flag.updated_by && <> · {flag.updated_by}</>}
              </p>
            </div>
            <button
              type="button"
              disabled={busy === flag.key}
              onClick={() => toggle(flag)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                flag.enabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
            >
              {flag.enabled ? 'Prendido' : 'Apagado'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
