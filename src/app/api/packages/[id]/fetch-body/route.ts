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

  // Extraer el <form id="idea-info-form">...</form> — contiene todo el body editorial
  const formMatch = html.match(/<form[^>]*id="idea-info-form"[^>]*>([\s\S]+?)<\/form>/)
  if (!formMatch) {
    return NextResponse.json({
      error: 'No se encontró el bloque idea-info-form en la página',
      url,
      htmlSize: html.length,
    }, { status: 502 })
  }
  let body = formMatch[1]

  // Limpiar scripts, styles, inputs hidden, JSF noise — preservar contenido editorial
  body = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<input[^>]*type="hidden"[^>]*\/?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/g, '')
    // botones "Leer más / Leer menos" PrimeFaces
    .replace(/<div[^>]*class="[^"]*c-read-more[^"]*"[^>]*>[\s\S]*?<\/div>/g, '')
    .replace(/<a[^>]*data-(?:p-required|widget-var)[^>]*>[\s\S]*?<\/a>/g, '')
    // PrimeFaces wrappers vacíos
    .replace(/\s+(?:onclick|onkeypress|onfocus|onblur|onmouseover|onmouseout)="[^"]*"/g, '')
    // colapsar whitespace
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()

  const textOnly = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

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
