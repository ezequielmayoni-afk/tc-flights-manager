'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, RefreshCw, MessageSquare, DollarSign, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'

interface PackageRow {
  package_id: number
  tc_package_id: number
  title: string
  price_per_pax: number | null
  currency: string | null
  ads_total: number
  ads_active: number
  spend: number
  conversations: number
  cost_per_conversation: number | null
  impressions: number
  clicks: number
  ctr: number | null
}

interface SummaryResponse {
  packages: PackageRow[]
  period_days: number
  since: string
  totals: { spend: number; conversations: number }
}

type SortKey = 'title' | 'ads_active' | 'spend' | 'conversations' | 'cost_per_conversation' | 'ctr'
type SortDir = 'asc' | 'desc'

const PRESETS = [
  { value: 1, label: 'Hoy', metaPreset: 'today' },
  { value: 7, label: '7 días', metaPreset: 'last_7d' },
  { value: 14, label: '14 días', metaPreset: 'last_14d' },
  { value: 28, label: '28 días', metaPreset: 'last_28d' },
  { value: 90, label: '90 días', metaPreset: 'last_90d' },
] as const

export default function MarketingConversationsPage() {
  const [days, setDays] = useState<number>(7)
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('conversations')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/packages/marketing/conversations-summary?days=${days}`)
      const json = await r.json()
      if (!r.ok) {
        toast.error(json.error || `Error ${r.status}`)
        setData(null)
        return
      }
      setData(json)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const syncInsights = async () => {
    setSyncing(true)
    try {
      const preset = PRESETS.find(p => p.value === days)?.metaPreset || 'last_7d'
      const r = await fetch('/api/meta/insights/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_preset: preset }),
      })
      const json = await r.json()
      if (!r.ok) {
        toast.error(json.error || `Sync falló (${r.status})`)
        return
      }
      toast.success(`Insights sincronizados (${preset})`)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  const filtered = (data?.packages || []).filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.title.toLowerCase().includes(q) || String(p.tc_package_id).includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir
    return ((av as number) - (bv as number)) * dir
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <Link href="/packages/marketing" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-3 w-3 mr-1" /> Marketing
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-blue-600" />
            Conversaciones por paquete
          </h1>
          <p className="text-sm text-muted-foreground">
            Suma de spend y conversaciones iniciadas (Messenger/WhatsApp) por cada paquete en marketing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncInsights} disabled={syncing || loading}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar Meta
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Period selector + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex bg-muted rounded p-0.5 gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                days === p.value ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Buscar por título o ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 text-sm"
        />
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            Desde {data.since} ({data.period_days}d)
          </span>
        )}
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-xs text-muted-foreground">Paquetes</p>
            <p className="text-2xl font-bold">{data.packages.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-xs text-muted-foreground">Conversaciones</p>
            <p className="text-2xl font-bold text-blue-600">{data.totals.conversations.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-xs text-muted-foreground">Gasto total</p>
            <p className="text-2xl font-bold text-purple-600">${data.totals.spend.toFixed(2)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-xs text-muted-foreground">Costo / conversación</p>
            <p className="text-2xl font-bold text-green-600">
              {data.totals.conversations > 0
                ? `$${(data.totals.spend / data.totals.conversations).toFixed(2)}`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Cargando...
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium w-20">ID</th>
                  <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort('title')}>
                    Paquete<SortIcon k="title" />
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:bg-muted whitespace-nowrap" onClick={() => handleSort('ads_active')}>
                    Ads activos<SortIcon k="ads_active" />
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort('spend')}>
                    Spend<SortIcon k="spend" />
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort('conversations')}>
                    Conversaciones<SortIcon k="conversations" />
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:bg-muted whitespace-nowrap" onClick={() => handleSort('cost_per_conversation')}>
                    $/Conv<SortIcon k="cost_per_conversation" />
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort('ctr')}>
                    CTR<SortIcon k="ctr" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {data ? 'Sin datos para este período' : 'Sin datos'}
                    </td>
                  </tr>
                ) : sorted.map((p) => {
                  const highCPC = p.cost_per_conversation && p.cost_per_conversation > 50
                  const noConvers = p.spend > 10 && p.conversations === 0
                  return (
                    <tr key={p.package_id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.tc_package_id}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/packages/marketing#pkg-row-${p.package_id}`} className="font-medium hover:text-blue-600 hover:underline">
                          {p.title}
                        </Link>
                        {p.ads_total > p.ads_active && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            ({p.ads_total - p.ads_active} pausados)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={p.ads_active > 0 ? 'font-semibold text-green-600' : 'text-muted-foreground'}>
                          {p.ads_active}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">${p.spend.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${p.conversations > 0 ? 'text-blue-700' : 'text-muted-foreground'}`}>
                          {p.conversations}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.cost_per_conversation !== null ? (
                          <span className={`font-mono ${highCPC ? 'text-red-600 font-semibold' : noConvers ? 'text-amber-600' : ''}`}>
                            ${p.cost_per_conversation.toFixed(2)}
                            {highCPC && ' ⚠️'}
                          </span>
                        ) : noConvers ? (
                          <span className="text-amber-600 text-xs">Sin convers.</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {p.ctr !== null ? `${p.ctr.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Las métricas se calculan desde <code className="bg-muted px-1 rounded">meta_ad_insights</code>. Click en
        <strong> Sincronizar Meta</strong> para traer los últimos datos desde Business Manager si están desactualizados.
        <DollarSign className="h-3 w-3 inline ml-1" /> Costo/conv {'>'} $50 se marca en rojo.
      </p>
    </div>
  )
}
