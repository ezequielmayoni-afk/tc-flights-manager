import { enqueueManualSeoJob } from '@/lib/seo/manual-run'

export const dynamic = 'force-dynamic'

/** POST /api/seo/monitor/gsc — encola `gsc.site_sync` con prioridad manual (Fase 14). */
export async function POST() {
  return enqueueManualSeoJob('gsc.site_sync')
}
