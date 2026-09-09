'use client'

import { useRouter } from 'next/navigation'

interface RunOption {
  id: string
  week_label: string
  status: string
  trigger: string
  created_at: string
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
}

/** Elegir qué corrida mirar (la fecha es el filtro de esta pantalla). */
export function RunSelector({ runs, selectedId }: { runs: RunOption[]; selectedId: string | null }) {
  const router = useRouter()
  return (
    <select
      value={selectedId ?? ''}
      onChange={e => router.push(e.target.value ? `/producto/tendencias?run=${e.target.value}` : '/producto/tendencias')}
      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
    >
      {runs.length === 0 && <option value="">Sin corridas</option>}
      {runs.map(r => (
        <option key={r.id} value={r.id}>
          {r.week_label} · {fmt(r.created_at)} · {r.trigger === 'cron' ? 'automática' : 'manual'}{r.status !== 'completed' ? ` · ${r.status === 'failed' ? 'falló' : 'corriendo'}` : ''}
        </option>
      ))}
    </select>
  )
}
