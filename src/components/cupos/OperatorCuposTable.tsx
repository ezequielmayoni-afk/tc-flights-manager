'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plane } from 'lucide-react'
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

/** Cupos de operadores mayoristas (Eurovips): salidas, lugares, neto agencia y nuestros cupos cercanos. */
export function OperatorCuposTable() {
  const [rows, setRows] = useState<OperatorCupoView[]>([])
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [region, setRegion] = useState<OperatorRegion | 'all'>('all')
  const [fare, setFare] = useState<string>('all')
  const [month, setMonth] = useState<string>('all')
  const [origin, setOrigin] = useState<string>('all')
  const [q, setQ] = useState('')
  const [withSeats, setWithSeats] = useState(true)

  useEffect(() => {
    fetch('/api/cupos/operadores').then(async res => {
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'No se pudieron cargar los cupos'); return }
      setRows(data.rows ?? []); setLastRun(data.lastRun ?? null)
    }).catch(() => setError('Error de conexión')).finally(() => setLoading(false))
  }, [])

  const months = useMemo(() => [...new Set(rows.map(r => r.departureDate.slice(0, 7)))].sort(), [rows])
  const origins = useMemo(() => [...new Set(rows.map(r => r.origin))].sort(), [rows])
  const regionCounts = useMemo(() => { const m = new Map<string, number>(); for (const r of rows) m.set(r.region, (m.get(r.region) ?? 0) + 1); return m }, [rows])
  const filtered = useMemo(() => rows.filter(r =>
    (region === 'all' || r.region === region) && (fare === 'all' || r.fareType === fare) && (month === 'all' || r.departureDate.startsWith(month)) &&
    (origin === 'all' || r.origin === origin) && (!withSeats || r.departureSeats > 0) &&
    (!q.trim() || norm(`${r.destination} ${r.name} ${r.hotel ?? ''} ${r.airline ?? ''}`).includes(norm(q.trim())))), [rows, region, fare, month, origin, withSeats, q])
  const seatsTotal = filtered.reduce((n, r) => n + r.departureSeats, 0)

  if (loading) return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando cupos de operadores…</div>
  if (error) return <p className="py-10 text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cupos de <b>Eurovips</b> (no son nuestros), leídos todos los días del portal del operador: salidas, lugares que quedan y neto agencia por persona. Al lado, nuestros cupos al mismo destino a ±7 días.
        {lastRun && <> Última lectura: {new Date(lastRun).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.</>}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setRegion('all')} className={`rounded-full border px-3 py-1 text-xs ${region === 'all' ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-muted'}`}>Todas ({rows.length})</button>
        {REGION_ORDER.filter(r => regionCounts.get(r)).map(r => (
          <button key={r} onClick={() => setRegion(r)} className={`rounded-full border px-3 py-1 text-xs ${region === r ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-muted'}`}>{OPERATOR_REGION_LABELS[r]} ({regionCounts.get(r)})</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar destino, hotel, aerolínea…" className="h-9 w-64" />
        <select value={fare} onChange={e => setFare(e.target.value)} className="h-9 rounded border px-2 text-sm"><option value="all">Todos los tipos</option>{Object.entries(FARE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded border px-2 text-sm"><option value="all">Todos los meses</option>{months.map(m => <option key={m} value={m}>{MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}</select>
        <select value={origin} onChange={e => setOrigin(e.target.value)} className="h-9 rounded border px-2 text-sm"><option value="all">Todos los orígenes</option>{origins.map(o => <option key={o} value={o}>Desde {o}</option>)}</select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={withSeats} onChange={e => setWithSeats(e.target.checked)} />Sólo con lugares</label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} tarifas · {seatsTotal} lugares</span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Salida</th><th className="px-3 py-2 text-left">Destino</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-left">Aéreo</th>
              <th className="px-3 py-2 text-right">Lugares</th><th className="px-3 py-2 text-right" title="Neto agencia por persona (base doble)">Neto pp</th><th className="px-3 py-2 text-left">Nuestro cupo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin salidas con esos filtros</td></tr>}
            {filtered.map(r => {
              const fl = FARE_LABEL[r.fareType] ?? { label: r.fareType, cls: 'bg-slate-100 text-slate-700' }
              return (
                <tr key={r.id} className={r.departureSeats === 0 ? 'opacity-50' : ''}>
                  <td className="whitespace-nowrap px-3 py-2"><div className="font-medium">{d(r.departureDate)}</div><div className="text-[11px] text-muted-foreground">{r.nights ? `${r.nights} noches · vuelta ${d(r.returnDate)}` : r.returnDate ? `vuelta ${d(r.returnDate)}` : ''}</div></td>
                  <td className="px-3 py-2"><div className="font-medium">{r.destination}</div><div className="text-[11px] text-muted-foreground">desde {r.origin}</div></td>
                  <td className="max-w-[280px] px-3 py-2"><Badge className={`${fl.cls} mb-0.5 text-[10px]`}>{fl.label}</Badge><div className="truncate text-xs" title={r.name}>{r.name}</div>{r.hotel && <div className="truncate text-[11px] text-muted-foreground" title={r.hotel}>{r.hotel}</div>}</td>
                  <td className="px-3 py-2 text-xs"><div>{r.airline ?? '–'}{r.direct === true ? ' · directo' : r.direct === false ? ' · con escala' : ''}</div><div className="text-[11px] text-muted-foreground">{[r.flights, r.schedule].filter(Boolean).join(' · ')}</div></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={r.seatsDetail ? `La salida aparece repetida en el fixture: ${r.seatsDetail}` : undefined}>
                    <div className={`font-semibold ${r.departureSeats === 0 ? 'text-slate-400' : r.departureSeats <= 3 ? 'text-red-600' : ''}`}>{r.departureSeats}</div>
                    {r.seatsSold ? <div className="text-[11px] text-green-700">−{r.seatsSold} vendidos</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={r.status !== 'ok' ? (r.error ?? 'Sin tarifa en la búsqueda') : `Bruto ${money(r.grossPp, r.currency)} · comisión ${money(r.commissionPp, r.currency)} · tasas y gastos ${money(r.taxesPp, r.currency)}${r.landTaxPp ? ` · impuesto terrestre no incluido ${money(r.landTaxPp, r.currency)}` : ''}`}>
                    {r.status === 'ok' ? <><div className="font-medium">{money(r.netPp, r.currency)}</div><div className="text-[11px] text-muted-foreground">bruto {money(r.grossPp, r.currency)}</div></> : <span className="text-xs text-amber-700">{r.status === 'no_results' ? 'sin tarifa' : 'error'}</span>}
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
