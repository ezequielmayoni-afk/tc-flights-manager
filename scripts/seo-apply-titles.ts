/**
 * Aplica en Travel Compositor los títulos aprobados del CSV de propuestas
 * (`docs/seo/titulos-propuestos-YYYY-MM-DD.csv`): `title` (slug, listados, og:title) y
 * `largeTitle` (es el H1 de la ficha), los dos con el título propuesto. NO toca meta
 * title/description (sólo backoffice)
 * ni temáticas (la taxonomía nueva todavía no existe en TC).
 *
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-apply-titles.ts --csv=docs/seo/titulos-propuestos-2026-10-17.csv [--ids=1,2] [--dry-run] [--include-expired] [--season]
 *   --season: reemplaza la fecha exacta del título ("– Salida 5 nov 2026") por la temporada según destino
 *   ("– Temporada baja 2026", "– Semana Santa 2027", "– Noviembre 2026" en exóticos; ver src/lib/seo/titles.ts).
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-apply-titles.ts --id=62328245 --title="Circuito Madrid y Andalucía: 7 días (opción 1)"
 *
 * Por cada paquete: GET info (título, subtítulo, descripción, temáticas) +
 * GET detalle (servicios); los dos van al backup. PUT
 * {active, title, largeTitle, description} — sin `themes`, porque TC las
 * devuelve con el nombre en inglés y mandarlas de vuelta podría cambiarlas —,
 * GET info para verificar que el título quedó y las temáticas siguen, y GET
 * de la ficha pública para ver el H1 nuevo. Cada PUT cuenta en el presupuesto
 * `tc_write`. Backup: scripts/_seo_titles_backup_<fecha>.json (untracked).
 * Los paquetes cuya única salida ya venció se saltan salvo --include-expired.
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig('/Users/ezequielmayoni/hub')
import fs from 'node:fs'
import { recordExternalCall } from '@/lib/jobs/budget'
import { grupoDestino, tituloSinFecha } from '@/lib/seo/titles'
import { createAdminClient } from '@/lib/supabase/admin'

const BASE = 'https://online.travelcompositor.com/resources'
const MICROSITE = process.env.TC_MICROSITE_ID || 'siviajo'

function arg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

/** CSV con comillas dobles y comas: suficiente para el archivo que genera seo-title-proposals.ts. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') inQuotes = false
      else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const [header, ...body] = rows
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'auth-token': token, ...(init.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`TC ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}

interface Detail {
  active?: boolean
  title?: string
  largeTitle?: string
  description?: string
  themes?: string[]
  [k: string]: unknown
}

interface Plan {
  id: number
  title: string
  largeTitle?: string
  salida?: string
  nota?: string
}

function plansFromCsv(file: string, onlyIds: Set<number> | null): Plan[] {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'))
  return rows
    .map(r => {
      const datos = r.datos_usados ?? ''
      const salida = datos.match(/salida=(\d{4}-\d{2}-\d{2})/)?.[1]
      const nota = datos.match(/nota=(.*)$/)?.[1]
      // En la plantilla de siviajo.com el H1 de la ficha es `largeTitle` (verificado el
      // 2026-10-19 con el paquete 59160593): el título con la palabra clave tiene que ir
      // en los dos campos. La columna large_title_propuesto (beneficios) no se aplica.
      // Temporada por destino (Caribe/Brasil/Argentina, Europa, exóticos, Orlando) y noches del viaje.
      const destinos = (datos.match(/destinos=([^|]+)/)?.[1] ?? '').split(/\s*(?:,|\sy\s)\s*/).map(x => x.trim()).filter(Boolean)
      const pais = datos.match(/pa[ií]s=([^|]+)/)?.[1]?.trim()
      const noches = Number(datos.match(/noches=(\d+)/)?.[1] ?? 7)
      const title = flag('season') ? tituloSinFecha(r.title_propuesto, salida, { grupo: grupoDestino(destinos, pais), noches }) : r.title_propuesto
      return { id: Number(r.tc_id), title, largeTitle: title, salida, nota }
    })
    .filter(p => p.id && p.title && (!onlyIds || onlyIds.has(p.id)))
}

