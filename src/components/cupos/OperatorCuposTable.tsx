'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Plane, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { OPERATOR_REGION_LABELS, type OperatorCupoView, type OperatorRegion } from '@/lib/cupos/operator'

const REGION_ORDER: OperatorRegion[] = ['brasil', 'caribe', 'europa', 'latam', 'medio_oriente_asia', 'usa', 'argentina', 'otros']
const FARE_LABEL: Record<string, { label: string; cls: string }> = {
  AEREO: { label: 'Aéreo', cls: 'bg-sky-100 text-sky-800' },
  AEROTERRESTRE: { label: 'Aéreo + hotel', cls: 'bg-violet-100 text-violet-800' },
  GRUPAL: { label: 'Grupal', cls: 'bg-amber-100 text-amber-800' },
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const d = (s: string | null) => { if (!s) return '–'; const [y, m, dd] = s.split('-'); return `${dd}-${MONTHS[Number(m) - 1]} '${y.slice(2)}` }
const money = (n: number | null, cur: string) => (n === null ? '–' : `${cur === 'USD' ? 'US$' : cur} ${Math.round(n).toLocaleString('es-AR')}`)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type LoadResult = { id: number; ok: boolean; flight?: string; ida?: number; vuelta?: number; tc?: string[]; warnings?: string[]; reason?: string }
type LoadJob = { id: number; status: string; result: { loaded: number; total: number; results: LoadResult[] } | null; last_error: string | null }

/** Cupos de operadores mayoristas: salidas, lugares, neto agencia, nuestros cupos cercanos y carga masiva a la web. */
export function OperatorCuposTable() {
  const [rows, setRows] = useState<OperatorCupoView[]>([])
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [operator, setOperator] = useState<string>('all')
  const [region, setRegion] = useState<OperatorRegion | 'all'>('all')
  const [fare, setFare] = useState<string>('all')
  const [month, setMonth] = useState<string>('all')
  const [origin, setOrigin] = useState<string>('all')
  const [q, setQ] = useState('')
  const [withSeats, setWithSeats] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [job, setJob] = useState<LoadJob | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(() => fetch('/api/cupos/operadores').then(async res => {
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'No se pudieron cargar los cupos'); return }
    setRows(data.rows ?? []); setLastRun(data.lastRun ?? null)
  }).catch(() => setError('Error de conexión')).finally(() => setLoading(false)), [])
  useEffect(() => { load() }, [load])

  // Seguimiento de la carga en curso.
  useEffect(() => {
    if (!job || ['done', 'failed', 'cancelled'].includes(job.status)) return
    const t = setInterval(async () => {
      const res = await fetch(`/api/cupos/operadores/load?jobId=${job.id}`)
      const data = await res.json()
      if (!res.ok) return
      setJob(data)
      if (['done', 'failed', 'cancelled'].includes(data.status)) {
        const r = data.result as LoadJob['result']
        if (data.status === 'done' && r) toast.success(`${r.loaded} de ${r.total} cupos cargados a la web`)
        else toast.error(`La carga terminó con error: ${data.last_error ?? data.status}`)
        setSelected(new Set()); load()
      }
    }, 5000)
    return () => clearInterval(t)
  }, [job, load])

  const operators = useMemo(() => [...new Map(rows.map(r => [r.operator, r.operatorLabel])).entries()], [rows])
  const months = useMemo(() => [...new Set(rows.map(r => r.departureDate.slice(0, 7)))].sort(), [rows])
  const origins = useMemo(() => [...new Set(rows.map(r => r.origin))].sort(), [rows])
  const byOperator = useMemo(() => rows.filter(r => operator === 'all' || r.operator === operator), [rows, operator])
  const regionCounts = useMemo(() => { const m = new Map<string, number>(); for (const r of byOperator) m.set(r.region, (m.get(r.region) ?? 0) + 1); return m }, [byOperator])
  const filtered = useMemo(() => byOperator.filter(r =>
    (region === 'all' || r.region === region) && (fare === 'all' || r.fareType === fare) && (month === 'all' || r.departureDate.startsWith(month)) &&
    (origin === 'all' || r.origin === origin) && (!withSeats || r.departureSeats > 0) &&
    (!q.trim() || norm(`${r.operatorLabel} ${r.destination} ${r.name} ${r.hotel ?? ''} ${r.airline ?? ''}`).includes(norm(q.trim())))), [byOperator, region, fare, month, origin, withSeats, q])
  const seatsTotal = filtered.reduce((n, r) => n + r.departureSeats, 0)
  const selectable = filtered.filter(r => r.loadable)
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.id))
  const toggle = (id: number) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(s => { const n = new Set(s); if (allSelected) selectable.forEach(r => n.delete(r.id)); else selectable.forEach(r => n.add(r.id)); return n })
  const running = Boolean(job && !['done', 'failed', 'cancelled'].includes(job.status))

  const send = async () => {
    const ids = [...selected]
    const chosen = rows.filter(r => selected.has(r.id))
    const ops = [...new Set(chosen.map(r => r.operatorLabel))].join(', ')
    if (!window.confirm(`¿Cargar ${ids.length} cupo(s) de ${ops} a la web?\n\nCada vuelo se verifica en Sabre (aerolínea, número y fechas). Se crean ida y vuelta en HUB con el proveedor del operador, sus lugares y el neto agencia, y se suben a TC casados, sin venta "sólo vuelo". Los que no coincidan no se cargan.`)) return
    setSending(true)
    try {
      const res = await fetch('/api/cupos/operadores/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo encolar'); return }
      toast.success(`Carga en curso: ${data.count} cupo(s). Tarda ~20 s por cupo.`)
      setJob({ id: data.jobId, status: 'pending', result: null, last_error: null })
    } catch { toast.error('Error de conexión') } finally { setSending(false) }
  }

  if (loading) return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando cupos de operadores…</div>
  if (error) return <p className="py-10 text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cupos de operadores mayoristas (no son nuestros), leídos todos los días de sus portales: salidas, lugares que quedan y neto agencia por persona. Al lado, nuestros cupos al mismo destino a ±7 días.
        {lastRun && <> Última lectura: {new Date(lastRun).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.</>}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setRegion('all')} className={`rounded-full border px-3 py-1 text-xs ${region === 'all' ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-muted'}`}>Todas ({byOperator.length})</button>
        {REGION_ORDER.filter(r => regionCounts.get(r)).map(r => (
          <button key={r} onClick={() => setRegion(r)} className={`rounded-full border px-3 py-1 text-xs ${region === r ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-muted'}`}>{OPERATOR_REGION_LABELS[r]} ({regionCounts.get(r)})</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={operator} onChange={e => setOperator(e.target.value)} className="h-9 rounded border px-2 text-sm font-medium"><option value="all">Todos los operadores</option>{operators.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar destino, hotel, aerolínea…" className="h-9 w-60" />
        <select value={fare} onChange={e => setFare(e.target.value)} className="h-9 rounded border px-2 text-sm"><option value="all">Todos los tipos</option>{Object.entries(FARE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded border px-2 text-sm"><option value="all">Todos los meses</option>{months.map(m => <option key={m} value={m}>{MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}</select>
        <select value={origin} onChange={e => setOrigin(e.target.value)} className="h-9 rounded border px-2 text-sm"><option value="all">Todos los orígenes</option>{origins.map(o => <option key={o} value={o}>Desde {o}</option>)}</select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={withSeats} onChange={e => setWithSeats(e.target.checked)} />Sólo con lugares</label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} tarifas · {seatsTotal} lugares</span>
      </div>

      {(selected.size > 0 || job) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
          {selected.size > 0 && <><span className="font-medium text-blue-900">{selected.size} seleccionado(s)</span>
            <Button size="sm" onClick={send} disabled={sending || running}>{sending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}Cargar a la web</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={running}>Limpiar</Button></>}
          {running && <span className="flex items-center gap-1 text-blue-800"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando: se verifica cada vuelo en Sabre y se sube a TC…</span>}
          {job?.status === 'done' && job.result && (
            <div className="w-full space-y-0.5 text-xs">
              <div className="font-medium">{job.result.loaded} de {job.result.total} cargados</div>
              {job.result.results.map(r => (
                <div key={r.id} className="flex items-start gap-1">
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                  <span>{r.flight ?? `Tarifa ${r.id}`}: {r.ok ? <>cargado {r.ida && <Link href={`/flights/${r.ida}`} className="text-blue-700 hover:underline">(ver en HUB)</Link>}{r.warnings?.length ? ` · ojo: ${r.warnings.join('; ')}` : ''}</> : r.reason}</span>
                </div>
              ))}
              <button className="text-muted-foreground underline" onClick={() => setJob(null)}>Cerrar</button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left"><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0 || running} title="Seleccionar todos los que se pueden cargar" /></th>
              <th className="px-3 py-2 text-left">Operador</th><th className="px-3 py-2 text-left">Salida</th><th className="px-3 py-2 text-left">Destino</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-left">Aéreo</th>
              <th className="px-3 py-2 text-right">Lugares</th><th className="px-3 py-2 text-right" title="Neto agencia por persona (base doble). Debajo, lo que paga el pasajero">Neto pp</th><th className="px-3 py-2 text-left">Nuestro cupo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Sin salidas con esos filtros</td></tr>}
            {filtered.map(r => {
              const fl = FARE_LABEL[r.fareType] ?? { label: r.fareType, cls: 'bg-slate-100 text-slate-700' }
              return (
                <tr key={r.id} className={`${r.departureSeats === 0 ? 'opacity-50' : ''} ${selected.has(r.id) ? 'bg-blue-50/60' : ''}`}>
                  <td className="px-3 py-2 align-top">
                    {r.loadedFlightId
                      ? <Link href={`/flights/${r.loadedFlightId}`} title="Ya está cargado en la web: ver en HUB"><CheckCircle2 className="h-4 w-4 text-green-600" /></Link>
                      : <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={!r.loadable || running} title={r.loadable ? 'Seleccionar para cargar a la web' : (r.loadReason ?? 'No se puede cargar')} />}
                  </td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.operatorLabel}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2"><div className="font-medium">{d(r.departureDate)}</div><div className="text-[11px] text-muted-foreground">{r.nights ? `${r.nights} noches · vuelta ${d(r.returnDate)}` : r.returnDate ? `vuelta ${d(r.returnDate)}` : ''}</div></td>
                  <td className="px-3 py-2"><div className="font-medium">{r.destination}</div><div className="text-[11px] text-muted-foreground">desde {r.origin}</div></td>
                  <td className="max-w-[280px] px-3 py-2"><Badge className={`${fl.cls} mb-0.5 text-[10px]`}>{fl.label}</Badge><div className="truncate text-xs" title={r.name}>{r.name}</div>{r.hotel && <div className="truncate text-[11px] text-muted-foreground" title={r.hotel}>{r.hotel}</div>}</td>
                  <td className="px-3 py-2 text-xs"><div>{r.airline ?? '–'}{r.direct === true ? ' · directo' : r.direct === false ? ' · con escala' : ''}</div><div className="text-[11px] text-muted-foreground">{[r.flights, r.schedule].filter(Boolean).join(' · ')}</div></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={r.seatsDetail ? `La salida aparece repetida en el fixture: ${r.seatsDetail}` : undefined}>
                    <div className={`font-semibold ${r.departureSeats === 0 ? 'text-slate-400' : r.departureSeats <= 3 ? 'text-red-600' : ''}`}>{r.departureSeats}</div>
                    {r.seatsSold ? <div className="text-[11px] text-green-700">−{r.seatsSold} vendidos</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={r.status !== 'ok' ? (r.error ?? 'Sin tarifa en la búsqueda') : `Por persona: tarifa sin tasas ${money(r.grossPp, r.currency)} · comisión ${money(r.commissionPp, r.currency)} · tasas, DNT, gastos e IVA ${money(r.taxesPp, r.currency)}${r.landTaxPp ? ` · impuesto del terrestre no incluido ${money(r.landTaxPp, r.currency)}` : ''} · el pasajero paga ${money(r.salePp, r.currency)}`}>
                    {r.status === 'ok' ? <><div className="font-medium">{money(r.netPp, r.currency)}</div><div className="text-[11px] text-muted-foreground">venta {money(r.salePp, r.currency)}</div></> : <span className="text-xs text-amber-700">{r.status === 'no_results' ? 'sin tarifa' : 'error'}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.own.length === 0 ? <span className="text-muted-foreground">–</span> : r.own.slice(0, 2).map(o => (
                      <Link key={o.flightId} href={`/flights/${o.flightId}`} className="mb-0.5 flex items-center gap-1 text-blue-700 hover:underline">
                        <Plane className="h-3 w-3" />{d(o.date)}{o.days !== 0 ? ` (${o.days > 0 ? '+' : ''}${o.days} d)` : ''} · {o.remaining}/{o.total}
                      </Link>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
