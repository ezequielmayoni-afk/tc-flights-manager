import { setAdsStatus } from '@/lib/meta-ads/pause'
import { createAutoCreativeRequest, type AutoCreativeReason } from '@/lib/marketing/creative-requests'
import { notifyAutomation } from '@/lib/notifications/automation'
import { enqueueJob } from '@/lib/jobs/queue'
import { FLAGS, isFlagEnabled, loadFlags } from '@/lib/jobs/flags'
import { logEvent } from '@/lib/logs'
import type { Db } from '@/lib/jobs/types'

/**
 * Aplica o deshace una decisión de ad_decisions. Lo llaman el guard (en semi
 * y auto), la pantalla de tareas (aprobar / deshacer) y el job
 * ads.apply_decision. Cada acción es reversible salvo el aviso.
 */

export interface AdDecisionRow {
  id: number
  meta_ad_id: string
  meta_ads_row_id: number | null
  package_id: number | null
  tc_package_id: number | null
  rule: string
  action: 'pause' | 'activate' | 'request_creative' | 'alert' | 'redirect' | 'hide_in_tc'
  mode: 'shadow' | 'semi' | 'auto'
  status: 'proposed' | 'approved' | 'applied' | 'rejected' | 'failed' | 'expired' | 'reverted'
  reason: string
  inputs: Record<string, unknown>
  dedupe_key: string | null
  proposed_at: string
  expires_at: string
  decided_by: string | null
  decided_at: string | null
  applied_at: string | null
  applied_result: Record<string, unknown> | null
  reverted_at: string | null
  job_id: number | null
}

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

async function loadDecision(db: Db, id: number): Promise<AdDecisionRow> {
  const { data, error } = await db.from('ad_decisions').select('*').eq('id', id).maybeSingle()
  if (error || !data) throw new Error(`Decisión ${id} no encontrada`)
  return data as AdDecisionRow
}

async function packageTitle(db: Db, packageId: number | null): Promise<string> {
  if (!packageId) return ''
  const { data } = await db.from('packages').select('title').eq('id', packageId).maybeSingle()
  return (data as { title?: string } | null)?.title ?? ''
}

