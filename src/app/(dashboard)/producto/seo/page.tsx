import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { GeoTable, type GeoCell, type GeoRow } from '@/components/seo/GeoTable'
import { RunJobButton } from '@/components/seo/RunJobButton'
import { SerpTable, type SerpRow } from '@/components/seo/SerpTable'
import { checkSectionAccess } from '@/lib/auth'
import { gscSiteUrl, isGscConfigured } from '@/lib/gsc/client'
import { getBudgetStatus, type BudgetStatus } from '@/lib/jobs/budget'
import { FLAGS, isFlagEnabled, loadFlags } from '@/lib/jobs/flags'
import type { Db } from '@/lib/jobs/types'
import { GEO_ENGINE_LABELS, GEO_ENGINES, LLM_PROBE_PROVIDER, type GeoEngine } from '@/lib/seo/config'
import { PAGE_TYPE_LABELS } from '@/lib/seo/page-types'
import { getSeoDashboardData, type GeoProbeRow, type SeoDashboardData, type SerpCheckRow } from '@/lib/seo/queries'
import { aiShareOfVoice, byPageType, competitorMentions, opportunities, serpSummary, splitBrand, topNonBrand, totals, type QueryStat } from '@/lib/seo/summary'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Ventana de Search Console (la misma que muestra Google por defecto). */
const DAYS = 28
/** Una unidad = una llamada a la API de Search Console (100/día). */
const PROVEEDOR_GSC = 'gsc'
/** Una unidad = una búsqueda en SerpAPI (250/día). */
const PROVEEDOR_SERP = 'serpapi'
const ANSWER_CHARS = 600
const MAX_URLS = 60

const INTENT_LABELS: Record<string, string> = {
  destino: 'Destino',
  evento: 'Evento',
  categoria: 'Categoría',
  informativo: 'Informativo',
  marca: 'Marca',
}
/** Orden de la tabla SERP: primero la intención comercial. */
const INTENT_ORDER: Record<string, number> = { destino: 0, evento: 1, categoria: 2, informativo: 3, marca: 4 }

const CATEGORY_LABELS: Record<string, string> = {
  recomendacion: 'Recomendación',
  destino: 'Destino',
  evento: 'Evento',
  confianza: 'Confianza',
  marca: 'Marca',
}

// ---------------------------------------------------------------------------
// Formato (siempre acá, en el server: `toLocaleString` no da igual en el cliente)
// ---------------------------------------------------------------------------

function numero(value: number): string {
  return Math.round(value).toLocaleString('es-AR')
}

function decimal(value: number, digits = 1): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** `0.0123` → "1,23 %". */
function porcentaje(ratio: number, digits = 2): string {
  return `${decimal(ratio * 100, digits)} %`
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return '—'
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/** `https://www.siviajo.com/es/idea/123/slug` → `/es/idea/123/slug`; otros hosts quedan con host. */
function pathCorto(url: string, max = 70): string {
  let out = url
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const path = (u.pathname.replace(/\/+$/, '') || '/') + u.search
    out = host === 'www.siviajo.com' || host === 'siviajo.com' ? path : `${host}${path}`
  } catch {
    // Texto que no es URL: se muestra tal cual.
  }
  return out.length > max ? `${out.slice(0, max - 1)}…` : out
}

function presupuesto(b: BudgetStatus): string {
  return `${b.spentToday}${b.dailyCap ? ` / ${b.dailyCap}` : ''}`
}

/** Google devuelve el veredicto en inglés y en mayúsculas; acá se lee en castellano. */
function veredicto(verdict: string | null): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  switch (verdict) {
    case 'PASS':
      return { label: 'Indexada', tone: 'ok' }
    case 'PARTIAL':
      return { label: 'Con avisos', tone: 'warn' }
    case 'FAIL':
      return { label: 'Excluida', tone: 'warn' }
    case 'NEUTRAL':
      return { label: 'Sin indexar', tone: 'muted' }
    default:
      return { label: 'Sin inspeccionar', tone: 'muted' }
  }
}

const TONOS: Record<'ok' | 'warn' | 'muted', string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  muted: 'text-gray-500',
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/**
 * Todo el tablero en una lectura, con `try`: las tablas de la Fase 14 llegan
 * con su migración y, hasta entonces (o si Supabase se cae), la pantalla
 * abre igual con "sin datos".
 */