async function h1Publico(id: number): Promise<string | null> {
  try {
    const res = await fetch(`https://www.siviajo.com/es/idea/${id}/x?nocache=${Date.now()}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/120', 'Cache-Control': 'no-cache' } })
    const html = await res.text()
    const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    const t = html.match(/<title>([^<]*)<\/title>/)
    const h1 = m ? m[1].replace(/<[^>]+>/g, '').trim() : null
    return h1 ? `${h1} | <title>: ${t?.[1]?.trim() ?? '?'}` : `(sin h1, status ${res.status})`
  } catch (err) {
    return `(error ${err instanceof Error ? err.message : String(err)})`
  }
}

async function main() {
  const dryRun = flag('dry-run')
  const includeExpired = flag('include-expired')
  const csv = arg('csv')
  const singleId = arg('id')
  let plans: Plan[]
  if (singleId) {
    const title = arg('title')
    if (!title) throw new Error('--id necesita --title (y opcional --large-title)')
    plans = [{ id: Number(singleId), title, largeTitle: arg('large-title') }]
  } else if (csv) {
    const ids = arg('ids')
    plans = plansFromCsv(csv, ids ? new Set(ids.split(',').map(Number)) : null)
  } else throw new Error('uso: --csv=archivo [--ids=] | --id= --title=')

  const hoy = new Date().toISOString().slice(0, 10)
  const db = createAdminClient()
  const backupFile = `scripts/_seo_titles_backup_${hoy}.json`
  const backup: Record<string, unknown> = fs.existsSync(backupFile) ? JSON.parse(fs.readFileSync(backupFile, 'utf8')) : {}
  const resumen = { aplicados: 0, saltados: 0, errores: 0, verificacionFallida: 0 }

  for (const p of plans) {
    if (!includeExpired && p.salida && p.salida < hoy) {
      console.log(`SKIP ${p.id} salida vencida ${p.salida}: ${p.title}`)
      resumen.saltados++
      continue
    }
    try {
      // El detalle (`/package/{id}`) trae los servicios pero NO título ni
      // descripción: eso vive en `/info/{id}`. Se guardan los dos.
      const detail = await tc<Detail>(`/package/${MICROSITE}/info/${p.id}`)
      const services = await tc<Record<string, unknown>>(`/package/${MICROSITE}/${p.id}`)
      backup[p.id] = backup[p.id] ?? { fetchedAt: new Date().toISOString(), info: detail, detail: services }
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 1))
      if (typeof detail.title !== 'string') throw new Error('info sin title: no se escribe')
      if (flag('season') && detail.title === p.title && detail.largeTitle === p.largeTitle) {
        console.log(`= ${p.id} sin cambio: "${p.title}"`)
        resumen.saltados++
        continue
      }
      const body: Record<string, unknown> = { active: detail.active ?? true, title: p.title, description: detail.description ?? '' }
      body.largeTitle = p.largeTitle ?? detail.largeTitle ?? p.title
      console.log(`\n${p.id}: "${detail.title}" → "${p.title}"${p.largeTitle ? `\n   largeTitle: "${p.largeTitle}"` : ''}`)
      if (dryRun) continue

      const started = Date.now()
      let ok = true
      try {
        await tc(`/package/${MICROSITE}/${p.id}`, { method: 'PUT', body: JSON.stringify(body) })
      } catch (err) {
        ok = false
        throw err
      } finally {
        await recordExternalCall(db, { provider: 'tc_write', endpoint: 'package.titles', status: ok ? 'ok' : 'error', durationMs: Date.now() - started })
      }

      const after = await tc<Detail>(`/package/${MICROSITE}/info/${p.id}`)
      const themesBefore = JSON.stringify(detail.themes ?? [])
      const themesAfter = JSON.stringify(after.themes ?? [])
      const okTitle = after.title === p.title
      const okThemes = themesBefore === themesAfter
      const okActive = after.active === detail.active
      // Lo que no mandamos tiene que seguir igual: meta tags, cinta, descripción.
      // TC devuelve '' donde antes había null (mandamos description: ''): no es un cambio.
      const intactos = (['metaTitle', 'metaDescription', 'ribbonText', 'description', 'remarks'] as const).filter(k => (after[k] || null) === (detail[k] || null))
      const okIntactos = intactos.length === 5
      if (!okTitle || !okThemes || !okActive || !okIntactos) resumen.verificacionFallida++
      console.log(
        `   verificado: title ${okTitle ? 'ok' : `DISTINTO ("${after.title}")`} · themes ${okThemes ? 'iguales' : `CAMBIARON ${themesBefore} → ${themesAfter}`} · active ${okActive ? 'ok' : 'CAMBIÓ'} · meta/cinta/descripción ${okIntactos ? 'intactos' : `CAMBIARON (${(['metaTitle', 'metaDescription', 'ribbonText', 'description', 'remarks'] as const).filter(k => !intactos.includes(k)).join(', ')})`}`
      )
      console.log(`   ficha pública: ${await h1Publico(p.id)}`)
      resumen.aplicados++
    } catch (err) {
      resumen.errores++
      console.error(`   ERROR ${p.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log('\nResumen:', JSON.stringify(resumen), dryRun ? '(dry-run)' : `· backup en ${backupFile}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
