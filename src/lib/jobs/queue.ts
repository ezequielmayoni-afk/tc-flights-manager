import type { Db, EnqueueInput, JobRow } from './types'
import { getHandlerDefinition } from './handlers'

export interface EnqueueResult {
  id: number | null
  /** true si ya había un job pendiente con el mismo dedupe_key y no se creó otro. */
  deduped: boolean
}

/**
 * Encola un job. Con `dedupeKey`, si ya hay uno pendiente o corriendo con esa
 * clave devuelve ese id y no crea otro: así un cron que corre cada hora y una
 * acción manual no producen dos escrituras iguales.
 */
export async function enqueueJob(db: Db, input: EnqueueInput): Promise<EnqueueResult> {
  const definition = getHandlerDefinition(input.kind)
  if (!definition) throw new Error(`Job kind desconocido: ${input.kind}`)

  const row = {
    kind: input.kind,
    lane: input.lane ?? definition.lane,
    payload: input.payload ?? {},
    priority: input.priority ?? 5,
    run_after: (input.runAfter ?? new Date()).toISOString(),
    dedupe_key: input.dedupeKey ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId != null ? String(input.entityId) : null,
    created_by: input.createdBy ?? null,
    max_attempts: input.maxAttempts ?? 3,
  }

  const { data, error } = await db.from('hub_jobs').insert(row).select('id').single()

  if (error) {
    // 23505 = unique_violation: el índice parcial de dedupe_key lo rechazó.
    if (error.code === '23505' && input.dedupeKey) {
      const { data: existing } = await db
        .from('hub_jobs')
        .select('id')
        .eq('dedupe_key', input.dedupeKey)
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return { id: existing?.id ?? null, deduped: true }
    }
    throw new Error(`No se pudo encolar ${input.kind}: ${error.message}`)
  }

  return { id: data.id as number, deduped: false }
}

export async function cancelJob(db: Db, id: number, actor: string | null): Promise<boolean> {
  const { data, error } = await db
    .from('hub_jobs')
    .update({ status: 'cancelled', finished_at: new Date().toISOString(), last_error: actor ? `cancelado por ${actor}` : 'cancelado' })
    .eq('id', id)
    .eq('status', 'queued')
    .select('id')
  if (error) throw new Error(`No se pudo cancelar el job ${id}: ${error.message}`)
  return (data?.length ?? 0) > 0
}

export async function getJob(db: Db, id: number): Promise<JobRow | null> {
  const { data } = await db.from('hub_jobs').select('*').eq('id', id).maybeSingle()
  return (data as JobRow | null) ?? null
}
