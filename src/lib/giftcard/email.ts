/**
 * Email del voucher por la API de Gmail con la cuenta de servicio de Google (delegación de
 * dominio), igual que la tienda de entradas: `GMAIL_CUENTA_SERVICIO` (JSON o base64),
 * `GMAIL_USUARIO` (casilla que se impersona), `EMAIL_REMITENTE` / `EMAIL_REMITENTE_NOMBRE`.
 * Nunca tira: devuelve ok/error para que el pedido quede marcado.
 */
import { createSign } from 'node:crypto'
import { giftcardEnv } from './config'

const URL_TOKEN = 'https://oauth2.googleapis.com/token'
const URL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
let tokenCache: { token: string; exp: number } | null = null

function readServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = (process.env.GMAIL_CUENTA_SERVICIO ?? process.env.GOOGLE_DRIVE_CREDENTIALS ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!raw) return null
  for (const txt of [raw, (() => { try { return Buffer.from(raw, 'base64').toString('utf8') } catch { return '' } })()]) {
    try { const j = JSON.parse(txt); if (j.client_email && String(j.private_key).includes('PRIVATE KEY')) return { client_email: j.client_email, private_key: j.private_key } } catch { /* otra forma */ }
  }
  return null
}
function b64url(s: string | Buffer): string { return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token
  const sa = readServiceAccount(); const user = (process.env.GMAIL_USUARIO ?? process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL ?? '').trim()
  if (!sa || !user) throw new Error('Falta GMAIL_CUENTA_SERVICIO/GMAIL_USUARIO para mandar el voucher')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, sub: user, scope: SCOPE, aud: URL_TOKEN, iat: now, exp: now + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key)
  const assertion = `${header}.${claim}.${b64url(sig)}`
  const res = await fetch(URL_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(10_000) })
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !j.access_token) throw new Error(`Gmail token: ${j.error ?? res.status} ${j.error_description ?? ''}`)
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return j.access_token
}
function enc(s: string): string { const t = s.replace(/[\r\n\t]+/g, ' ').trim(); return /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=` }
function b64lines(s: string): string { return (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? ['']).join('\r\n') }

export interface VoucherMail { to: string; subject: string; text: string; html: string }
export async function sendMail(m: VoucherMail): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const from = (process.env.EMAIL_REMITENTE ?? 'comunicaciones@siviajo.com').trim(); const fromName = (process.env.EMAIL_REMITENTE_NOMBRE ?? 'Sí, Viajo').trim()
    const boundary = `sv-${Date.now().toString(36)}`
    const mime = [`From: ${enc(fromName)} <${from}>`, `To: ${m.to.replace(/[<>",;\s]/g, '')}`, `Reply-To: ${from}`, `Subject: ${enc(m.subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64lines(m.text), '', `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64lines(m.html), '', `--${boundary}--`, ''].join('\r\n')
    const token = await accessToken()
    const res = await fetch(URL_SEND, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }), signal: AbortSignal.timeout(15_000) })
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
    if (!res.ok || !j.id) return { ok: false, error: `Gmail ${res.status}: ${j.error?.message ?? 'sin id'}` }
    return { ok: true, id: j.id }
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 300) } }
}

export function voucherMail(o: { to: string; buyerName: string; code: string; amountUsd: number; validUntil: string; recipientName?: string | null; message?: string | null }): VoucherMail {
  const env = giftcardEnv()
  const fecha = new Date(o.validUntil + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
  const para = o.recipientName ? ` para ${o.recipientName}` : ''
  const wa = `https://wa.me/${env.whatsapp}?text=${encodeURIComponent(`Hola, quiero usar mi Gift Card ${o.code}`)}`
  const text = `¡Gracias, ${o.buyerName}!\n\nTu Gift Card Sí, Viajo${para} ya está activa.\n\nCódigo: ${o.code}\nValor: USD ${o.amountUsd}\nVálida hasta: ${fecha}\n${o.message ? `\nMensaje: ${o.message}\n` : ''}\nCómo usarla: elegí cualquier paquete, vuelo u hotel en www.siviajo.com y escribí el código en "¿Tenés un código?" antes de pagar, o mandáselo a un asesor por WhatsApp: ${wa}\n\nEl saldo se descuenta del total en dólares. Un solo uso, no acumulable con otras promociones.\n\nSí, Viajo · Legajo 19159 · Marcelo T. de Alvear 636, piso 3, CABA`
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f5fb;font-family:Montserrat,Arial,sans-serif;color:#10214b"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#10214b;border-radius:16px 16px 0 0;padding:28px 28px 20px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Gift Card</div><div style="font-size:26px;font-weight:700;margin-top:6px">Sí, Viajo</div></div><div style="background:#fff;border:1px solid #e3e7f2;border-top:0;border-radius:0 0 16px 16px;padding:28px"><p style="font-size:16px;margin:0 0 16px">¡Gracias, ${esc(o.buyerName)}! Tu Gift Card${esc(para)} ya está activa.</p><div style="background:#f3f5fb;border-radius:12px;padding:18px;text-align:center;margin:0 0 18px"><div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#5d6386">Código</div><div style="font-size:30px;font-weight:800;letter-spacing:.08em;margin:6px 0;color:#10214b">${esc(o.code)}</div><div style="font-size:15px">Valor <strong>USD ${o.amountUsd}</strong> · válida hasta <strong>${esc(fecha)}</strong></div></div>${o.message ? `<p style="font-style:italic;border-left:3px solid #35d1a3;padding-left:12px;margin:0 0 18px">${esc(o.message)}</p>` : ''}<h3 style="font-size:15px;margin:0 0 8px">Cómo usarla</h3><ol style="margin:0 0 18px;padding-left:20px;line-height:1.6"><li>Elegí cualquier paquete, vuelo u hotel en <a href="https://www.siviajo.com" style="color:#10214b">www.siviajo.com</a>.</li><li>Antes de pagar, escribí el código en "¿Tenés un código?".</li><li>O mandáselo a un asesor por <a href="${wa}" style="color:#10214b">WhatsApp</a> y lo aplicamos nosotros.</li></ol><p style="font-size:13px;color:#5d6386;margin:0">El saldo se descuenta del total en dólares. Un solo uso, no acumulable con otras promociones. Sí, Viajo · Legajo 19159 · Marcelo T. de Alvear 636, piso 3, CABA.</p></div></div></body></html>`
  return { to: o.to, subject: `Tu Gift Card Sí, Viajo: ${o.code} (USD ${o.amountUsd})`, text, html }
}
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)) }
