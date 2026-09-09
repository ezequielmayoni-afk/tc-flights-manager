import type { Db } from './types'

/** Kill switches conocidos. Los nuevos se agregan acá y en la migración (seed). */
export const FLAGS = {
  global: 'automation.global',
  tcWrites: 'automation.tc_writes',
  jsfWrites: 'automation.jsf_writes',
  metaWrites: 'automation.meta_writes',
  cotizadorCalls: 'automation.cotizador_calls',
  serpapiCalls: 'automation.serpapi_calls',
  crmReads: 'automation.crm_reads',
  gscWrites: 'automation.gsc_writes',
} as const

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS]

export interface FlagRow {
  key: string
  enabled: boolean
  reason: string | null
  updated_by: string | null
  updated_at: string
}

/**
 * Lee todos los flags de una vez. Un flag que no existe en la tabla se
 * considera PRENDIDO: los switches son para apagar cosas a propósito, no para
 * que una fila faltante frene el sistema.
 */
export async function loadFlags(db: Db): Promise<Map<string, FlagRow>> {
  const { data, error } = await db.from('system_flags').select('*')
  if (error) {
    console.error('[flags] No se pudieron leer los flags:', error.message)
    return new Map()
  }
  return new Map((data as FlagRow[]).map(f => [f.key, f]))
}

export function isFlagEnabled(flags: Map<string, FlagRow>, key: string): boolean {
  const row = flags.get(key)
  return row ? row.enabled : true
}

/**
 * Devuelve el primer flag apagado entre `automation.global` y los que pide
 * el handler, o null si todo está prendido.
 */
export function firstDisabledFlag(flags: Map<string, FlagRow>, required: string[] = []): string | null {
  if (!isFlagEnabled(flags, FLAGS.global)) return FLAGS.global
  for (const key of required) {
    if (!isFlagEnabled(flags, key)) return key
  }
  return null
}

export async function setFlag(
  db: Db,
  key: string,
  enabled: boolean,
  actor: string | null,
  reason?: string
): Promise<void> {
  const { error } = await db
    .from('system_flags')
    .upsert({ key, enabled, reason: reason ?? null, updated_by: actor, updated_at: new Date().toISOString() })
  if (error) throw new Error(`No se pudo actualizar el flag ${key}: ${error.message}`)
}
