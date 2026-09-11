import { spawn } from 'node:child_process'
import { switchPackageToSystem } from '@/lib/packages/switch-to-system'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'

/** El bot vive junto al tc-requote-bot en el VPS (mismo Playwright y .env); ver ops/install-tc-bot.sh. */
const BOT_DIR = process.env.TC_BOT_DIR || '/root/tc-requote-bot'
const BOT_TIMEOUT_MS = 12 * 60 * 1000

interface BotResult { ok: boolean; mode: string; saved: boolean; error?: string; notes: string[]; search?: { dates: string | null; price: number | null; transports: string[]; hotels: string[]; contract: boolean } | null; backoffice?: unknown; flights?: unknown; savedText?: string }

function runBot(args: string[], onLine: (line: string) => void): Promise<{ code: number | null; result: BotResult | null; tail: string[] }> {
  return new Promise(resolve => {
    const child = spawn('node', ['switch-date.js', ...args], { cwd: BOT_DIR, env: { ...process.env, PATH: process.env.PATH } })
    const tail: string[] = []
    let result: BotResult | null = null
    let buffer = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); tail.push('timeout: el bot superó el tiempo máximo') }, BOT_TIMEOUT_MS)
    child.stdout.on('data', chunk => {
      buffer += chunk.toString()
      const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim(); if (!t) continue
        if (t.startsWith('RESULT ')) { try { result = JSON.parse(t.slice(7)) } catch { tail.push(`RESULT ilegible: ${t.slice(0, 200)}`) } }
        else { tail.push(t.slice(0, 300)); if (tail.length > 40) tail.shift(); onLine(t) }
      }
    })
    child.stderr.on('data', chunk => { const t = chunk.toString().trim(); if (t && !/dotenv/.test(t)) { tail.push(`stderr: ${t.slice(0, 300)}`); if (tail.length > 40) tail.shift() } })
    child.on('close', code => { clearTimeout(timer); resolve({ code, result, tail }) })
    child.on('error', err => { clearTimeout(timer); tail.push(`spawn: ${err.message}`); resolve({ code: null, result: null, tail }) })
  })
}

async function loadAlternative(db: Db, id: number) {
  const { data } = await db.from('requote_alternatives').select('id, package_id, status, proposed_departure, nights, price_pp, airline, flight_numbers, direct').eq('id', id).maybeSingle()
  return data as { id: number; package_id: number; status: string; proposed_departure: string; nights: number | null; price_pp: number | null; airline: string | null; flight_numbers: string[]; direct: boolean | null } | null
}

/**
 * Aplica una fecha alternativa aprobada en siviajo.com con el bot
 * (backoffice: fechas del paquete; sitio como agente: búsqueda con la fecha
 * nueva, aéreo de sistema elegido, "Actualizar y guardar idea") y después
 * pasa el paquete a sistema en HUB (reimporta de TC, monitoreo).
 *
 * payload.mode: 'prepare' hace todo menos guardar (y restaura las fechas);
 * 'apply' guarda. Sin modo, aplica.
 */
