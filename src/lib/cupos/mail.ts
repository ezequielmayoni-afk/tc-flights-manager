import type { CupoMailSettings } from './contacts'
import type { CupoRequest, CupoRequestOption } from './requests'

/**
 * Mail del pedido de cupos a aéreos: las salidas agrupadas por sondeo y lo que
 * necesitamos que contesten (precio, equipaje, seña, saldo, nombres, release,
 * cancelación). Nunca lleva nuestro precio de sistema. Puro: sin base ni envío.
 */
export interface CupoMail { subject: string; text: string; html: string }

type MailRequest = Pick<CupoRequest, 'id' | 'origin_code' | 'origin_name' | 'destination_name' | 'seats_requested' | 'adults' | 'notes'>
type MailOption = Pick<CupoRequestOption, 'departure_date' | 'return_date' | 'nights' | 'airline' | 'flight_out' | 'flight_back' | 'depart_out' | 'direct' | 'seats'> & { probe_group?: number | null; probe_group_label?: string | null }

const DAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const fmtDate = (d: string) => { const x = new Date(`${d}T12:00:00Z`); return `${DAY[x.getUTCDay()]} ${x.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}` }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const CUPO_MAIL_ASKS = [
  'Precio por plaza ida y vuelta, con tarifa, tasas e impuestos por separado.',
  'Equipaje incluido (mochila, carry-on y valija).',
  'Cantidad de lugares que pueden confirmar.',
  'Seña: porcentaje o monto por plaza y fecha de pago.',
  'Saldo: monto y fecha de vencimiento.',
  'Fecha de entrega de nombres y fecha de release (devolución de lugares sin cargo).',
  'Condiciones de reducción y cancelación.',
  'Validez de la cotización.',
]

function groupsOf(options: MailOption[]): Array<{ title: string; rows: MailOption[] }> {
  const map = new Map<string, { title: string; rows: MailOption[]; order: number }>()
  for (const o of options) {
    const key = o.probe_group === null || o.probe_group === undefined ? `n${o.nights}` : `g${o.probe_group}`
    const title = `Salidas de ${o.nights} noches`
    const e = map.get(key) ?? { title, rows: [], order: o.probe_group ?? o.nights }
    e.rows.push(o); map.set(key, e)
  }
  return [...map.values()].sort((a, b) => a.order - b.order).map(g => ({ title: g.title, rows: g.rows.sort((a, b) => a.departure_date.localeCompare(b.departure_date)) }))
}

const flightRef = (o: MailOption) => {
  const f = [o.flight_out, o.flight_back].filter(Boolean).join(' / ')
  return [o.airline, f, o.direct === false ? 'con escala' : o.direct ? 'directo' : null].filter(Boolean).join(' · ') || 'a convenir'
}

export function buildCupoRequestMail(input: { request: MailRequest; options: MailOption[]; settings: Pick<CupoMailSettings, 'subjectPrefix' | 'signature' | 'fromName'>; deadline: Date | null; greetingName?: string | null }): CupoMail {
  const { request: r, settings: s } = input
  const groups = groupsOf(input.options)
  const total = input.options.length
  const months = [...new Set(input.options.map(o => new Date(`${o.departure_date}T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })))].join('/')
  const subject = `${s.subjectPrefix ? `${s.subjectPrefix} ` : ''}Pedido de cupos #${r.id} · ${r.origin_name ?? r.origin_code} → ${r.destination_name} · ${months} · ${total} salida${total === 1 ? '' : 's'}`
  const deadline = input.deadline ? input.deadline.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : null
  const hello = `Hola${input.greetingName ? ` ${input.greetingName}` : ''}, ¿cómo están?`
  const intro = `Desde Si, Viajo les pedimos cotización de cupos ${r.origin_name ? `desde ${r.origin_name}` : `desde ${r.origin_code}`} a ${r.destination_name}. Son lugares para vender en paquetes, con reservas de ${r.adults} adultos en promedio.`
  const signature = s.signature || `Saludos,\n${s.fromName || 'Equipo de aéreos · Si, Viajo'}`
  let n = 0

  // Texto plano
  const textGroups = groups.map(g => [`${g.title}:`, ...g.rows.map(o => `  ${++n}. Ida ${fmtDate(o.departure_date)} · vuelta ${fmtDate(o.return_date)} · ${o.seats} lugares · referencia: ${flightRef(o)}`)].join('\n')).join('\n\n')
  const text = [
    hello, '', intro, '', textGroups, '',
    'Para cada salida, por favor indiquen:',
    ...CUPO_MAIL_ASKS.map((a, i) => `  ${i + 1}. ${a}`), '',
    'Si tienen una alternativa mejor en una fecha cercana o en otro horario, también nos interesa.',
    ...(r.notes ? ['', `Nota: ${r.notes}`] : []),
    '', deadline ? `Les pedimos la respuesta antes del ${deadline}, respondiendo a este mismo mail.` : 'Les pedimos la respuesta respondiendo a este mismo mail.',
    '', `Referencia interna: pedido #${r.id}.`, '', signature,
  ].join('\n')

  // HTML
  n = 0
  const th = 'style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#555"'
  const td = 'style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px"'
  const htmlGroups = groups.map(g => `
    <h3 style="font-size:14px;margin:18px 0 6px">${esc(g.title)}</h3>
    <table style="border-collapse:collapse;width:100%;max-width:680px">
      <thead><tr><th ${th}>#</th><th ${th}>Ida</th><th ${th}>Vuelta</th><th ${th}>Lugares</th><th ${th}>Vuelo de referencia</th></tr></thead>
      <tbody>${g.rows.map(o => `<tr><td ${td}>${++n}</td><td ${td}>${esc(fmtDate(o.departure_date))}</td><td ${td}>${esc(fmtDate(o.return_date))}</td><td ${td}>${o.seats}</td><td ${td}>${esc(flightRef(o))}</td></tr>`).join('')}</tbody>
    </table>`).join('')
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.45">
    <p>${esc(hello)}</p>
    <p>${esc(intro)}</p>
    ${htmlGroups}
    <p style="margin-top:18px"><b>Para cada salida, por favor indiquen:</b></p>
    <ol style="margin-top:4px">${CUPO_MAIL_ASKS.map(a => `<li>${esc(a)}</li>`).join('')}</ol>
    <p>Si tienen una alternativa mejor en una fecha cercana o en otro horario, también nos interesa.</p>
    ${r.notes ? `<p><b>Nota:</b> ${esc(r.notes)}</p>` : ''}
    <p>${esc(deadline ? `Les pedimos la respuesta antes del ${deadline}, respondiendo a este mismo mail.` : 'Les pedimos la respuesta respondiendo a este mismo mail.')}</p>
    <p style="color:#777;font-size:12px">Referencia interna: pedido #${r.id}.</p>
    <p>${esc(signature).replace(/\n/g, '<br>')}</p>
  </div>`
  return { subject, text, html }
}
