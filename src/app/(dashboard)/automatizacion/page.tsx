import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { FlagsPanel } from '@/components/automation/FlagsPanel'
import { getBudgetStatus } from '@/lib/jobs/budget'
import { listHandlers } from '@/lib/jobs/handlers'
import type { JobRow } from '@/lib/jobs/types'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  queued: 'En cola', running: 'Corriendo', done: 'Hechos', failed: 'Fallidos', cancelled: 'Cancelados', skipped: 'Omitidos',
}

const MODE_LABEL: Record<string, string> = { shadow: 'Sombra', semi: 'Semi', auto: 'Auto' }

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Panel del loop: interruptores, modo por módulo, jobs de los últimos 7 días,
 * presupuesto por proveedor y salud de integraciones. Crece con cada fase.
 */
async function loadPanel() {
  const db = createAdminClient()
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [flagsRes, modesRes, jobsRes, healthRes, budgetsRes] = await Promise.all([
    db.from('system_flags').select('*').order('key'),
    db.from('automation_modes').select('*').order('module'),
    db.from('hub_jobs').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500),
    db.from('integration_status').select('*').order('provider'),
    db.from('provider_budgets').select('provider').order('provider'),
  ])

  const jobs = (jobsRes.data ?? []) as JobRow[]
  const byKind = new Map<string, Record<string, number>>()
  for (const job of jobs) {
    const row = byKind.get(job.kind) ?? {}
    row[job.status] = (row[job.status] ?? 0) + 1
    byKind.set(job.kind, row)
  }
  const budgets = await Promise.all((budgetsRes.data ?? []).map(b => getBudgetStatus(db, b.provider as string)))

  return { flags: flagsRes.data ?? [], modes: modesRes.data ?? [], jobs, byKind, health: healthRes.data ?? [], budgets }
}

export default async function AutomatizacionPage() {
  const { authorized } = await checkSectionAccess('automatizacion')
  if (!authorized) redirect('/dashboard')

  const { flags, modes, jobs, byKind, health, budgets } = await loadPanel()
  const handlers = listHandlers()

  return (
    <div className="flex flex-col">
      <Header title="Automatización" />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <FlagsPanel flags={flags} />

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Modo por módulo</h2>
            <p className="text-xs text-gray-500">Sombra registra sin tocar nada · Semi ejecuta y avisa con deshacer · Auto ejecuta solo.</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {modes.map(m => (
              <li key={m.module} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-900">{m.module}</span>
                <span className="text-xs text-gray-500">{MODE_LABEL[m.mode] ?? m.mode} · desde {fmt(m.since)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white lg:col-span-2">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Jobs de los últimos 7 días</h2>
            <p className="text-xs text-gray-500">{jobs.length} jobs · {handlers.length} tipos registrados</p>
          </div>
          {byKind.size === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">Todavía no corrió ningún job.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Tipo</th>
                  {Object.keys(STATUS_LABEL).map(s => <th key={s} className="px-3 py-2 text-right">{STATUS_LABEL[s]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...byKind.entries()].map(([kind, counts]) => (
                  <tr key={kind}>
                    <td className="px-4 py-2 font-medium text-gray-900">{kind}</td>
                    {Object.keys(STATUS_LABEL).map(s => (
                      <td key={s} className={`px-3 py-2 text-right tabular-nums ${s === 'failed' && counts[s] ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                        {counts[s] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {jobs.some(j => j.status === 'failed') && (
            <div className="border-t border-gray-200 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Últimos fallidos</h3>
              <ul className="mt-2 space-y-1 text-xs text-gray-700">
                {jobs.filter(j => j.status === 'failed').slice(0, 10).map(j => (
                  <li key={j.id}><span className="font-mono">#{j.id}</span> {j.kind} · {fmt(j.finished_at)} · <span className="text-red-600">{j.last_error}</span></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Presupuesto por proveedor</h2>
            <p className="text-xs text-gray-500">Al 80 % avisa; al 100 % los jobs de ese proveedor quedan omitidos.</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {budgets.map(b => (
              <li key={b.provider} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-900">{b.provider}</span>
                  <span className={`text-xs font-semibold ${b.exhausted ? 'text-red-600' : b.pct >= b.alertPct ? 'text-amber-600' : 'text-gray-500'}`}>{b.pct}%</span>
                </div>
                <p className="text-xs text-gray-500">hoy {b.spentToday}{b.dailyCap ? ` / ${b.dailyCap}` : ''} · mes {b.spentMonth}{b.monthlyCap ? ` / ${b.monthlyCap}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Salud de integraciones</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {health.map(h => (
              <li key={h.provider} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-900">{h.provider}</span>
                <span className={`text-xs font-semibold ${h.status === 'ok' ? 'text-emerald-700' : h.status === 'unknown' ? 'text-gray-400' : 'text-red-600'}`}>
                  {h.status} · {fmt(h.checked_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
