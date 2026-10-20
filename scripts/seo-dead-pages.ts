/**
 * URLs con tráfico en Search Console (90 d y 12 m) que hoy responden 404, redirigen o muestran la página
 * "te has perdido" de TC. Para las fichas consulta TC (existe / activa / salida). Salida: consola + JSON.
 *   npx -y tsx@4 --env-file=.env.local --tsconfig tsconfig.json scripts/seo-dead-pages.ts
 */
import fs from 'node:fs'
import { createGscApi, gscSiteUrl } from '@/lib/gsc/client'
import { classifyPage, ideaIdFromUrl } from '@/lib/seo/page-types'
import { getPackageInfo } from '@/lib/travelcompositor/client'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 HUB-seo-check'
function iso(d: Date) { return d.toISOString().slice(0, 10) }

async function head(url: string): Promise<{ status: number; title: string | null; location: string | null; dead: boolean }> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(25_000) })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400) { await res.body?.cancel().catch(() => {}); return { status: res.status, title: null, location, dead: false } }
    const reader = res.body?.getReader(); let html = ''; const dec = new TextDecoder()
    if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); if (html.includes('</head>') || html.length > 200_000) { await reader.cancel().catch(() => {}); break } }
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? null
    const dead = res.status >= 400 || /parece que te has perdido|no encontrado|not found/i.test(title ?? '')
    return { status: res.status, title, location: null, dead }
  } catch (e) { return { status: 0, title: null, location: null, dead: true } }
}

async function main() {
  const site = gscSiteUrl(); const api = createGscApi()
  const end = new Date(Date.now() - 2 * 86_400_000)
  const win = async (days: number) => api.queryRows(site, { startDate: iso(new Date(end.getTime() - days * 86_400_000)), endDate: iso(end), dimensions: ['page'], rowLimit: 5000 })
  const [r90, r365] = await Promise.all([win(90), win(365)])
  const m = new Map<string, { page: string; c90: number; i90: number; c365: number; i365: number; pos365: number }>()
  for (const r of r365) m.set(r.keys[0], { page: r.keys[0], c90: 0, i90: 0, c365: r.clicks, i365: r.impressions, pos365: r.position })
  for (const r of r90) { const x = m.get(r.keys[0]) ?? { page: r.keys[0], c90: 0, i90: 0, c365: 0, i365: 0, pos365: 0 }; x.c90 = r.clicks; x.i90 = r.impressions; m.set(r.keys[0], x) }
  const cands = [...m.values()].filter(x => x.c365 >= 5 || x.i365 >= 200 || x.c90 >= 2 || x.i90 >= 50)
  console.log(`páginas con datos: ${m.size} · a revisar: ${cands.length}`)
  const out: Array<Record<string, unknown>> = []
  let i = 0
  async function worker() { for (;;) { const c = cands[i++]; if (!c) return; const h = await head(c.page); if (h.dead || h.location) out.push({ ...c, ...h, type: classifyPage(c.page) }) } }
  await Promise.all(Array.from({ length: 8 }, worker))
  // Para las fichas: ¿existe en TC? ¿activa? ¿salida?
  for (const o of out) {
    const id = ideaIdFromUrl(String(o.page)); if (!id) continue
    try { const info = await getPackageInfo(id); const x = info as unknown as { active?: boolean; departureDate?: string; dateSettings?: { availRange?: { end?: string } }; title?: string }
      o.tc = { exists: true, active: x.active, departure: x.departureDate, end: x.dateSettings?.availRange?.end, title: x.title } } catch (e) { o.tc = { exists: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 60) } }
  }
  out.sort((a, b) => Number(b.c365) - Number(a.c365) || Number(b.i365) - Number(a.i365))
  fs.writeFileSync('scripts/_seo_dead_pages.json', JSON.stringify(out, null, 1))
  console.log(`muertas o redirigidas: ${out.length}`)
  for (const o of out) console.log(`${String(o.status).padStart(3)} ${String(o.type).padEnd(8)} c365=${String(o.c365).padStart(4)} i365=${String(o.i365).padStart(6)} c90=${String(o.c90).padStart(3)} ${o.page}${o.location ? ' → ' + o.location : ''}${o.tc ? ' | TC: ' + JSON.stringify(o.tc) : ''}`)
}
main().catch(e => { console.error(e); process.exit(1) })
