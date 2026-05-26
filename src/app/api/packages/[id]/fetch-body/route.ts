import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/packages/[id]/fetch-body
 *
 * Scrapea https://siviajo.com/es/idea/<tc_package_id>/<slug> y guarda el HTML
 * del body del paquete en packages.description_body.
 *
 * El body contiene: itinerario día por día, vuelos específicos (IB 108 / IB 101),
 * Incluye / No Incluye, alojamientos previstos, política de cancelación.
 *
 * Acepta:
 *   POST /api/packages/123/fetch-body            → fetch + guardar
 *   POST /api/packages/52967532/fetch-body       → idem (tc_package_id directo)
 *
 * Query params:
 *   ?dry=1  → no guarda, solo devuelve preview ({ html_size, text_preview })
 *   ?force=1 → re-fetchea aunque ya tenga description_body_fetched_at reciente
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const numericId = parseInt(id)
  if (!numericId || Number.isNaN(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const force = request.nextUrl.searchParams.get('force') === '1'

  const db = createAdminClient()

  // Resolver tc_package_id si nos pasaron el id interno
  let tcPackageId = numericId
  let pkgId: number | null = null
  let title = ''
  if (numericId < 1_000_000) {
    const { data: pkg } = await db
      .from('packages')
      .select('id, tc_package_id, title, description_body_fetched_at')
      .eq('id', numericId)
      .maybeSingle()
    if (!pkg) return NextResponse.json({ error: 'package not found' }, { status: 404 })
    tcPackageId = pkg.tc_package_id
    pkgId = pkg.id
    title = pkg.title
    if (!force && pkg.description_body_fetched_at) {
      const fetchedAt = new Date(pkg.description_body_fetched_at)
      const ageMs = Date.now() - fetchedAt.getTime()
      if (ageMs < 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          skipped: true,
          reason: 'fetched in last 24h, use ?force=1 to refresh',
          fetched_at: pkg.description_body_fetched_at,
        })
      }
    }
  } else {
    const { data: pkg } = await db
      .from('packages')
      .select('id, tc_package_id, title')
      .eq('tc_package_id', numericId)
      .maybeSingle()
    if (!pkg) return NextResponse.json({ error: 'package not found' }, { status: 404 })
    pkgId = pkg.id
    title = pkg.title
  }

  // Construir slug desde el título
  const slug = title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quitar acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const url = `https://siviajo.com/es/idea/${tcPackageId}/${slug}`

  // Fetch
  let html: string
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) {
      return NextResponse.json({ error: `siviajo.com returned ${r.status}`, url }, { status: 502 })
    }
    html = await r.text()
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e), url }, { status: 502 })
  }

  // Extraer SOLO el bloque "description-brochure" (la descripción real) +
  // el bloque del Itinerario. Descartamos UI (Compartir, Advertencia, Hot Sale,
  // Temas, breadcrumb de destinos, botones, etc).

  // 1) DESCRIPCIÓN — <div class="...description-brochure...">
  function extractBalancedDiv(html: string, startIdx: number): string {
    // Recibe el offset del '<div ...>' inicial. Devuelve hasta el </div> que balancea.
    const end = findClosingDiv(html, startIdx)
    return html.slice(startIdx, end)
  }
  function findClosingDiv(s: string, from: number): number {
    // Asume que `from` apunta al inicio de un '<div'. Avanza hasta el '</div>' balanceado.
    const tagEnd = s.indexOf('>', from)
    if (tagEnd === -1) return s.length
    let i = tagEnd + 1
    let depth = 1
    while (i < s.length && depth > 0) {
      const nextOpen = s.indexOf('<div', i)
      const nextClose = s.indexOf('</div>', i)
      if (nextClose === -1) return s.length
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; i = nextOpen + 4 }
      else { depth--; i = nextClose + 6 }
    }
    return i
  }
  function toCleanText(rawHtml: string): string {
    let t = rawHtml
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<button[\s\S]*?<\/button>/g, '')
      .replace(/<a[^>]*data-(?:p-required|widget-var|toggle-collapse)[^>]*>[\s\S]*?<\/a>/g, '')
      .replace(/<div[^>]*c-read-more[^>]*>[\s\S]*?<\/div>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      // limpiar tags HTML incompletos al final (ej: </p sin > por slice cortado)
      .replace(/<\/?\w*\s*$/g, '')
      // entidades HTML básicas
      .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&iacute;/g, 'í').replace(/&aacute;/g, 'á')
      .replace(/&eacute;/g, 'é').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
      .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
      // compactar espacios pero preservar saltos
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return t
  }

  // Descripción
  const descMatch = html.match(/<div[^>]*class="[^"]*description-brochure[^"]*"[^>]*>/)
  let descriptionText = ''
  if (descMatch && descMatch.index !== undefined) {
    const descBlock = extractBalancedDiv(html, descMatch.index)
    descriptionText = toCleanText(descBlock)
  }

  // Itinerario — desde el <b>Itinerario</b> mismo hasta el siguiente "terminator"
  // (no usar lastIndexOf('<div'), trae chrome de sidebar como precio/Advertencia/Reservar)
  let itineraryText = ''
  const itiAnchor = html.search(/<b[^>]*>\s*Itinerario\s*<\/b>/)
  if (itiAnchor !== -1) {
    // Cualquier terminador conocido después del itinerario.
    // El más confiable es "Fin de nuestros servicios" (frase final estándar de TC).
    // Si no aparece, caemos a los otros.
    const terminators = [
      /Fin de nuestros servicios/,    // PRIMARIO — termina el itinerario formal
      /<p[^>]*>\s*Incluye:\s*<\/p>/,
      /Resumen del tour/,
      /Resumen del viaje/,
      /Alojamientos previstos/,
      /Esta idea incluye/,
      /Ampliar mapa/,
      /<button[^>]*>\s*Cerrar/,
      /CLOSEDTOUR-/,
      /Incluido/,
      /Pol[íi]tica de cancelaci[óo]n/,
    ]
    let endAt = html.length
    let endTerminator = ''
    for (const t of terminators) {
      const m = html.slice(itiAnchor).search(t)
      if (m !== -1) {
        const absolute = itiAnchor + m
        if (absolute < endAt) { endAt = absolute; endTerminator = t.source }
      }
    }
    // Si terminamos en "Fin de nuestros servicios", extender hasta cerrar la frase
    if (endTerminator.startsWith('Fin de nuestros')) {
      const finIdx = html.indexOf('Fin de nuestros servicios', endAt)
      if (finIdx !== -1) endAt = finIdx + 30  // incluir "Fin de nuestros servicios." + punto
    }
    if (endAt > itiAnchor + 50_000) endAt = itiAnchor + 50_000  // safety cap
    const itiBlock = html.slice(itiAnchor, endAt)
    itineraryText = toCleanText(itiBlock)
  }

  // 3) HOTELES — extraer data-hotelname únicos (siviajo los renderiza con
  //    `<div class="...closed-tour-details__hotels__title..." data-hotelname="..." data-code="...">`)
  //    No siempre hay una sección visible "Alojamientos previstos", pero los hoteles SI están en el HTML.
  type HotelEntry = { name: string; code: string }
  const hotels: HotelEntry[] = []
  const seenHotels = new Set<string>()
  for (const m of html.matchAll(/data-hotelname="([^"]+)"/g)) {
    let name = m[1]
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&iacute;/g, 'í').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
      .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
      .trim()
    if (seenHotels.has(name) || name.length < 2) continue
    seenHotels.add(name)
    // Buscar data-code en el contexto cercano (~300 chars antes/después)
    const start = Math.max(0, m.index! - 300)
    const end = Math.min(html.length, m.index! + 300)
    const ctx = html.slice(start, end)
    const codeM = ctx.match(/data-code="([^"]+)"/)
    hotels.push({ name, code: codeM ? codeM[1] : '' })
  }
  const hotelsText = hotels.length > 0
    ? 'Alojamientos previstos\n' + hotels.map(h => `• ${h.name}${h.code ? ` (${h.code})` : ''}`).join('\n')
    : ''

  if (!descriptionText && !itineraryText && !hotelsText) {
    return NextResponse.json({
      error: 'No se pudieron extraer Descripción, Itinerario ni Hoteles del HTML',
      url,
      htmlSize: html.length,
    }, { status: 502 })
  }

  // Composición final: Descripción + Itinerario + Hoteles, separados por línea en blanco
  const body = [
    descriptionText ? `Descripción\n${descriptionText}` : '',
    itineraryText, // ya empieza con "Itinerario"
    hotelsText,
  ].filter(Boolean).join('\n\n')

  const textOnly = body

  if (dry) {
    return NextResponse.json({
      dry: true,
      url,
      html_size: body.length,
      text_size: textOnly.length,
      text_preview: textOnly.slice(0, 800),
    })
  }

  // Guardar en DB
  const { error: updateErr } = await db
    .from('packages')
    .update({
      description_body: body,
      description_body_fetched_at: new Date().toISOString(),
    })
    .eq('id', pkgId!)

  if (updateErr) {
    // Si la columna no existe aún, dar mensaje claro
    const msg = updateErr.message || ''
    if (msg.includes('description_body') && msg.includes('column')) {
      return NextResponse.json({
        error: 'La columna description_body no existe en packages. Corré primero la migration: supabase/migrations/20260526_add_description_body_to_packages.sql',
        original: msg,
      }, { status: 500 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    package_id: pkgId,
    tc_package_id: tcPackageId,
    url,
    html_size: body.length,
    text_size: textOnly.length,
    text_preview: textOnly.slice(0, 400),
  })
}