export const packageApplyAlternativeHandler: HandlerDefinition = {
  kind: 'package.apply_alternative',
  lane: 'default',
  flags: [FLAGS.tcWrites, FLAGS.jsfWrites],
  description: 'Cupo agotado: aplica en siviajo.com la fecha alternativa aprobada (bot) y pasa el paquete a sistema',
  handler: async ({ db, job, heartbeat, log }) => {
    const altId = Number(job.payload.alternativeId)
    const mode = job.payload.mode === 'prepare' ? 'prepare' : 'apply'
    if (!altId) return { ok: false, error: 'payload.alternativeId obligatorio', retry: false }
    const alt = await loadAlternative(db, altId)
    if (!alt) return { ok: false, error: `Propuesta ${altId} no existe`, retry: false }
    if (!['approved', 'applying'].includes(alt.status)) return { ok: false, error: `La propuesta está ${alt.status}; hay que aprobarla primero`, retry: false }
    const { data: pkg } = await db.from('packages').select('id, tc_package_id, title').eq('id', alt.package_id).maybeSingle()
    if (!pkg) return { ok: false, error: `Paquete ${alt.package_id} no existe`, retry: false }
    const label = `SIV ${pkg.tc_package_id}`
    const slug = String(pkg.title ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    await db.from('requote_alternatives').update({ status: 'applying' }).eq('id', altId)

    const [out, back] = alt.flight_numbers ?? []
    const args = [`--tc-id=${pkg.tc_package_id}`, `--slug=${slug}`, `--date=${alt.proposed_departure}`, `--mode=${mode}`, `--shots=/tmp/switch-date/${altId}`]
    if (alt.airline) args.push(`--airline=${alt.airline}`)
    if (out) args.push(`--flight-out=${out}`)
    if (back) args.push(`--flight-back=${back}`)
    if (alt.price_pp) args.push(`--expected-price=${alt.price_pp}`)
    if (alt.direct === false) args.push('--prefer-direct=false')
    await log(`${label}: bot ${mode} → ${alt.proposed_departure} ${alt.airline ?? ''} ${[out, back].filter(Boolean).join('/')}`, { altId, args })

    const hb = setInterval(() => { void heartbeat() }, 30000)
    const run = await runBot(args, () => {})
    clearInterval(hb)
    const r = run.result
    const applyResult = { mode, code: run.code, bot: r, tail: run.tail.slice(-25) }
    if (!r || !r.ok) {
      const error = r?.error ?? (run.code === null ? 'no se pudo lanzar el bot' : `el bot terminó con código ${run.code} sin resultado`)
      await db.from('requote_alternatives').update({ status: mode === 'apply' ? 'failed' : 'approved', apply_result: applyResult, reason: error }).eq('id', altId)
      await log(`${label}: ${mode} falló: ${error}`, { altId, tail: run.tail.slice(-10) }, 'error')
      return { ok: false, error, retry: false, result: { altId, mode } }
    }
    if (mode === 'prepare' || !r.saved) {
      await db.from('requote_alternatives').update({ status: 'approved', apply_result: applyResult }).eq('id', altId)
      await log(`${label}: ensayo ok, sin guardar: ${r.search?.dates ?? ''} USD ${r.search?.price ?? '?'} · ${(r.search?.transports ?? []).join(' | ').slice(0, 200)}`, { altId, notes: r.notes })
      return { ok: true, result: { altId, mode, saved: false, price: r.search?.price ?? null, transports: r.search?.transports ?? [] } }
    }

    // Guardado en siviajo.com: HUB relee TC y pasa el paquete a sistema.
    const sw = await switchPackageToSystem(db, pkg.id, { id: null, email: `job:${job.id}` })
    const now = new Date().toISOString()
    if (!sw.ok) {
      await db.from('requote_alternatives').update({ status: 'failed', apply_result: { ...applyResult, switch: sw }, reason: `Guardado en siviajo.com pero HUB no pudo pasarlo a sistema: ${sw.reason}` }).eq('id', altId)
      await log(`${label}: guardado en siviajo.com pero no pasó a sistema en HUB: ${sw.reason}`, { altId }, 'error')
      return { ok: false, error: sw.reason, retry: false, result: { altId, saved: true } }
    }
    await db.from('requote_alternatives').update({ status: 'applied', applied_at: now, apply_result: { ...applyResult, switch: sw } }).eq('id', altId)
    await log(`${label}: fecha alternativa aplicada (${alt.proposed_departure}, USD ${r.search?.price ?? sw.newPrice} pp) y paquete pasado a sistema`, { altId, switch: sw })
    return { ok: true, result: { altId, mode, saved: true, newPrice: sw.newPrice, oldPrice: sw.oldPrice, releasedLinks: sw.releasedLinks } }
  },
}
