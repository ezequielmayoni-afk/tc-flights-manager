import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicClient } from '@/lib/anthropic/client'

/**
 * POST /api/quote-to-whatsapp
 * Convierte el texto del resumen de una cotización (summary.xhtml de TravelCompositor)
 * en un mensaje de WhatsApp con formato. Lo llama un tag de GTM inyectado en la web
 * pública (por eso maneja CORS para www.siviajo.com).
 *
 * Diseño clave: el modelo (Claude Haiku, barato) EXTRAE los datos y precios a JSON —
 * los LLM son buenos leyendo texto desordenado pero MALOS sumando. El total lo calcula
 * el CÓDIGO, sumando vuelos (ida y vuelta, una vez) + hotel + traslados. Así el precio
 * es siempre exacto.
 */

const MODEL = 'claude-haiku-4-5-20251001'

function corsHeaders(origin: string | null) {
  const ok =
    origin &&
    (/^https:\/\/(www\.)?siviajo\.com$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'https://www.siviajo.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Quote-Secret',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

const SYSTEM_PROMPT = `Recibís el TEXTO CRUDO del resumen de una cotización de viaje de la agencia "Sí, Viajo". Devolvé SOLO un JSON válido (sin bloques de código), con esta forma exacta:
{
 "body": string,          // mensaje de WhatsApp ameno y prolijo (ver FORMATO). Incluí TODO menos el precio total y los opcionales.
 "flights_total": number, // total de vuelos IDA Y VUELTA. Ese importe suele aparecer REPETIDO en el tramo de ida y en el de vuelta: es el MISMO, tomalo UNA sola vez.
 "hotel_total": number,   // 0 si no hay hotel
 "transfers": number[],   // importe de cada traslado (vacío si no hay)
 "currency": string,      // ej "US$"
 "pax": number|null,      // cantidad de pasajeros si se puede inferir con certeza, si no null
 "optionals": [ { "label": string, "price": number } ]  // seguros u opcionales (vacío si no hay)
}

FORMATO EXACTO del "body" (español rioplatense, emojis y negritas de WhatsApp con *asteriscos*; omití las secciones que no existan):

*¡Volá a {DESTINO}!* ✈️

📅 *Fechas:* {día} al {día} de {mes} ({N} noches)

✈️ *Vuelos*
🛫 *Ida - {Aerolínea}* ({Directo | N escala/s})
• {DD/MM}
• {Ciudad origen} ({COD}) {HH:MM} hs
• {Ciudad destino} ({COD}) {HH:MM} hs

🛬 *Vuelta - {Aerolínea}*
• {DD/MM}
• {Ciudad origen} ({COD}) {HH:MM} hs
• {Ciudad destino} ({COD}) {HH:MM} hs {(+1) si llega al día siguiente}
• {N escala/s, solo si tiene}

🎒 *Tarifa {NOMBRE, ej. BASIC}* (equipaje según política de cada aerolínea).

🏨 *Hotel:* {Nombre} {estrellas como ⭐ repetidas}
🛏️ {Tipo de habitación}
🍹 Régimen {ej. Todo Incluido}
📍 Ubicado en {ubicación}.

🚗 *Incluye traslados privados*
✅ Aeropuerto ➜ Hotel
✅ Hotel ➜ Aeropuerto

REGLAS del body:
- Fechas de cada vuelo en formato DD/MM. Rango de "Fechas" en palabras (ej "19 al 29 de enero").
- Nombrá la aerolínea y aclará "Directo" o la cantidad de escalas. NO pongas el número de vuelo.
- Horarios con "hs". Si la llegada es al día siguiente, agregá "(+1)".
- La sección de traslados va solo si el paquete los incluye; una línea con ✅ por cada tramo.
- Cerrá con una línea corta y amena (ej "*¡A disfrutar del Caribe!* 🌴") antes del precio (que se agrega aparte).
- NO incluyas el precio total, ni "por persona", ni los seguros/opcionales.
- No inventes datos ni números que no estén en el texto.`

interface Extracted {
  body: string
  flights_total: number
  hotel_total: number
  transfers: number[]
  currency: string
  pax: number | null
  optionals: { label: string; price: number }[]
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function originAllowed(origin: string | null, referer: string | null): boolean {
  const src = origin || referer || ''
  return /^https:\/\/(www\.)?siviajo\.com/.test(src) || /^http:\/\/localhost(:\d+)?/.test(src)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  try {
    // Deter simple: solo aceptar llamadas desde la web de siviajo (o localhost).
    if (!originAllowed(origin, req.headers.get('referer'))) {
      return NextResponse.json({ error: 'origen no permitido' }, { status: 403, headers })
    }
    const secret = process.env.WHATSAPP_QUOTE_SECRET
    if (secret && req.headers.get('x-quote-secret') !== secret) {
      return NextResponse.json({ error: 'no autorizado' }, { status: 401, headers })
    }

    const body = (await req.json()) as { text?: string; pax?: number }
    const text = (body.text || '').trim()
    if (text.length < 40) {
      return NextResponse.json({ error: 'texto de cotización insuficiente' }, { status: 400, headers })
    }
    const clipped = text.slice(0, 14000)
    const paxFromClient = Number.isFinite(body.pax) && (body.pax as number) > 0 ? Math.round(body.pax as number) : null

    const anthropic = getAnthropicClient()
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: clipped }],
    })

    const rawText = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()

    // Extraer el JSON (tolera fences o texto alrededor).
    const jsonStr = rawText.replace(/^```json?/i, '').replace(/```$/i, '').trim()
    let data: Extracted
    try {
      data = JSON.parse(jsonStr) as Extracted
    } catch {
      const m = jsonStr.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('respuesta del modelo no es JSON')
      data = JSON.parse(m[0]) as Extracted
    }

    // El TOTAL lo calcula el código (no el modelo): vuelos + hotel + traslados.
    const flights = num(data.flights_total)
    const hotel = num(data.hotel_total)
    const transfers = (data.transfers || []).map(num)
    const total = flights + hotel + transfers.reduce((a, b) => a + b, 0)
    const currency = (data.currency || 'US$').trim()
    const pax = paxFromClient ?? (Number.isFinite(data.pax as number) && (data.pax as number) > 0 ? Math.round(data.pax as number) : null)
    const perPax = pax ? Math.round(total / pax) : null

    let message = (data.body || '').trim()
    message += `\n\n💰 *Precio final del paquete:*\n*${currency} ${total.toLocaleString('es-AR')}* en total`
    if (perPax) {
      message += `\n👨‍👩‍👧‍👦 *${currency} ${perPax.toLocaleString('es-AR')} por persona*`
    } else {
      message += `\n_(por persona: a confirmar según cantidad de pasajeros)_`
    }
    const optionals = (data.optionals || []).filter((o) => o?.label)
    if (optionals.length) {
      message +=
        '\n\n🛡️ *Opcional:* ' +
        optionals.map((o) => `${o.label} desde ${currency} ${num(o.price).toLocaleString('es-AR')} por persona`).join(' · ')
    }
    message += '\n\nSi te interesa esta opción, la reservamos para asegurar disponibilidad y mantener la tarifa 😊'

    return NextResponse.json({ message, total, perPax, pax }, { headers })
  } catch (error) {
    console.error('[quote-to-whatsapp]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'error generando el mensaje' }, { status: 500, headers })
  }
}
