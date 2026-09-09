import { checkMetaHealth } from '@/lib/meta-ads/health'
import { setIntegrationStatus } from '../integrations'
import { notifyAutomation } from '@/lib/notifications/automation'
import type { HandlerDefinition } from '../types'

const COTIZADOR_URL = () => process.env.COTIZADOR_URL || 'http://127.0.0.1:8090'
const VUELOS_URL = () => process.env.VUELOS_URL || ''

async function ping(url: string, timeoutMs = 10_000): Promise<{ ok: boolean; error?: string; ms: number }> {
  const started = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}`, ms: Date.now() - started }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started }
  }
}

/** Salud diaria de las integraciones: token y cuenta de Meta, cotizador, vuelos. */
export const healthCheckHandler: HandlerDefinition = {
  kind: 'health.check',
  lane: 'default',
  description: 'Salud de integraciones: token/cuenta de Meta, cotizador-bot, vuelos-siviajo → integration_status',
  handler: async ({ db, log }) => {
    const meta = await checkMetaHealth()
    await setIntegrationStatus(db, 'meta', { status: meta.status, tokenExpiresAt: meta.expiresAt, details: { tokenType: meta.tokenType, account: meta.account, missingScopes: meta.missingScopes, error: meta.error } })
    if (!meta.ok) {
      await notifyAutomation(db, { type: 'health_meta', title: `Meta ${meta.status === 'down' ? 'caída' : 'degradada'}`, lines: [meta.error ?? 'sin detalle', ...(meta.missingScopes.length ? [`Permisos faltantes: ${meta.missingScopes.join(', ')}`] : [])], dedupeKey: `health_meta:${meta.status}`, level: meta.status === 'down' ? 'critical' : 'warning' })
    }

    const cot = await ping(`${COTIZADOR_URL()}/health`)
    await setIntegrationStatus(db, 'cotizador', { status: cot.ok ? 'ok' : 'down', details: { url: COTIZADOR_URL(), ms: cot.ms, error: cot.error ?? null } })

    let vuelos: { ok: boolean; error?: string; ms: number } | null = null
    if (VUELOS_URL()) {
      vuelos = await ping(`${VUELOS_URL()}/health`)
      await setIntegrationStatus(db, 'vuelos', { status: vuelos.ok ? 'ok' : 'down', details: { url: VUELOS_URL(), ms: vuelos.ms, error: vuelos.error ?? null } })
    } else {
      await setIntegrationStatus(db, 'vuelos', { status: 'unknown', details: { note: 'VUELOS_URL no configurada: vuelos-siviajo no está desplegado' } })
    }

    await log(`Salud: Meta ${meta.status}, cotizador ${cot.ok ? 'ok' : 'down'}, vuelos ${vuelos ? (vuelos.ok ? 'ok' : 'down') : 'sin configurar'}`, { meta: { status: meta.status, account: meta.account?.status, error: meta.error }, cotizador: cot, vuelos }, meta.ok && cot.ok ? 'info' : 'warning')
    return { ok: true, result: { meta: meta.status, cotizador: cot.ok, vuelos: vuelos?.ok ?? null } }
  },
}