async function loadSeo(db: Db, site: string): Promise<SeoDashboardData | null> {
  try {
    return await getSeoDashboardData(db, site, DAYS)
  } catch (err) {
    console.error('[producto/seo] No se pudo leer el tablero:', err instanceof Error ? err.message : err)
    return null
  }
}

function queryRows(rows: QueryStat[]) {
  return rows.map(r => ({
    query: r.query,
    clicks: numero(r.clicks),
    impressions: numero(r.impressions),
    ctr: r.impressions > 0 ? porcentaje(r.clicks / r.impressions) : '—',
    position: r.impressions > 0 ? decimal(r.position) : '—',
  }))
}

/** Lectura más reciente y la anterior de cada consulta (por `checked_at`). */
function ultimasLecturas(serp: SerpCheckRow[]): Map<number, { latest: SerpCheckRow; previous: SerpCheckRow | null }> {
  const porConsulta = new Map<number, SerpCheckRow[]>()
  for (const c of serp) {
    const list = porConsulta.get(c.keyword_id) ?? []
    list.push(c)
    porConsulta.set(c.keyword_id, list)
  }
  const out = new Map<number, { latest: SerpCheckRow; previous: SerpCheckRow | null }>()
  for (const [id, list] of porConsulta) {
    list.sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at))
    out.set(id, { latest: list[0], previous: list[1] ?? null })
  }
  return out
}

function cambio(latest: number | null, previous: SerpCheckRow | null): Pick<SerpRow, 'change' | 'changeTone'> {
  if (!previous) return { change: 'nueva', changeTone: 'muted' }
  const prev = previous.position
  if (latest === null && prev === null) return { change: '=', changeTone: 'flat' }
  if (latest === null) return { change: 'salió', changeTone: 'down' }
  if (prev === null) return { change: 'entró', changeTone: 'up' }
  const diff = Math.round(prev - latest)
  if (diff > 0) return { change: `↑ ${diff}`, changeTone: 'up' }
  if (diff < 0) return { change: `↓ ${Math.abs(diff)}`, changeTone: 'down' }
  return { change: '=', changeTone: 'flat' }
}

function serpRows(data: SeoDashboardData): { rows: SerpRow[]; summary: ReturnType<typeof serpSummary> } {
  const intents = new Map(data.keywords.map(k => [k.id, k.intent]))
  const lecturas = ultimasLecturas(data.serp)

  const summary = serpSummary(
    [...lecturas.values()].map(({ latest }) => ({
      keyword: latest.keyword,
      position: latest.position,
      aiOverview: latest.ai_overview,
      inAiOverview: latest.in_ai_overview,
      localPackRank: latest.local_pack_rank,
    }))
  )

  const rows = [...lecturas.entries()]
    .map(([keywordId, { latest, previous }]) => {
      const intent = intents.get(keywordId) ?? ''
      const row: SerpRow = {
        keywordId,
        keyword: latest.keyword,
        intent: INTENT_LABELS[intent] ?? (intent || '—'),
        position: latest.position === null ? '—' : numero(latest.position),
        ...cambio(latest.position, previous),
        url: latest.url,
        path: latest.url ? pathCorto(latest.url, 50) : null,
        aiOverview: latest.ai_overview ? (latest.in_ai_overview ? 'sí · cita' : 'sí') : 'no',
        aiTone: latest.in_ai_overview ? 'ok' : latest.ai_overview ? 'warn' : 'muted',
        localPack: latest.local_pack_rank === null ? '—' : numero(latest.local_pack_rank),
        competitors: latest.competitors_in_top.length > 0 ? latest.competitors_in_top.join(', ') : '—',
      }
      return { row, intent, position: latest.position }
    })
    .sort(
      (a, b) =>
        (INTENT_ORDER[a.intent] ?? 9) - (INTENT_ORDER[b.intent] ?? 9) ||
        (a.position ?? Infinity) - (b.position ?? Infinity) ||
        a.row.keyword.localeCompare(b.row.keyword)
    )
    .map(r => r.row)

  return { rows, summary }
}

function geoCell(engine: GeoEngine, probe: GeoProbeRow | undefined): GeoCell {
  const base = { engine, engineLabel: GEO_ENGINE_LABELS[engine], error: null, answer: null, model: null }
  if (!probe) return { ...base, state: 'missing' }
  const answer = probe.answer ? (probe.answer.length > ANSWER_CHARS ? `${probe.answer.slice(0, ANSWER_CHARS).trimEnd()}…` : probe.answer) : null
  if (probe.error) return { ...base, state: 'error', error: probe.error, answer, model: probe.model }
  return { ...base, state: probe.cited ? 'cited' : probe.mentioned ? 'mentioned' : 'absent', answer, model: probe.model }
}

