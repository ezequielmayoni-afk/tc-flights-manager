import type { HandlerDefinition } from '../types'

/**
 * Job de prueba del kernel: espera lo que diga el payload y termina.
 * Sirve para verificar en producción que el tick corre, que el lock por lane
 * funciona y que los kill switches frenan sin errores.
 */
export const noopHandler: HandlerDefinition = {
  kind: 'noop',
  lane: 'default',
  description: 'Job de prueba: espera payload.ms milisegundos y devuelve ok',
  handler: async ({ job, heartbeat, log }) => {
    const ms = Math.min(Number(job.payload.ms ?? 0), 120_000)
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms))
      await heartbeat()
    }
    await log(`noop terminado (${ms} ms)`)
    return { ok: true, result: { waitedMs: ms } }
  },
}
