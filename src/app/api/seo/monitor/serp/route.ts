import { enqueueManualSeoJob } from '@/lib/seo/manual-run'

export const dynamic = 'force-dynamic'

/** POST /api/seo/monitor/serp — encola `serp.track` con prioridad manual (Fase 14). */
export async function POST() {
  return enqueueManualSeoJob('serp.track')
}