function geoData(data: SeoDashboardData) {
  const week = data.probes.reduce<string | null>((max, p) => (max === null || p.week > max ? p.week : max), null)
  const sondas = week ? data.probes.filter(p => p.week === week) : []

  const porMotor = new Map(aiShareOfVoice(sondas).map(e => [e.engine, e]))
  const share = GEO_ENGINES.map(engine => {
    const e = porMotor.get(engine)
    return {
      engine,
      label: GEO_ENGINE_LABELS[engine],
      asked: e?.asked ?? 0,
      answered: e?.answered ?? 0,
      mentioned: e?.mentioned ?? 0,
      cited: e?.cited ?? 0,
      share: e && e.answered > 0 ? porcentaje(e.share, 0) : '—',
    }
  })

  const competidores = competitorMentions(sondas)

  // Una fila por pregunta sondada esa semana; si un motor la preguntó dos veces, vale la última.
  const porPregunta = new Map<number, Map<GeoEngine, GeoProbeRow>>()
  for (const p of sondas) {
    const motores = porPregunta.get(p.prompt_id) ?? new Map<GeoEngine, GeoProbeRow>()
    const actual = motores.get(p.engine)
    if (!actual || Date.parse(p.asked_at) > Date.parse(actual.asked_at)) motores.set(p.engine, p)
    porPregunta.set(p.prompt_id, motores)
  }
  const prompts = new Map(data.prompts.map(p => [p.id, p]))
  const rows: GeoRow[] = [...porPregunta.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([promptId, motores]) => {
      const prompt = prompts.get(promptId)
      return {
        promptId,
        prompt: prompt?.prompt ?? `Pregunta #${promptId}`,
        category: prompt ? (CATEGORY_LABELS[prompt.category] ?? prompt.category) : '—',
        cells: GEO_ENGINES.map(engine => geoCell(engine, motores.get(engine))),
      }
    })

  return { week, share, competidores, rows }
}

