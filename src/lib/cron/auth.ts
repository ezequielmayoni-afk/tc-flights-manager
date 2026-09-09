import { NextRequest, NextResponse } from 'next/server'

export type CronAuthResult =
  | { ok: true; via: 'cron_secret' | 'api_key' }
  | { ok: false; response: NextResponse }

/**
 * Autoriza una llamada de servicio (cron del VPS, otro job, el CRM).
 *
 * Acepta `Authorization: Bearer <CRON_SECRET>` (lo que ya usaban los dos
 * crons existentes) o `X-API-Key: <HUB_API_KEY>` (lo que ya usa el bot del
 * CRM contra /api/bot/packages). Así una sola función cubre todo lo que se
 * dispara sin sesión de usuario, y las rutas del loop pueden aceptar tanto un
 * clic desde la UI como un disparo agendado.
 *
 * Si ninguno de los dos secretos está configurado, rechaza: antes el cron se
 * bypasseaba cuando faltaba CRON_SECRET, y eso dejaba la ruta abierta.
 */
export function authorizeCron(request: NextRequest): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET
  const apiKey = process.env.HUB_API_KEY

  if (!cronSecret && !apiKey) {
    console.error('[cron auth] Ni CRON_SECRET ni HUB_API_KEY están configurados')
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }),
    }
  }

  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, via: 'cron_secret' }
  }

  const headerKey = request.headers.get('x-api-key')
  if (apiKey && headerKey === apiKey) {
    return { ok: true, via: 'api_key' }
  }

  console.warn('[cron auth] Intento de acceso no autorizado', {
    path: request.nextUrl.pathname,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
  })
  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  }
}
