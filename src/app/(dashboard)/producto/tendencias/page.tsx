import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { Header } from '@/components/layout/Header'
import { RunTrendsButton } from '@/components/tendencias/RunTrendsButton'
import { RunSelector } from '@/components/tendencias/RunSelector'
import { AlertsList } from '@/components/tendencias/AlertsList'
import { TrendsTable } from '@/components/tendencias/TrendsTable'
import { SignalsPanel } from '@/components/tendencias/SignalsPanel'
import { BuzzPanel } from '@/components/tendencias/BuzzPanel'
import { getLatestSignals, getOpenAlerts, getPendingTrendJob, getRun, getRunDestinations, listRuns } from '@/lib/tendencias/queries'

export const dynamic = 'force-dynamic'

const SOURCE_LABEL: Record<string, string> = {
  autocomplete: 'Autocomplete',
  google_related: 'Relacionadas',
  google_trends: 'Google Trends',
  youtube: 'YouTube',
  trending_now: 'Tendencias ahora',
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
}

async function loadPage(runId: string | null) {
  const db = createAdminClient()
  const [run, runs, openAlerts, signals, pendingJob] = await Promise.all([
    getRun(db, runId),
    listRuns(db),
    getOpenAlerts(db),
    getLatestSignals(db),
    getPendingTrendJob(db),
  ])
  const destinations = run ? await getRunDestinations(db, run.id) : []
  return { run, runs, openAlerts, signals, pendingJob, destinations }
}

interface PageProps {
  searchParams: Promise<{ run?: string }>
}

/**
 * Tendencias (Fase 1 del loop): qué destinos buscan los argentinos esta
 * semana según Google y YouTube, cruzado con el catálogo. Sólo demanda de
 * mercado: nada de siviajo.com. La corrida elegida es el filtro de fecha.
 */
export default async function TendenciasPage({ searchParams }: PageProps) {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) redirect('/dashboard')

  const params = await searchParams
  const { run, runs, openAlerts, signals, pendingJob, destinations } = await loadPage(params.run ?? null)
  const weekByRun = Object.fromEntries(runs.map(r => [r.id, r.week_label]))

  const opportunities = destinations.filter(d => d.classification === 'opportunity').length
  const gaps = destinations.filter(d => d.classification === 'gap').length
  const withPackages = destinations.filter(d => d.has_packages).length
  const sources = run ? Object.entries(run.sources_collected ?? {}).filter(([k]) => SOURCE_LABEL[k]) : []

  return (
    <div className="flex flex-col">
      <Header title="Tendencias" />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <RunSelector runs={runs} selectedId={run?.id ?? null} />
            {run && (
              <span className="text-xs text-gray-500">
                {run.status === 'completed' ? `Completada ${fmt(run.completed_at)} en ${Math.round((run.duration_ms ?? 0) / 1000)} s` : run.status === 'failed' ? `Falló: ${run.error}` : 'Corriendo'}
                {sources.length > 0 && ' · '}
                {sources.map(([k, ok]) => (
                  <span key={k} className={ok ? 'text-emerald-700' : 'text-red-600'}>{SOURCE_LABEL[k]}{ok ? ' ✓' : ' ✗'} </span>
                ))}
              </span>
            )}
          </div>
          <RunTrendsButton pending={pendingJob ? { id: pendingJob.id, status: pendingJob.status } : null} />
        </div>

        {!run ? (
          <section className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Todavía no hay ninguna corrida. Corre sola los lunes a las 05:00 (hora Argentina) o con el botón.
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Destinos', value: destinations.length },
              { label: 'Oportunidades', value: opportunities, className: 'text-emerald-700' },
              { label: 'Huecos de catálogo', value: gaps, className: 'text-amber-700' },
              { label: 'Con paquetes', value: withPackages },
              { label: 'Alertas abiertas', value: openAlerts.length, className: openAlerts.some(a => a.severity === 'critical') ? 'text-red-600' : undefined },
            ].map(card => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
                <p className={`text-2xl font-semibold tabular-nums ${card.className ?? 'text-gray-900'}`}>{card.value}</p>
              </div>
            ))}
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Alertas</h2>
            <p className="text-xs text-gray-500">Picos de demanda y destinos que se buscan pero no están en el catálogo. Descartar las cierra; crear la idea llega con la Fase 3.</p>
          </div>
          <AlertsList alerts={openAlerts} weekByRun={weekByRun} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Destinos {run ? `· ${run.week_label}` : ''}</h2>
            <p className="text-xs text-gray-500">Score 0–100 relativo a la corrida: 45 % Google Trends (comparación directa, Argentina, último mes) + 20 % búsquedas relacionadas de “paquetes”, “viajes”, “vuelos”… + 20 % Autocomplete de Google + 10 % YouTube + 5 % tendencias ahora. El momentum compara con la corrida anterior.</p>
          </div>
          <TrendsTable destinations={destinations} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Qué se busca y de qué se habla {run ? `· ${run.week_label}` : ''}</h2>
            <p className="text-xs text-gray-500">Tal cual lo devuelve Google para Argentina. En negrita lo que el sistema reconoció como destino; lo demás igual vale la pena mirarlo.</p>
          </div>
          <BuzzPanel buzz={run?.buzz ?? null} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Señales macro</h2>
            <p className="text-xs text-gray-500">Se actualizan cada lunes junto con la corrida.</p>
          </div>
          <SignalsPanel signals={signals} />
        </section>
      </div>
    </div>
  )
}
