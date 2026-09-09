import { activatePackage, deactivatePackage, getPackageInfo, updatePackageThemes } from '@/lib/travelcompositor/client'
import { recordExternalCall } from '../budget'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Toda escritura en Travel Compositor pasa por acá: con flag, con dedupe y
 * con verificación posterior (GET) guardada en el resultado.
 * ops: deactivate | activate | themes
 */
export const tcWriteHandler: HandlerDefinition = {
  kind: 'tc.write',
  lane: 'tc',
  flags: [FLAGS.tcWrites],
  provider: 'tc_write',
  description: 'Escritura verificada en TC: desactivar, activar o cambiar temáticas de un paquete',
  handler: async ({ db, job, log }) => {
    const op = String(job.payload.op ?? '')
    const tcPackageId = Number(job.payload.tcPackageId)
    const packageId = Number(job.payload.packageId) || null
    if (!tcPackageId || !['deactivate', 'activate', 'themes'].includes(op)) return { ok: false, error: 'payload inválido: op y tcPackageId', retry: false }

    const started = Date.now()
    let write: { success: boolean; error?: string; before?: string[] }
    if (op === 'deactivate') write = await deactivatePackage(tcPackageId)
    else if (op === 'activate') write = await activatePackage(tcPackageId)
    else write = await updatePackageThemes(tcPackageId, Array.isArray(job.payload.themes) ? (job.payload.themes as string[]) : [])
    await recordExternalCall(db, { provider: 'tc_write', endpoint: `package.${op}`, status: write.success ? 'ok' : 'error', durationMs: Date.now() - started, jobId: job.id })
    if (!write.success) return { ok: false, error: write.error ?? 'TC falló', retry: true }

    // Verificación: lo que TC dice después de escribir.
    let verified: Record<string, unknown> = {}
    try {
      const info = await getPackageInfo(tcPackageId)
      const expectedActive = op === 'deactivate' ? false : op === 'activate' ? true : undefined
      verified = { active: info.active, themes: info.themes ?? null, matches: expectedActive === undefined ? true : info.active === expectedActive }
      if (packageId) {
        const patch: Record<string, unknown> = { tc_active: info.active, tc_state_checked_at: new Date().toISOString(), tc_state_mismatch: false }
        if (op === 'activate' && info.active) patch.status = 'imported'
        if (op === 'themes') { patch.themes = info.themes ?? []; patch.themes_pushed_at = new Date().toISOString() }
        await db.from('packages').update(patch).eq('id', packageId)
      }
    } catch (err) {
      verified = { error: err instanceof Error ? err.message : String(err) }
    }
    await log(`TC ${op} sobre ${tcPackageId}: ok${verified.matches === false ? ' pero la verificación no coincide' : ''}`, { op, tcPackageId, verified, before: write.before ?? null }, verified.matches === false ? 'warning' : 'info')
    return { ok: true, result: { op, tcPackageId, verified } }
  },
}
