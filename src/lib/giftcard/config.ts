/**
 * Gift cards Sí, Viajo: configuración fija y variables de entorno.
 *
 * - Montos en dólares (cada "punto" = USD 1, como deturista). Se cobran en pesos a la
 *   cotización manual de TC (USD→ARS) del momento de la compra, más un recargo opcional
 *   (`GIFTCARD_FX_MARKUP_PCT`, por defecto 0).
 * - El voucher es un código de promoción de TC de monto fijo en USD, un solo uso, 12 meses.
 * - Mercado Pago: `MP_ACCESS_TOKEN` (la cuenta de Sí, Viajo). `MP_WEBHOOK_SECRET` es opcional:
 *   si no está, el webhook se acepta igual porque el pago siempre se relee de la API de MP
 *   por id, y además hay un job que concilia los pedidos pendientes.
 * - Email del voucher: cuenta de servicio de Gmail (`GMAIL_CUENTA_SERVICIO`, `GMAIL_USUARIO`,
 *   `EMAIL_REMITENTE`, `EMAIL_REMITENTE_NOMBRE`), igual que la tienda de entradas.
 */
export const GIFTCARD_AMOUNTS_USD = [50, 100, 250, 500, 1000, 2500, 5000] as const
export const GIFTCARD_MIN_USD = 50
export const GIFTCARD_MAX_USD = 10000
export const GIFTCARD_VALIDITY_MONTHS = 12
export const GIFTCARD_INSTALLMENT_OPTIONS = [1, 3, 6, 9, 12] as const
export const GIFTCARD_MAX_INSTALLMENTS = 12
/** Minutos que esperamos antes de conciliar un pedido pendiente contra MP, y días hasta darlo por vencido. */
export const GIFTCARD_RECONCILE_AFTER_MIN = 2
export const GIFTCARD_PENDING_EXPIRES_DAYS = 3

export const GIFTCARD_ALLOWED_ORIGINS = ['https://www.siviajo.com', 'https://siviajo.com', 'http://localhost:3000']

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}
export function giftcardEnv() {
  return {
    mpAccessToken: env('MP_ACCESS_TOKEN'),
    mpWebhookSecret: env('MP_WEBHOOK_SECRET'),
    fxMarkupPct: Number(env('GIFTCARD_FX_MARKUP_PCT') || '0') || 0,
    /** URL pública de la landing de TC (a donde vuelve el comprador después de pagar). */
    landingUrl: env('GIFTCARD_LANDING_URL') || 'https://www.siviajo.com/es/landing/34533/giftcard',
    /** Base pública de HUB (webhook y endpoints del widget). */
    hubBaseUrl: env('GIFTCARD_HUB_BASE_URL') || env('NEXT_PUBLIC_APP_URL') || 'https://hub.siviajo.com',
    slackWebhook: env('SLACK_WEBHOOK_URL'),
    whatsapp: env('GIFTCARD_WHATSAPP') || '5491135181235',
    tcMicrosite: env('TC_MICROSITE_ID') || 'siviajo',
  }
}
export function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && GIFTCARD_ALLOWED_ORIGINS.includes(origin)
}
