/**
 * Sitemap de hoteles con SEO cargado (y de paquetes/temáticas) para siviajo.com.
 *
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-hotel-sitemap.ts hotels [--dump=archivo.json] [--dest=cancun,punta-cana] [--concurrency=6] [--limit=N]
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-hotel-sitemap.ts packages
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-hotel-sitemap.ts submit
 *
 * hotels: parte del volcado de `GET /accommodations` de TC (id, nombre, geolocalización;
 *   446k filas; se baja si no se pasa --dump), filtra los que caen en el radio de los destinos
 *   donde ya se cargó SEO (lista DESTINOS), pide la ficha pública `/es/accommodation/{id}/x`
 *   leyendo sólo el <head> (la página pesa 550 KB; el head termina a los ~12 KB), y marca como
 *   "con SEO" los que tienen <title> propio o keywords distintas de las genéricas. Guarda todo
 *   en `seo_sitemap_entries` (active = con SEO y 200).
 * packages: paquetes propios activos de TC (con temáticas) + temáticas, con su URL canónica.
 * submit: envía https://hub.siviajo.com/sitemaps/index.xml a sc-domain:siviajo.com.
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig('/Users/ezequielmayoni/hub')
import fs from 'node:fs'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Db } from '@/lib/jobs/types'
import { sitemapsBaseUrl } from '@/lib/seo/sitemaps'

const BASE = 'https://online.travelcompositor.com/resources'
const MICROSITE = process.env.TC_MICROSITE_ID || 'siviajo'
const WWW = 'https://www.siviajo.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 HUB-sitemap'
const GENERIC_KEYWORDS = 'viajes, vuelos, hoteles, paquetes, ofertas, reservas'
const GENERIC_TITLE = /S[ií], ?Viajo \| Agencia de viajes/i

/** Destinos donde el script de SEO de hoteles ya cargó título/descripción (SEO_HOTEL, abril–mayo 2026). */
const DESTINOS: Array<{ slug: string; lat: number; lng: number; km: number }> = [
  { slug: 'cancun', lat: 21.16, lng: -86.85, km: 35 },
  { slug: 'playa-del-carmen', lat: 20.63, lng: -87.07, km: 30 },
  { slug: 'punta-cana', lat: 18.58, lng: -68.4, km: 45 },
  { slug: 'bayahibe', lat: 18.37, lng: -68.84, km: 20 },
  { slug: 'rio-de-janeiro', lat: -22.91, lng: -43.17, km: 40 },
  { slug: 'bariloche', lat: -41.13, lng: -71.31, km: 40 },
  { slug: 'salta', lat: -24.79, lng: -65.41, km: 30 },
  { slug: 'el-calafate', lat: -50.34, lng: -72.26, km: 40 },
  { slug: 'orlando', lat: 28.54, lng: -81.38, km: 45 },
]

/** Etiquetas del backoffice → slug usado en los archivos de sitemap (hoteles-{slug}.xml). */
const DEST_ALIAS: Record<string, string> = { 'san-carlos-de-bariloche': 'bariloche', 'rio-de-janeiro': 'rio-de-janeiro', 'el-calafate': 'el-calafate', 'playa-del-carmen': 'playa-del-carmen', 'punta-cana': 'punta-cana', 'bayahibe': 'bayahibe', 'cancun': 'cancun', 'orlando': 'orlando', 'orlando-fl': 'orlando', 'salta': 'salta' }

function arg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : undefined
}