export async function applyDecision(db: Db, decisionId: number, actor: string): Promise<{ ok: boolean; error?: string; result?: Record<string, unknown> }> {
  const d = await loadDecision(db, decisionId)
  if (d.status !== 'proposed' && d.status !== 'approved') return { ok: false, error: `La decisión está ${d.status}` }
  const flags = await loadFlags(db)
  const now = new Date().toISOString()
  const title = await packageTitle(db, d.package_id)
  let result: Record<string, unknown> = {}

  try {
    switch (d.action) {
      case 'pause':
      case 'activate': {
        if (!isFlagEnabled(flags, FLAGS.metaWrites)) throw new Error('Escrituras en Meta apagadas (automation.meta_writes)')
        const r = await setAdsStatus(db, { metaAdIds: [d.meta_ad_id], status: d.action === 'pause' ? 'PAUSED' : 'ACTIVE', reason: `${d.rule}: ${d.reason}`, actor })
        if (r.failed.length > 0) throw new Error(r.failed[0].error)
        result = { updated: r.updated, packages: r.packagesRecounted }
        break
      }
      case 'redirect': {
        const from = d.inputs.fromTcPackageId as number
        const to = d.inputs.toTcPackageId as number
        if (!from || !to) throw new Error('La decisión no tiene origen y destino de redirección')
        await db.from('siv_redirects').update({ active: false, active_until: now, updated_at: now }).eq('from_tc_package_id', from).eq('active', true)
        const { data, error } = await db.from('siv_redirects').insert({
          from_tc_package_id: from,
          to_tc_package_id: to,
          reason: d.rule === 'sold_out' ? 'sold_out' : d.rule === 'expired' ? 'expired' : 'manual',
          note: d.reason,
          created_by: actor,
          ad_decision_id: d.id,
        }).select('id').single()
        if (error) throw new Error(error.message)
        result = { redirectId: (data as { id: number }).id, from, to }
        break
      }
      case 'request_creative': {
        if (!d.package_id || !d.tc_package_id) throw new Error('La decisión no tiene paquete')
        const reason = (d.inputs.creativeReason as AutoCreativeReason | undefined) ?? 'price_change'
        const r = await createAutoCreativeRequest(db, {
          packageId: d.package_id,
          tcPackageId: d.tc_package_id,
          packageTitle: title,
          reason,
          reasonDetail: d.reason,
          triggerKey: d.dedupe_key ?? `decision:${d.id}`,
          priority: reason === 'sold_out_departure' ? 'urgent' : 'normal',
          adDecisionId: d.id,
        })
        result = { creativeRequestId: r.id, created: r.created }
        break
      }
      case 'hide_in_tc': {
        if (!isFlagEnabled(flags, FLAGS.tcWrites)) throw new Error('Escrituras en TC apagadas (automation.tc_writes)')
        const job = await enqueueJob(db, {
          kind: 'tc.write',
          payload: { op: 'deactivate', packageId: d.package_id, tcPackageId: d.tc_package_id, decisionId: d.id, reason: d.reason },
          dedupeKey: `tc.write:deactivate:${d.tc_package_id}`,
          entityType: 'package',
          entityId: d.package_id ?? undefined,
          createdBy: actor,
        })
        result = { jobId: job.id, deduped: job.deduped }
        break
      }
      case 'alert': {
        const r = await notifyAutomation(db, {
          type: `guard_${d.rule}`,
          title: `Guard: ${d.rule === 'underperforming' ? 'anuncio con bajo rendimiento' : 'revisar cupo agotado'} · SIV ${d.tc_package_id ?? '-'}`,
          lines: [title, d.reason],
          packageId: d.package_id,
          metaAdId: d.meta_ad_id !== 'package' ? d.meta_ad_id : null,
          dedupeKey: d.dedupe_key ?? undefined,
          dedupeHours: 24 * 7,
          level: 'warning',
          url: `${SYSTEM_URL}/tareas`,
          data: { decisionId: d.id, rule: d.rule },
        })
        result = { notified: r.ok, skipped: r.skipped ?? null }
        break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.from('ad_decisions').update({ status: 'failed', applied_result: { error: message }, decided_by: d.decided_by ?? actor, decided_at: d.decided_by ? undefined : now, updated_at: now }).eq('id', d.id)
    await logEvent(db, { source: 'automation', action: 'guard.apply_failed', level: 'error', message: `No se pudo aplicar la decisión #${d.id} (${d.rule} → ${d.action}): ${message}`, entityType: 'package', entityId: d.package_id ?? undefined, details: { decisionId: d.id, rule: d.rule, action: d.action } }, null)
    return { ok: false, error: message }
  }

  await db.from('ad_decisions').update({ status: 'applied', applied_at: now, applied_result: result, decided_by: d.decided_by ?? actor, decided_at: d.decided_at ?? now, updated_at: now }).eq('id', d.id)
  await logEvent(db, {
    source: 'automation',
    action: `guard.${d.action}`,
    message: `${d.rule} → ${d.action}${d.meta_ad_id !== 'package' ? ` (anuncio ${d.meta_ad_id})` : ''}: ${d.reason}`,
    entityType: 'package',
    entityId: d.package_id ?? undefined,
    entityLabel: d.tc_package_id ? `${d.tc_package_id} · ${title}` : undefined,
    details: { decisionId: d.id, mode: d.mode, actor, result },
  }, null)

  if (d.action !== 'alert' && d.action !== 'request_creative') {
    await notifyAutomation(db, {
      type: 'guard_applied',
      title: `Guard: ${d.action === 'pause' ? 'anuncio pausado' : d.action === 'activate' ? 'anuncio reactivado' : d.action === 'redirect' ? 'SIV redirigido' : 'paquete a ocultar en TC'} · SIV ${d.tc_package_id ?? '-'}`,
      lines: [title, d.reason, `Modo ${d.mode}. Se puede deshacer desde Tareas.`],
      packageId: d.package_id,
      metaAdId: d.meta_ad_id !== 'package' ? d.meta_ad_id : null,
      dedupeKey: `applied:${d.id}`,
      level: d.action === 'pause' ? 'warning' : 'info',
      url: `${SYSTEM_URL}/tareas`,
      data: { decisionId: d.id, rule: d.rule, action: d.action },
    })
  }
  return { ok: true, result }
}

export async function revertDecision(db: Db, decisionId: number, actor: string): Promise<{ ok: boolean; error?: string; note?: string }> {
  const d = await loadDecision(db, decisionId)
  if (d.status !== 'applied') return { ok: false, error: `Sólo se deshace una decisión aplicada (está ${d.status})` }
  const now = new Date().toISOString()
  let note: string | undefined
  try {
    switch (d.action) {
      case 'pause': {
        const r = await setAdsStatus(db, { metaAdIds: [d.meta_ad_id], status: 'ACTIVE', reason: `deshacer #${d.id}`, actor })
        if (r.failed.length > 0) throw new Error(r.failed[0].error)
        break
      }
      case 'activate': {
        const r = await setAdsStatus(db, { metaAdIds: [d.meta_ad_id], status: 'PAUSED', reason: `deshacer #${d.id}`, actor })
        if (r.failed.length > 0) throw new Error(r.failed[0].error)
        break
      }
      case 'redirect': {
        const redirectId = d.applied_result?.redirectId as number | undefined
        if (redirectId) await db.from('siv_redirects').update({ active: false, active_until: now, updated_at: now }).eq('id', redirectId)
        break
      }
      case 'request_creative': {
        const requestId = d.applied_result?.creativeRequestId as number | undefined
        if (requestId) await db.from('creative_requests').update({ status: 'cancelled', rejection_reason: `deshecho por ${actor}` }).eq('id', requestId).in('status', ['pending', 'in_progress'])
        break
      }
      case 'hide_in_tc': {
        note = 'Ocultar en TC no se deshace solo: reactivá el paquete desde la tabla de paquetes (acción "Visible").'
        break
      }
      case 'alert':
        break
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  await db.from('ad_decisions').update({ status: 'reverted', reverted_by: actor, reverted_at: now, updated_at: now }).eq('id', d.id)
  await logEvent(db, { source: 'automation', action: 'guard.reverted', message: `Deshecha la decisión #${d.id} (${d.rule} → ${d.action})${note ? `. ${note}` : ''}`, entityType: 'package', entityId: d.package_id ?? undefined, details: { decisionId: d.id, actor } }, null)
  return { ok: true, note }
}

export async function rejectDecision(db: Db, decisionId: number, actor: string, reason?: string): Promise<void> {
  const now = new Date().toISOString()
  await db.from('ad_decisions').update({ status: 'rejected', decided_by: actor, decided_at: now, applied_result: reason ? { rejectedReason: reason } : null, updated_at: now }).eq('id', decisionId).in('status', ['proposed', 'approved'])
}
