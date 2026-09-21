/**
 * Fase 4 · dry-run del criterio marketing vs web.
 * Evalúa todos los paquetes activos SIN escribir y compara la vía sugerida
 * contra lo decidido a mano (send_to_marketing / in_marketing).
 * Uso: npx tsx --tsconfig tsconfig.json scripts/marketing-score-dry-run.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { evaluatePackages, applyEvaluations } = await import('../src/lib/marketing/evaluate')
  const { rules, results } = await evaluatePackages(db as never, { blind: process.argv.includes('--blind') })
  const rows = results.map(r => ({ r, manual: r.inMarketing ? 'marketing' : 'web' }))
  const pad = (s: string | number, n: number) => String(s).padEnd(n)
  console.log(`Reglas: marketing ≥ ${rules.marketingMin}, manual ≥ ${rules.manualMin}; margen bueno ${rules.marginGoodPct}% / malo ${rules.marginBadPct}%\n`)
  console.log(pad('SIV', 10), pad('score', 6), pad('vía', 10), pad('a mano', 10), pad('cupo', 8), pad('tend', 12), 'motivos')
  for (const { r, manual } of [...rows].sort((a, b) => b.r.evaluation.score - a.r.evaluation.score)) {
    const e = r.evaluation
    const cupo = r.context.cupo ? `${r.context.cupo.remaining}/${r.context.cupo.total}` : '-'
    const mark = (e.track === 'marketing') === (manual === 'marketing') ? ' ' : (e.track === 'manual' ? '?' : 'X')
    console.log(mark, pad(r.tcPackageId, 9), pad(e.score, 6), pad(e.track, 10), pad(manual, 10), pad(cupo, 8), pad(`${r.context.trend ?? '-'}/${r.context.momentum ?? '-'}`, 12), e.reasons.slice(0, 3).join(' · ').slice(0, 90))
  }
  const decided = rows.filter(x => x.r.evaluation.track !== 'manual' && x.r.evaluation.track !== 'excluded')
  const agree = decided.filter(x => (x.r.evaluation.track === 'marketing') === (x.manual === 'marketing')).length
  const byTrack: Record<string, number> = {}
  for (const x of rows) byTrack[x.r.evaluation.track] = (byTrack[x.r.evaluation.track] ?? 0) + 1
  const inMk = rows.filter(x => x.manual === 'marketing')
  const inMkCaught = inMk.filter(x => x.r.evaluation.track === 'marketing' || x.r.evaluation.track === 'manual').length
  console.log(`\nPaquetes evaluados: ${rows.length} → ${Object.entries(byTrack).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`Acuerdo (excluyendo 'manual' y 'excluded'): ${agree}/${decided.length} = ${decided.length ? Math.round(100 * agree / decided.length) : 0}%`)
  console.log(`De los ${inMk.length} que hoy están en marketing, el score los pone en marketing o manual: ${inMkCaught} (${inMk.length ? Math.round(100 * inMkCaught / inMk.length) : 0}%)`)
  const margins = rows.map(x => x.r.evaluation.marginPct).filter((m): m is number => m !== null).sort((a, b) => a - b)
  if (margins.length) console.log(`Margen: p10 ${margins[Math.floor(margins.length * 0.1)].toFixed(1)}% · mediana ${margins[Math.floor(margins.length / 2)].toFixed(1)}% · p90 ${margins[Math.floor(margins.length * 0.9)].toFixed(1)}%`)
  if (process.argv.includes('--apply')) {
    const applied = await applyEvaluations(db as never, results)
    console.log('\nAplicado:', JSON.stringify(applied))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