let token: string | null = null
async function tc<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!token) {
    const res = await fetch(`${BASE}/authentication/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: process.env.TC_USERNAME, password: process.env.TC_PASSWORD, micrositeId: MICROSITE }),
    })
    if (!res.ok) throw new Error(`TC auth ${res.status}`)
    token = ((await res.json()) as { token: string }).token
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'auth-token': token, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`TC ${path} → ${res.status}`)
  return (await res.json()) as T
}

type AccRow = [string, string, number | null, number | null, string | null, string | null] // id, name, lat, lng, country, lastUpdate

function km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180
  const dLat = (lat2 - lat1) * r
  const dLng = (lng2 - lng1) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

function destinoDe(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  let best: { slug: string; d: number } | null = null
  for (const d of DESTINOS) {
    const dist = km(lat, lng, d.lat, d.lng)
    if (dist <= d.km && (!best || dist < best.d)) best = { slug: d.slug, d: dist }
  }
  return best?.slug ?? null
}

async function dumpAccommodations(file: string): Promise<AccRow[]> {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as AccRow[]
  const LIMIT = 1000
  const first = await tc<{ pagination: { totalResults: number } }>(`/accommodations?first=0&limit=1`)
  const total = first.pagination.totalResults
  const rows: AccRow[] = []
  for (let f = 0; f < total; f += LIMIT) {
    const page = await tc<{ accommodations: Array<{ id: string; name: string; geolocation?: { latitude?: number; longitude?: number }; countryCode?: string; lastUpdate?: string }> }>(`/accommodations?first=${f}&limit=${LIMIT}`)
    for (const a of page.accommodations ?? []) rows.push([a.id, a.name, a.geolocation?.latitude ?? null, a.geolocation?.longitude ?? null, a.countryCode ?? null, a.lastUpdate ?? null])
    if (rows.length % 20000 < LIMIT) console.log(`  volcado ${rows.length}/${total}`)
  }
  fs.writeFileSync(file, JSON.stringify(rows))
  return rows
}

interface HeadInfo {
  status: number
  title: string | null
  keywords: string | null
  canonical: string | null
}

let cookies = ''

/** Lee la respuesta hasta `</head>` y corta: alcanza para title, keywords y canonical. */
async function fetchHead(url: string): Promise<HeadInfo> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', ...(cookies ? { Cookie: cookies } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(25_000) })
  if (!cookies) {
    const set = res.headers.getSetCookie?.() ?? []
    cookies = set.map(c => c.split(';')[0]).join('; ')
  }
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {})
    return { status: res.status, title: null, keywords: null, canonical: null }
  }
  const reader = res.body?.getReader()
  let html = ''
  const dec = new TextDecoder()
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      html += dec.decode(value, { stream: true })
      if (html.includes('</head>') || html.length > 200_000) {
        await reader.cancel().catch(() => {})
        break
      }
    }
  }
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? null
  const keywords = html.match(/<meta name="keywords" content="([^"]*)"/)?.[1]?.trim() ?? null
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null
  return { status: res.status, title, keywords, canonical }
}

function tieneSeo(h: HeadInfo): boolean {
  if (h.status !== 200 || !h.title) return false
  if (/parece que te has perdido/i.test(h.title)) return false
  const kw = (h.keywords ?? '').toLowerCase().trim()
  if (kw && kw !== GENERIC_KEYWORDS) return true
  return !GENERIC_TITLE.test(h.title)
}

async function upsert(db: Db, rows: Array<Record<string, unknown>>): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('seo_sitemap_entries').upsert(rows.slice(i, i + 500), { onConflict: 'url' })
    if (error) throw new Error(`upsert: ${error.message}`)
  }
}

async function hotels(db: Db) {
  const dumpFile = arg('dump') ?? '/tmp/tc_accommodations.json'
  const soloDest = arg('dest')?.split(',').map(s => s.trim())
  const concurrency = Number(arg('concurrency') ?? 6)
  const limit = Number(arg('limit') ?? 0)
  // --admin=<carpeta>: usa los listados del backoffice (hl_*.json de scripts/tc-admin/hl_list.py,
  // un archivo por destino con {label, rows:[{code,name}]}) en vez de la API de alojamientos.
  // Es el universo completo de "Landing del Alojamiento" (la API sólo cubre una parte).
  const adminDir = arg('admin')
  const candidatos: Array<{ id: string; name: string; dest: string | null }> = []
  if (adminDir) {
    for (const f of fs.readdirSync(adminDir).filter(x => /^hl_.*\.json$/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${adminDir}/${f}`, 'utf8')) as { label: string; rows: Array<{ code: string; name: string }> }
      const dest = DEST_ALIAS[slug(j.label.split(',')[0])] ?? slug(j.label.split(',')[0])
      for (const r of j.rows) candidatos.push({ id: r.code.toLowerCase(), name: r.name, dest })
    }
    console.log(`inventario (backoffice): ${candidatos.length} alojamientos`)
  } else {
    const rows = await dumpAccommodations(dumpFile)
    console.log(`inventario: ${rows.length} alojamientos`)
    for (const r of rows) {
      // La API devuelve los códigos en mayúsculas (MASTER-163216); la web los usa en minúsculas.
      candidatos.push({ id: (r[0] ?? '').toLowerCase(), name: r[1], dest: destinoDe(r[2], r[3]) })
    }
  }
  const filtrados = candidatos.filter(c => c.id).filter(c => c.dest && (!soloDest || soloDest.includes(c.dest)))
  candidatos.length = 0
  candidatos.push(...filtrados)
  const porDest = new Map<string, number>()
  for (const c of candidatos) porDest.set(c.dest!, (porDest.get(c.dest!) ?? 0) + 1)
  console.log('candidatos por destino:', JSON.stringify(Object.fromEntries(porDest)))

  // Lo ya revisado hace menos de 30 días no se vuelve a pedir.
  const { data: previos } = await db.from('seo_sitemap_entries').select('code, checked_at').eq('kind', 'hotel').gte('checked_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(100_000)
  const yaVistos = new Set(((previos ?? []) as Array<{ code: string }>).map(p => p.code))
  const pendientes = candidatos.filter(c => !yaVistos.has(c.id)).slice(0, limit || undefined)
  console.log(`a revisar: ${pendientes.length} (ya revisados recientes: ${yaVistos.size})`)

  const stats = { conSeo: 0, sinSeo: 0, noExiste: 0, error: 0 }
  const hoy = new Date().toISOString().slice(0, 10)
  let buffer: Array<Record<string, unknown>> = []
  let i = 0
  const started = Date.now()

  async function worker() {
    for (;;) {
      const c = pendientes[i++]
      if (!c) return
      const url = `${WWW}/es/accommodation/${c.id}/x`
      try {
        const h = await fetchHead(url)
        const seo = tieneSeo(h)
        const canonical = h.canonical && h.canonical.startsWith('http') ? h.canonical : null
        if (h.status === 200 && canonical) {
          if (seo) stats.conSeo++
          else stats.sinSeo++
          buffer.push({
            kind: 'hotel',
            file: `hoteles-${c.dest}`,
            url: canonical,
            code: c.id,
            title: h.title,
            destination: c.dest,
            active: seo,
            lastmod: hoy,
            checked_at: new Date().toISOString(),
            meta: { keywords: h.keywords, name: c.name, status: h.status },
          })
        } else {
          stats.noExiste++
          buffer.push({ kind: 'hotel', file: `hoteles-${c.dest}`, url: `${WWW}/es/accommodation/${c.id}/`, code: c.id, title: h.title, destination: c.dest, active: false, lastmod: hoy, checked_at: new Date().toISOString(), meta: { status: h.status, name: c.name } })
        }
      } catch (err) {
        stats.error++
        if (stats.error <= 5) console.error(`  error ${c.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (buffer.length >= 200) {
        const lote = buffer
        buffer = []
        await upsert(db, lote)
        const hechos = stats.conSeo + stats.sinSeo + stats.noExiste + stats.error
        console.log(`  ${hechos}/${pendientes.length} · con SEO ${stats.conSeo} · sin SEO ${stats.sinSeo} · no existe ${stats.noExiste} · errores ${stats.error} · ${Math.round((Date.now() - started) / 1000)} s`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  if (buffer.length) await upsert(db, buffer)
  console.log('hoteles:', JSON.stringify(stats), `${Math.round((Date.now() - started) / 1000)} s`)
}

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

async function packages(db: Db) {
  const hoy = new Date().toISOString().slice(0, 10)
  const all: Array<{ id: number; active: boolean; themes?: string[]; title: string }> = []
  // La lista devuelve menos filas que `limit` (100 o menos por llamada): se avanza por lo
  // recibido y se corta cuando no llega nada nuevo.
  const vistos = new Set<number>()
  for (let first = 0; first < 20_000; ) {
    const page = await tc<{ package: Array<{ id: number; active: boolean; themes?: string[]; title: string }> }>(`/package/${MICROSITE}?first=${first}&limit=200`)
    const items = (page.package ?? []).filter(p => !vistos.has(p.id))
    if (items.length === 0) break
    for (const p of items) vistos.add(p.id)
    all.push(...items)
    first += (page.package ?? []).length
  }
  const propios = all.filter(p => p.active && (p.themes?.length ?? 0) > 0)
  console.log(`paquetes activos ${all.filter(p => p.active).length}, propios (con temáticas) ${propios.length}`)
  const rows: Array<Record<string, unknown>> = []
  for (const p of propios) {
    const h = await fetchHead(`${WWW}/es/idea/${p.id}/x`)
    if (h.status === 200 && h.canonical) rows.push({ kind: 'package', file: 'paquetes', url: h.canonical, code: String(p.id), title: h.title, active: true, lastmod: hoy, checked_at: new Date().toISOString(), meta: { title: p.title } })
  }
  // Los paquetes que ya no son propios/activos salen del sitemap.
  const vivos = new Set(rows.map(r => r.code as string))
  const { data: prev } = await db.from('seo_sitemap_entries').select('code').eq('kind', 'package').eq('active', true)
  for (const r of (prev ?? []) as Array<{ code: string }>) if (!vivos.has(r.code)) await db.from('seo_sitemap_entries').update({ active: false, checked_at: new Date().toISOString() }).eq('kind', 'package').eq('code', r.code)
  await upsert(db, rows)
  console.log(`paquetes en sitemap: ${rows.length}`)

  const themes = await tc<{ theme: Array<{ id: number; name: string }> }>(`/theme/${MICROSITE}`)
  const trows: Array<Record<string, unknown>> = []
  for (const t of themes.theme ?? []) {
    const h = await fetchHead(`${WWW}/es/${t.id}/${slug(t.name) || 'tematica'}/moreideas`)
    if (h.status === 200 && h.canonical) trows.push({ kind: 'theme', file: 'tematicas', url: h.canonical, code: String(t.id), title: h.title, active: true, lastmod: hoy, checked_at: new Date().toISOString(), meta: { name: t.name } })
  }
  await upsert(db, trows)
  console.log(`temáticas en sitemap: ${trows.length}`)
}

async function submit() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!) as { client_email: string; private_key: string }
  const auth = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ['https://www.googleapis.com/auth/webmasters'] })
  const wm = google.webmasters({ version: 'v3', auth })
  const feedpath = `${sitemapsBaseUrl()}/sitemaps/index.xml`
  const check = await fetch(feedpath, { headers: { 'User-Agent': UA } })
  if (!check.ok) throw new Error(`${feedpath} responde ${check.status}: no se envía`)
  await wm.sitemaps.submit({ siteUrl: 'sc-domain:siviajo.com', feedpath })
  console.log('enviado a Search Console:', feedpath)
}

async function main() {
  const cmd = process.argv[2]
  const db = createAdminClient()
  if (cmd === 'hotels') await hotels(db)
  else if (cmd === 'packages') await packages(db)
  else if (cmd === 'submit') await submit()
  else throw new Error('uso: hotels | packages | submit')
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
