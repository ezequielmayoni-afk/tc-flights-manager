import { NextResponse } from 'next/server'
import { checkAndSendManualQuoteNotifications } from '@/lib/notifications/manual-quote'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'
export const maxDuration = 3600

/** Cada cuánto se mira la cola mientras el cotizador trabaja. */
const POLL_MS = 4000
/** Tope de espera del stream: 18 paquetes × ~75 s entran de sobra. */
const MAX_WAIT_MS = 40 * 60 * 1000

interface JobRow { id: number; status: string; payload: { packageId?: number }; result: Record<string, unknown> | null; last_error: string | null }

/**
 * POST /api/requote/run — recotiza ahora los paquetes monitoreados con el
 * cotizador (job `package.requote`, prioridad manual) y va contando el
 * avance por SSE, con los mismos eventos que leía la tabla cuando esto
 * lanzaba el tc-requote-bot de Playwright.
 *
 * Body opcional: { packageIds: number[] }. Sin ids, todos los monitoreados.
 */
export async function POST(request: Request) {
  const { authorized, user } = await checkSectionAccess('requote')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let packageIds: number[] = []
  try {
    const body = await request.json()
    if (Array.isArray(body?.packageIds)) packageIds = body.packageIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
  } catch {
    // sin body: todos los monitoreados
  }

  try {
    const db = createAdminClient()
    let query = db.from('packages').select('id, tc_package_id, title').eq('monitor_enabled', true).eq('tc_active', true).order('id')
    if (packageIds.length > 0) query = query.in('id', packageIds)
    const { data } = await query
    const rows = (data ?? []) as Array<{ id: number; tc_package_id: number; title: string }>
    const cupos = await getCupoPackageIds(db, rows.map(r => r.id))
    const targets = rows.filter(r => !cupos.has(r.id))
    const byId = new Map(targets.map(r => [r.id, r]))

    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const send = async (type: string, payload: Record<string, unknown>) => { await writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`)) }

    const run = async () => {
      const startedAt = Date.now()
      try {
        if (targets.length === 0) {
          await send('status', { message: cupos.size > 0 ? 'Sólo hay paquetes de cupo: el aéreo de contrato no se recotiza' : 'No hay paquetes monitoreados', stage: 'no_packages' })
          await send('complete', { success: true, summary: { processed: 0, success: 0, errors: 0, needsManual: 0, autoUpdated: 0, noChange: 0, duration: '0s', packages: [] } })
          return
        }
        const jobIds: number[] = []
        for (const r of targets) {
          const dedupeKey = `package.requote:manual:${r.id}`
          const res = await enqueueJob(db, { kind: 'package.requote', payload: { packageId: r.id, trigger: 'manual' }, priority: MANUAL_PRIORITY, dedupeKey, entityType: 'package', entityId: r.id, createdBy: user?.email ?? 'ui' })
          if (res.id !== null) { jobIds.push(res.id); continue }
          // Ya había uno en cola para este paquete (doble clic): se sigue ese.
          const { data: existing } = await db.from('hub_jobs').select('id').eq('dedupe_key', dedupeKey).in('status', ['queued', 'running']).order('id', { ascending: false }).limit(1).maybeSingle()
          const existingId = (existing as { id: number } | null)?.id
          if (existingId) jobIds.push(existingId)
        }
        await send('status', { message: `${targets.length} paquete(s) en la cola del cotizador${cupos.size > 0 ? ` (${cupos.size} de cupo salteados)` : ''}. Cada uno tarda alrededor de un minuto.`, stage: 'queued', total: targets.length })

        const summary = { processed: 0, success: 0, errors: 0, needsManual: 0, autoUpdated: 0, noChange: 0, duration: '0s', packages: [] as Array<{ id: number; tcId: number; title: string; status: string; variance?: string }> }
        const seenRunning = new Set<number>()
        const finished = new Set<number>()
        while (finished.size < jobIds.length && Date.now() - startedAt < MAX_WAIT_MS) {
          await new Promise(r => setTimeout(r, POLL_MS))
          const { data: jobs } = await db.from('hub_jobs').select('id, status, payload, result, last_error').in('id', jobIds)
          for (const job of (jobs ?? []) as JobRow[]) {
            const pkg = byId.get(Number(job.payload?.packageId))
            if (!pkg) continue
            if (job.status === 'running' && !seenRunning.has(job.id)) {
              seenRunning.add(job.id)
              await send('package_start', { id: pkg.id, tcId: pkg.tc_package_id })
              await send('package_info', { id: pkg.id, title: pkg.title })
              await send('package_status', { message: 'Cotizando la misma combinación en siviajo.com…' })
            }
            if (finished.has(job.id) || !['done', 'failed', 'skipped', 'cancelled'].includes(job.status)) continue
            finished.add(job.id)
            summary.processed++
            const r = job.result ?? {}
            const variancePct = typeof r.variancePct === 'number' ? r.variancePct : null
            const variance = variancePct === null ? undefined : `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%`
            let status = 'error'
            let message = job.last_error ?? String(r.note ?? '')
            if (job.status === 'done' && r.skipped) { status = 'skipped'; message = String(r.skipped) }
            else if (job.status === 'done' && r.status === 'needs_manual') { status = 'needs_manual'; summary.needsManual++; summary.success++ }
            else if (job.status === 'done' && r.status === 'completed') { status = 'completed'; summary.noChange++; summary.success++ }
            else if (job.status === 'skipped') { status = 'skipped' }
            else summary.errors++
            if (variance) await send('package_variance', { id: pkg.id, variance })
            summary.packages.push({ id: pkg.id, tcId: pkg.tc_package_id, title: pkg.title, status, variance })
            await send('package_done', { id: pkg.id, status, title: pkg.title, variance, message })
          }
        }
        summary.duration = `${Math.round((Date.now() - startedAt) / 1000)}s`
        const pending = jobIds.length - finished.size
        if (pending > 0) await send('status', { message: `${pending} paquete(s) siguen en la cola; el resultado queda en la tabla cuando terminen`, stage: 'timeout' })
        if (summary.needsManual > 0) {
          try { await checkAndSendManualQuoteNotifications() } catch (err) { console.error('[Requote Run] notificación', err) }
        }
        await send('complete', { success: true, summary })
      } catch (err) {
        await send('error', { message: err instanceof Error ? err.message : 'Error al recotizar' })
      } finally {
        await writer.close()
      }
    }
    void run()

    return new Response(stream.readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
  } catch (error) {
    return errorResponse(error)
  }
}
