import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCron } from '@/lib/cron/auth'
import { runTick } from '@/lib/jobs/runner'
import type { Lane } from '@/lib/jobs/types'
import { ALL_LANES } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/jobs-tick
 *
 * Un tick del runner de jobs. Lo dispara el crontab del VPS cada minuto
 * (ops/crontab.vps). Corre en el proceso de Next bajo PM2, así que no hay
 * maxDuration: el tick deja de tomar jobs a los 240 s y termina los que ya
 * empezó. Dos ticks solapados no se pisan gracias al lock por lane.
 *
 * `?lanes=meta,serpapi` limita el tick a esos lanes (útil para depurar).
 */
async function handle(request: NextRequest) {
  const auth = authorizeCron(request)
  if (!auth.ok) return auth.response

  const lanesParam = request.nextUrl.searchParams.get('lanes')
  const lanes = lanesParam
    ? (lanesParam.split(',').map(s => s.trim()).filter((l): l is Lane => (ALL_LANES as string[]).includes(l)))
    : undefined

  const db = createAdminClient()
  const summary = await runTick(db, { lanes })
  return NextResponse.json({ ok: true, ...summary })
}

export const GET = handle
export const POST = handle
