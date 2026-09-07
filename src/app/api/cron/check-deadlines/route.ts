import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  checkAndSendRequoteDeadlineNotifications,
  checkAndSendDesignDeadlineNotifications,
} from '@/lib/notifications/deadlines'
import { logEvent } from '@/lib/logs'

export const maxDuration = 60

/**
 * GET /api/cron/check-deadlines
 *
 * Revisa cotizaciones manuales y pedidos de diseño que pasaron las 48 h y manda
 * un aviso consolidado a Slack por cada tipo. Corre todos los días a las 9:00
 * de Argentina (12:00 UTC).
 *
 * Va como cron aparte y no colgado del refresco diario de paquetes porque ese
 * ya trabaja contra un presupuesto de tiempo: si se queda sin margen, los
 * avisos se perderían sin que nadie se entere.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[Cron deadlines] CRON_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[Cron deadlines] Intento de acceso no autorizado', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const db = createAdminClient()

  try {
    const requote = await checkAndSendRequoteDeadlineNotifications()
    const design = await checkAndSendDesignDeadlineNotifications()

    const totalSent = requote.sent + design.sent
    console.log(`[Cron deadlines] cotización manual: ${requote.message} | diseño: ${design.message}`)

    await logEvent(db, {
      source: 'cron',
      action: 'cron.check_deadlines',
      level: requote.error || design.error ? 'error' : 'info',
      message: totalSent === 0
        ? 'Cron de vencimientos: no había tareas vencidas para avisar'
        : `Cron de vencimientos: se avisó por ${requote.sent} cotización(es) manual(es) y ${design.sent} pedido(s) de diseño`,
      durationMs: Date.now() - startTime,
      details: { requote, design },
    }, null)

    return NextResponse.json({
      success: !requote.error && !design.error,
      requote,
      design,
      duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    })
  } catch (error) {
    console.error('[Cron deadlines] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// También por POST, para poder dispararlo a mano.
export { GET as POST }