async function loadPage() {
  const db = createAdminClient()
  const site = gscSiteUrl()

  const [data, flags, gscBudget, serpBudget, geoBudget] = await Promise.all([
    loadSeo(db, site),
    loadFlags(db),
    getBudgetStatus(db, PROVEEDOR_GSC),
    getBudgetStatus(db, PROVEEDOR_SERP),
    getBudgetStatus(db, LLM_PROBE_PROVIDER),
  ])

  const pages = data?.pages ?? []
  const queries = data?.queries ?? []
  const tot = totals(pages)
  const marca = splitBrand(queries)
  const totalClicks = marca.brand.clicks + marca.nonBrand.clicks

  const split = (s: typeof marca.brand) => ({
    clicks: numero(s.clicks),
    impressions: numero(s.impressions),
    position: s.impressions > 0 ? decimal(s.position) : '—',
    queries: numero(s.queries),
  })

  const serp = data ? serpRows(data) : { rows: [], summary: serpSummary([]) }
  const geo = data ? geoData(data) : { week: null, share: [], competidores: [], rows: [] }

  return {
    site,
    hasData: data !== null,
    gscOff: !isFlagEnabled(flags, FLAGS.gscWrites),
    gscUnconfigured: !isGscConfigured(),
    serpOff: !isFlagEnabled(flags, FLAGS.serpapiCalls),
    geoOff: !isFlagEnabled(flags, FLAGS.geoProbes),
    gscBudget,
    serpBudget,
    geoBudget,
    kpis: {
      clicks: numero(tot.clicks),
      impressions: numero(tot.impressions),
      ctr: tot.impressions > 0 ? porcentaje(tot.ctr) : '—',
      position: tot.impressions > 0 ? decimal(tot.position) : '—',
    },
    brand: split(marca.brand),
    nonBrand: split(marca.nonBrand),
    nonBrandPct: totalClicks > 0 ? porcentaje(marca.nonBrand.clicks / totalClicks, 0) : '—',
    byType: byPageType(pages).map(t => ({
      type: t.type,
      label: PAGE_TYPE_LABELS[t.type],
      pages: numero(t.pages),
      clicks: numero(t.clicks),
      impressions: numero(t.impressions),
      ctr: t.impressions > 0 ? porcentaje(t.ctr) : '—',
      position: t.impressions > 0 ? decimal(t.position) : '—',
    })),
    top: queryRows(topNonBrand(queries, 25)),
    oportunidades: queryRows(opportunities(queries)),
    serp,
    keywordsActivas: data?.keywords.filter(k => k.active).length ?? 0,
    geo,
    sitemaps: (data?.sitemaps ?? []).map(s => ({
      feedpath: s.feedpath,
      path: pathCorto(s.feedpath),
      submitted: fecha(s.last_submitted),
      downloaded: fecha(s.last_downloaded),
      pending: s.is_pending === null ? '—' : s.is_pending ? 'sí' : 'no',
      urls: s.submitted_urls === null ? '—' : `${numero(s.indexed_urls ?? 0)} / ${numero(s.submitted_urls)}`,
      errors: numero(s.errors ?? 0),
      warnings: numero(s.warnings ?? 0),
      hasErrors: (s.errors ?? 0) > 0,
    })),
    urls: [...(data?.urlStatus ?? [])]
      .sort((a, b) => Date.parse(b.inspected_at) - Date.parse(a.inspected_at))
      .slice(0, MAX_URLS)
      .map(u => {
        const v = veredicto(u.verdict)
        return {
          url: u.url,
          path: pathCorto(u.url),
          verdict: v.label,
          tone: v.tone,
          coverage: u.coverage_state,
          crawled: fecha(u.last_crawl_time),
          inspected: fecha(u.inspected_at),
        }
      }),
  }
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

function Kpi({ label, value, hint, title }: { label: string; value: string; hint?: string; title?: string }) {
  return (
    <div title={title}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

function FlagAviso({ flag, children }: { flag: string; children?: React.ReactNode }) {
  return (
    <p className="border-b border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <code>{flag}</code> está apagado en{' '}
      <Link href="/automatizacion" className="font-medium underline underline-offset-2">
        /automatizacion
      </Link>
      {children ?? ': el job termina omitido y estos números no se actualizan.'}
    </p>
  )
}

const TH = 'px-4 py-2 font-medium'
const THEAD = 'border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500'

function QueriesTable({ rows, ctr, empty }: { rows: ReturnType<typeof queryRows>; ctr: boolean; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-3 text-xs text-gray-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={THEAD}>
            <th className={TH}>Consulta</th>
            {ctr ? (
              <>
                <th className={TH}>Impresiones</th>
                <th className={TH}>CTR</th>
              </>
            ) : (
              <>
                <th className={TH}>Clics</th>
                <th className={TH}>Impresiones</th>
              </>
            )}
            <th className={TH}>Posición</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => (
            <tr key={r.query}>
              <td className="px-4 py-2 text-gray-900">{r.query}</td>
              {ctr ? (
                <>
                  <td className="px-4 py-2 tabular-nums text-gray-900">{r.impressions}</td>
                  <td className="px-4 py-2 tabular-nums text-gray-600">{r.ctr}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-2 tabular-nums text-gray-900">{r.clicks}</td>
                  <td className="px-4 py-2 tabular-nums text-gray-600">{r.impressions}</td>
                </>
              )}
              <td className="px-4 py-2 tabular-nums text-gray-600">{r.position}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * SEO y GEO de siviajo.com (Fase 14): Search Console del dominio entero,
 * posiciones en Google AR por SerpAPI y qué responden ChatGPT, Gemini y
 * Claude. Sólo lectura más los tres "correr ahora"; los jobs y los
 * interruptores viven en /automatizacion.
 */
export default async function SeoPage() {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) redirect('/dashboard')

  const p = await loadPage()
  const motores = GEO_ENGINES.map(engine => ({ engine, label: GEO_ENGINE_LABELS[engine] }))

  return (
    <div className="flex flex-col">
      <Header title="SEO y GEO" />
      <div className="space-y-6 p-6">
        <p className="text-xs text-gray-500">
          Search Console de todo siviajo.com, posiciones en Google AR y qué responden ChatGPT, Gemini y Claude. Ventana de {DAYS} días.
        </p>

        {!p.hasData && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No se pudo leer el tablero: las tablas de la Fase 14 todavía no están o Supabase no respondió. Mirá{' '}
            <Link href="/logs" className="font-medium underline underline-offset-2">
              /logs
            </Link>
            .
          </div>
        )}

        {/* 2. Search Console */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Search Console ({DAYS} días)</h2>
              <p className="text-xs text-gray-500">
                Propiedad <code>{p.site}</code> · {presupuesto(p.gscBudget)} llamadas hoy · el job diario trae páginas y consultas, lee los sitemaps e
                inspecciona URLs
              </p>
            </div>
            <RunJobButton
              endpoint="/api/seo/monitor/gsc"
              label="Sincronizar Search Console"
              title="Trae clics e impresiones por página y consulta, lee los sitemaps e inspecciona URLs (gasta de la cuota diaria)"
            />
          </div>

          {(p.gscOff || p.gscUnconfigured) &&
            (p.gscUnconfigured ? (
              <p className="border-b border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                Falta <code>GOOGLE_DRIVE_CREDENTIALS</code> en <code>/opt/hub/.env.local</code>: el job termina omitido y estos números no se actualizan.
              </p>
            ) : (
              <FlagAviso flag={FLAGS.gscWrites} />
            ))}

          <div className="grid gap-4 border-b border-gray-200 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Clics" value={p.kpis.clicks} />
            <Kpi label="Impresiones" value={p.kpis.impressions} />
            <Kpi label="CTR" value={p.kpis.ctr} />
            <Kpi label="Posición media" value={p.kpis.position} title="Ponderada por impresiones, como la calcula Google" />
          </div>

          <div className="grid gap-4 border-b border-gray-200 px-4 py-3 sm:grid-cols-2">
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">Marca</p>
              <p className="text-xl font-semibold tabular-nums text-gray-900">{p.brand.clicks} clics</p>
              <p className="text-xs text-gray-600">
                {p.brand.impressions} impresiones · posición {p.brand.position} · {p.brand.queries} consultas
              </p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">No marca</p>
              <p className="text-xl font-semibold tabular-nums text-gray-900">
                {p.nonBrand.clicks} clics <span className="text-sm font-normal text-gray-500">({p.nonBrandPct} del total)</span>
              </p>
              <p className="text-xs text-gray-600">
                {p.nonBrand.impressions} impresiones · posición {p.nonBrand.position} · {p.nonBrand.queries} consultas
              </p>
            </div>
          </div>

          <div className="px-4 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por plantilla</h3>
          </div>
          {p.byType.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500">Sin datos todavía: el job diario (o el botón de arriba) los trae.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>Plantilla</th>
                    <th className={TH}>Páginas</th>
                    <th className={TH}>Clics</th>
                    <th className={TH}>Impresiones</th>
                    <th className={TH}>CTR</th>
                    <th className={TH}>Posición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {p.byType.map(t => (
                    <tr key={t.type}>
                      <td className="px-4 py-2 font-medium text-gray-900">{t.label}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{t.pages}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-900">{t.clicks}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{t.impressions}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{t.ctr}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{t.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. Consultas no-marca */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Consultas no-marca: top por clics</h2>
              <p className="text-xs text-gray-500">Lo que ya trae tráfico sin que busquen la marca.</p>
            </div>
            <QueriesTable rows={p.top} ctr={false} empty="Sin consultas todavía." />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Consultas no-marca: para subir</h2>
              <p className="text-xs text-gray-500">Ya rankean entre 4 y 15 con impresiones: título, contenido y enlaces internos las suben al top 3.</p>
            </div>
            <QueriesTable rows={p.oportunidades} ctr empty="Ninguna consulta no-marca con impresiones entre las posiciones 4 y 15 todavía." />
          </section>
        </div>

        {/* 4. Posiciones en Google AR */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Posiciones en Google AR</h2>
              <p className="text-xs text-gray-500">
                {p.keywordsActivas} consultas seguidas · {presupuesto(p.serpBudget)} búsquedas SerpAPI hoy · el job semanal corre los lunes
              </p>
            </div>
            <RunJobButton endpoint="/api/seo/monitor/serp" label="Medir posiciones" title="Una búsqueda en SerpAPI por consulta seguida (gasta del presupuesto serpapi)" />
          </div>

          {p.serpOff && <FlagAviso flag={FLAGS.serpapiCalls} />}

          <div className="grid gap-4 border-b border-gray-200 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Consultas" value={numero(p.serp.summary.keywords)} hint="con lectura" />
            <Kpi label="Top 3" value={numero(p.serp.summary.top3)} />
            <Kpi label="Top 10" value={numero(p.serp.summary.top10)} />
            <Kpi label="Sin aparecer" value={numero(p.serp.summary.notRanking)} />
            <Kpi label="Con AI Overview" value={numero(p.serp.summary.withAiOverview)} title="Búsquedas donde Google muestra AI Overview" />
            <Kpi label="Citadas en AI Overview" value={numero(p.serp.summary.citedInAiOverview)} title="AI Overviews que citan a siviajo.com" />
            <Kpi label="En pack local" value={numero(p.serp.summary.inLocalPack)} />
          </div>

          <SerpTable rows={p.serp.rows} />
        </section>

        {/* 5. GEO */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Qué responde la IA (GEO)</h2>
              <p className="text-xs text-gray-500">
                {p.geo.week ? `Semana ${p.geo.week}` : 'Sin semana medida'} · {presupuesto(p.geoBudget)} preguntas hoy · cada pregunta se hace una vez por
                semana a cada motor, con búsqueda web y ubicación Argentina
              </p>
            </div>
            <RunJobButton endpoint="/api/seo/monitor/geo" label="Sondear IA" title="Hace cada pregunta a ChatGPT, Gemini y Claude (gasta del presupuesto llm_probe)" />
          </div>

          {p.geoOff && <FlagAviso flag={FLAGS.geoProbes} />}

          <div className="grid gap-4 border-b border-gray-200 px-4 py-3 sm:grid-cols-3">
            {p.geo.share.map(s => (
              <Kpi
                key={s.engine}
                label={s.label}
                value={s.asked > 0 ? `mencionada ${numero(s.mentioned)} de ${numero(s.answered)}` : '—'}
                hint={s.asked > 0 ? `${s.share} share · citada ${numero(s.cited)}${s.answered < s.asked ? ` · ${numero(s.asked - s.answered)} con error` : ''}` : 'sin sondas esta semana'}
                title="Mencionada = la respuesta nombra a Sí, Viajo; citada = enlaza a siviajo.com; share = mencionada / respondidas"
              />
            ))}
          </div>

          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Competidores más nombrados</h3>
            {p.geo.competidores.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">Ninguno todavía.</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-2">
                {p.geo.competidores.map(c => (
                  <li key={c.name} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                    {c.name} <span className="tabular-nums text-gray-500">×{numero(c.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <GeoTable rows={p.geo.rows} engines={motores} />
        </section>

        {/* 6. Indexación y sitemaps */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Indexación y sitemaps</h2>
            <p className="text-xs text-gray-500">Lo que Google dice de los sitemaps y de las últimas {MAX_URLS} URLs inspeccionadas.</p>
          </div>

          {p.sitemaps.length === 0 ? (
            <p className="border-b border-gray-200 px-4 py-3 text-xs text-gray-500">Sin sitemaps leídos todavía. El job diario guarda acá lo que responde Google.</p>
          ) : (
            <div className="overflow-x-auto border-b border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>Sitemap</th>
                    <th className={TH}>Enviado</th>
                    <th className={TH}>Descargado</th>
                    <th className={TH}>Pendiente</th>
                    <th className={TH} title="URLs indexadas / enviadas">
                      Indexadas / enviadas
                    </th>
                    <th className={TH}>Errores</th>
                    <th className={TH}>Avisos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {p.sitemaps.map(s => (
                    <tr key={s.feedpath}>
                      <td className="px-4 py-2">
                        <a href={s.feedpath} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1A237E] underline-offset-2 hover:underline">
                          {s.path}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{s.submitted}</td>
                      <td className="px-4 py-2 text-gray-600">{s.downloaded}</td>
                      <td className="px-4 py-2 text-gray-600">{s.pending}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-900">{s.urls}</td>
                      <td className={`px-4 py-2 tabular-nums ${s.hasErrors ? 'font-medium text-red-600' : 'text-gray-600'}`}>{s.errors}</td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{s.warnings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {p.urls.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500">Todavía no hay inspecciones guardadas. El job diario (o el botón de Search Console) las trae.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>URL</th>
                    <th className={TH} title="Veredicto de la inspección de Google y su estado de cobertura">
                      Indexación
                    </th>
                    <th className={TH} title="Última vez que Googlebot la rastreó">
                      Último rastreo
                    </th>
                    <th className={TH}>Inspeccionada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {p.urls.map(u => (
                    <tr key={u.url}>
                      <td className="px-4 py-2">
                        <a href={u.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1A237E] underline-offset-2 hover:underline" title={u.url}>
                          {u.path}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`font-medium ${TONOS[u.tone]}`}>{u.verdict}</span>
                        {u.coverage && <span className="block text-xs text-gray-500">{u.coverage}</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{u.crawled}</td>
                      <td className="px-4 py-2 text-gray-600">{u.inspected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
