'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Users, Target, MessageSquare, X, Send, Trophy, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts'
import type { VendedoresData, VendedorMonthData } from '@/lib/google-sheets/client'

interface Props {
  initialData: VendedoresData
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

function formatMonth(m: string): string {
  const [year, month] = m.split('-')
  return `${MONTH_LABELS[month] || month} ${year.slice(2)}`
}

function formatUSD(val: number): string {
  return `USD $${val.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function getPercentageColor(pct: number): string {
  if (pct >= 100) return 'text-green-700 bg-green-50'
  if (pct >= 70) return 'text-yellow-700 bg-yellow-50'
  return 'text-red-700 bg-red-50'
}

function getBarColor(pct: number): string {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70) return '#ca8a04'
  return '#dc2626'
}

type TabKey = 'Comercial' | 'Sports'

// "APELLIDO,NOMBRE" → "Nombre Apellido"
function formatFullName(raw: string): string {
  const parts = raw.split(',')
  if (parts.length < 2) return raw
  const apellido = parts[0].trim()
  const nombre = parts[1].trim()
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return `${cap(nombre)} ${cap(apellido)}`
}

export function VendedoresDashboard({ initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(data.availableMonths[data.availableMonths.length - 1])
  const [rangeFrom, setRangeFrom] = useState(data.availableMonths[data.availableMonths.length - 1])
  const [rangeTo, setRangeTo] = useState(data.availableMonths[data.availableMonths.length - 1])
  const [activeTab, setActiveTab] = useState<TabKey>('Comercial')
  const [trendFrom, setTrendFrom] = useState(data.availableMonths[0])
  const [trendTo, setTrendTo] = useState(data.availableMonths[data.availableMonths.length - 1])
  // Table sorting
  type SortCol = 'nombre' | 'objetivo' | 'producido' | 'porcentaje' | 'qVentas' | 'qChicas' | 'alta' | 'baja'
  const [tableSortCol, setTableSortCol] = useState<SortCol>('producido')
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleTableSort = (col: SortCol) => {
    if (tableSortCol === col) {
      setTableSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setTableSortCol(col)
      setTableSortDir('desc')
    }
  }

  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  // Checked vendedores count towards objective totals
  const [checkedVendedores, setCheckedVendedores] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    initialData.vendedores.forEach(v => {
      const md = v.monthlyData.find(m => m.month === initialData.availableMonths[initialData.availableMonths.length - 1])
      if (md && md.objetivo > 0) initial.add(v.nombre)
    })
    return initial
  })

  // Vendedor dates (fecha alta/baja) from Supabase
  const [vendedorDates, setVendedorDates] = useState<Record<string, { fecha_alta: string | null; fecha_baja: string | null }>>({})

  const loadDates = useCallback(async () => {
    try {
      const res = await fetch('/api/vendedores/dates')
      if (res.ok) {
        const { dates } = await res.json()
        const map: Record<string, { fecha_alta: string | null; fecha_baja: string | null }> = {}
        for (const d of dates) {
          map[d.nombre] = { fecha_alta: d.fecha_alta, fecha_baja: d.fecha_baja }
        }
        setVendedorDates(map)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadDates() }, [loadDates])

  const saveDate = async (nombre: string, field: 'fecha_alta' | 'fecha_baja', value: string) => {
    const current = vendedorDates[nombre] || { fecha_alta: null, fecha_baja: null }
    const updated = { ...current, [field]: value || null }
    setVendedorDates(prev => ({ ...prev, [nombre]: updated }))

    await fetch('/api/vendedores/dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, ...updated }),
    })
  }

  const toggleVendedor = (nombre: string) => {
    setCheckedVendedores(prev => {
      const next = new Set(prev)
      if (next.has(nombre)) next.delete(nombre)
      else next.add(nombre)
      return next
    })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/vendedores?refresh=true')
      if (res.ok) {
        const newData = await res.json()
        setData(newData)
      }
    } finally {
      setRefreshing(false)
    }
  }

  // Filter vendedores by team
  const teamVendedores = useMemo(() =>
    data.vendedores.filter(v => v.equipo === activeTab),
    [data.vendedores, activeTab]
  )

  // Get data for selected month (used by table)
  const getMonthData = (md: VendedorMonthData[]) =>
    md.find(m => m.month === selectedMonth)

  // Get aggregated data across a range of months
  const getRangeData = (md: VendedorMonthData[]) => {
    const months = md.filter(m => m.month >= rangeFrom && m.month <= rangeTo)
    const objetivo = months.reduce((sum, m) => sum + m.objetivo, 0)
    const producido = months.reduce((sum, m) => sum + m.producido, 0)
    const porcentaje = objetivo > 0 ? (producido / objetivo) * 100 : 0
    return { objetivo, producido, porcentaje }
  }

  const isRangeMode = rangeFrom !== rangeTo
  const rangeMonthCount = data.availableMonths.filter(m => m >= rangeFrom && m <= rangeTo).length

  // Stats for range - based on checked vendedores
  const stats = useMemo(() => {
    const checkedTeamVendedores = teamVendedores.filter(v => checkedVendedores.has(v.nombre))

    let totalObjetivo = 0
    let totalProducido = 0

    checkedTeamVendedores.forEach(v => {
      const rd = getRangeData(v.monthlyData)
      totalObjetivo += rd.objetivo
      totalProducido += rd.producido
    })

    const porcentaje = totalObjetivo > 0 ? (totalProducido / totalObjetivo) * 100 : 0

    const vendedoresRange = checkedTeamVendedores
      .map(v => {
        const rd = getRangeData(v.monthlyData)
        return { nombre: v.nombre, ...rd }
      })
      .filter(v => v.objetivo > 0)

    const sorted = [...vendedoresRange].sort((a, b) => b.porcentaje - a.porcentaje)
    const topPerformer = sorted[0]
    const bottomPerformer = sorted[sorted.length - 1]

    const checkedCount = checkedTeamVendedores.length

    return {
      objetivo: totalObjetivo,
      producido: totalProducido,
      porcentaje,
      checkedCount,
      topPerformer: topPerformer?.nombre || '-',
      topPct: topPerformer?.porcentaje || 0,
      bottomPerformer: bottomPerformer?.nombre || '-',
      bottomPct: bottomPerformer?.porcentaje || 0,
    }
  }, [data, activeTab, rangeFrom, rangeTo, teamVendedores, checkedVendedores])

  // Chart data: vendedores bar chart (only checked, aggregated by range)
  const barChartData = useMemo(() =>
    teamVendedores
      .filter(v => checkedVendedores.has(v.nombre))
      .map(v => {
        const rd = getRangeData(v.monthlyData)
        return {
          nombre: formatFullName(v.nombre),
          producido: rd.producido,
          objetivo: rd.objetivo,
          porcentaje: rd.porcentaje,
        }
      })
      .filter(v => v.objetivo > 0)
      .sort((a, b) => b.porcentaje - a.porcentaje),
    [teamVendedores, rangeFrom, rangeTo, checkedVendedores]
  )

  // Line chart: monthly trend (filtered by range)
  const trendData = useMemo(() => {
    const teamData = data.teams.find(t => t.equipo === activeTab)
    if (!teamData) return []
    return teamData.monthlyData
      .filter(m => (m.objetivo > 0 || m.producido > 0) && m.month >= trendFrom && m.month <= trendTo)
      .map(m => ({
        month: formatMonth(m.month),
        rawMonth: m.month,
        producido: m.producido,
        objetivo: m.objetivo,
        porcentaje: m.porcentaje,
      }))
  }, [data.teams, activeTab, trendFrom, trendTo])

  // Chat handler
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    const newMessages = [...chatMessages, { role: 'user' as const, content: userMsg }]
    setChatMessages(newMessages)
    setChatLoading(true)

    try {
      const res = await fetch('/api/vendedores/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, data }),
      })

      if (!res.ok) throw new Error('Chat request failed')

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let assistantMsg = ''

      setChatMessages([...newMessages, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const parsed = JSON.parse(payload)
              if (parsed.text) {
                assistantMsg += parsed.text
                setChatMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: assistantMsg }
                  return updated
                })
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Error al procesar la consulta. Verificá que la API key de Anthropic esté configurada.' },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  const suggestedQuestions = [
    '¿Quiénes son los top 5 vendedores este mes?',
    '¿Cómo viene el equipo comparado al mes anterior?',
    '¿Qué vendedores están por debajo del 50%?',
    '¿Cuál es la tendencia de facturación?',
  ]

  const tabs: TabKey[] = ['Comercial', 'Sports']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Vendedores</h1>
          <p className="text-muted-foreground text-sm">
            Datos desde Google Sheets - Actualizado: {new Date(data.lastUpdated).toLocaleString('es-AR')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <select
              value={rangeFrom}
              onChange={(e) => {
                setRangeFrom(e.target.value)
                if (e.target.value > rangeTo) setRangeTo(e.target.value)
                setSelectedMonth(e.target.value)
              }}
              className="border rounded-lg px-2 py-2 text-sm bg-white"
            >
              {data.availableMonths.map(m => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
            <span className="text-muted-foreground">a</span>
            <select
              value={rangeTo}
              onChange={(e) => {
                setRangeTo(e.target.value)
                if (e.target.value < rangeFrom) setRangeFrom(e.target.value)
              }}
              className="border rounded-lg px-2 py-2 text-sm bg-white"
            >
              {data.availableMonths.filter(m => m >= rangeFrom).map(m => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
            {isRangeMode && (
              <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded">
                {rangeMonthCount} meses
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={() => setChatOpen(!chatOpen)}
            className="bg-[#1A237E] hover:bg-[#283593]"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Consultar IA
          </Button>
        </div>
      </div>

      {/* Team Tabs */}
      <div className="border-b">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#1A237E] text-[#1A237E]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Target className="h-4 w-4" />
            Objetivo ({stats.checkedCount} vendedores)
          </div>
          <p className="text-xl font-bold">{formatUSD(stats.objetivo)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            Producido
          </div>
          <p className="text-xl font-bold">{formatUSD(stats.producido)}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getPercentageColor(stats.porcentaje)}`}>
            {stats.porcentaje.toFixed(1)}%
          </span>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Trophy className="h-4 w-4 text-green-600" />
            Top Vendedor
          </div>
          <p className="text-sm font-bold truncate">{stats.topPerformer !== '-' ? formatFullName(stats.topPerformer) : '-'}</p>
          <span className="text-xs text-green-700">{stats.topPct.toFixed(1)}%</span>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Menor Rendimiento
          </div>
          <p className="text-sm font-bold truncate">{stats.bottomPerformer !== '-' ? formatFullName(stats.bottomPerformer) : '-'}</p>
          <span className="text-xs text-red-700">{stats.bottomPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Individual Performance */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4">
            Rendimiento Individual - {isRangeMode ? `${formatMonth(rangeFrom)} a ${formatMonth(rangeTo)}` : formatMonth(rangeFrom)}
          </h3>
          <div style={{ height: Math.max(300, barChartData.length * 35) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} layout="vertical" margin={{ left: 80, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nombre" width={75} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [formatUSD(Number(value)), '']}
                  labelFormatter={(label) => label}
                />
                <Bar dataKey="producido" name="Producido" radius={[0, 4, 4, 0]}>
                  {barChartData.map((entry, index) => (
                    <Cell key={index} fill={getBarColor(entry.porcentaje)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Line Chart - Monthly Trend */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Tendencia Mensual - {activeTab}</h3>
            <div className="flex items-center gap-2 text-sm">
              <select
                value={trendFrom}
                onChange={(e) => setTrendFrom(e.target.value)}
                className="border rounded px-2 py-1 text-xs bg-white"
              >
                {data.availableMonths.map(m => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
              <span className="text-gray-400">→</span>
              <select
                value={trendTo}
                onChange={(e) => setTrendTo(e.target.value)}
                className="border rounded px-2 py-1 text-xs bg-white"
              >
                {data.availableMonths.filter(m => m >= trendFrom).map(m => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => [formatUSD(Number(value)), '']} />
                <Legend />
                <Line type="monotone" dataKey="objetivo" stroke="#94a3b8" strokeDasharray="5 5" name="Objetivo" dot={false} />
                <Line type="monotone" dataKey="producido" stroke="#1A237E" strokeWidth={2} name="Producido" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-center px-3 py-3 font-medium w-10">
                <input
                  type="checkbox"
                  checked={teamVendedores.every(v => checkedVendedores.has(v.nombre))}
                  onChange={() => {
                    const allChecked = teamVendedores.every(v => checkedVendedores.has(v.nombre))
                    setCheckedVendedores(prev => {
                      const next = new Set(prev)
                      teamVendedores.forEach(v => {
                        if (allChecked) next.delete(v.nombre)
                        else next.add(v.nombre)
                      })
                      return next
                    })
                  }}
                  className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                />
              </th>
              {([
                { col: 'nombre' as SortCol, label: 'Vendedor', align: 'text-left' },
                { col: 'objetivo' as SortCol, label: 'Objetivo', align: 'text-right' },
                { col: 'producido' as SortCol, label: 'Producido', align: 'text-right' },
                { col: 'porcentaje' as SortCol, label: '%', align: 'text-center' },
                { col: 'qVentas' as SortCol, label: 'Q Ventas', align: 'text-center' },
                { col: 'qChicas' as SortCol, label: 'Q Chicas', align: 'text-center' },
              ]).map(({ col, label, align }) => (
                <th
                  key={col}
                  className={`${align} px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none`}
                  onClick={() => toggleTableSort(col)}
                >
                  {label} {tableSortCol === col ? (tableSortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
              ))}
              <th className="text-center px-4 py-3 font-medium">Activa</th>
              <th
                className="text-center px-3 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => toggleTableSort('alta')}
              >
                Alta {tableSortCol === 'alta' ? (tableSortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th
                className="text-center px-3 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => toggleTableSort('baja')}
              >
                Baja {tableSortCol === 'baja' ? (tableSortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...teamVendedores]
              .filter(v => {
                const md = getMonthData(v.monthlyData)
                return md && (md.objetivo > 0 || md.producido > 0)
              })
              .sort((a, b) => {
                const mdA = getMonthData(a.monthlyData)
                const mdB = getMonthData(b.monthlyData)
                let valA: number | string = 0
                let valB: number | string = 0

                switch (tableSortCol) {
                  case 'nombre': valA = a.nombre; valB = b.nombre; break
                  case 'objetivo': valA = mdA?.objetivo || 0; valB = mdB?.objetivo || 0; break
                  case 'producido': valA = mdA?.producido || 0; valB = mdB?.producido || 0; break
                  case 'porcentaje': valA = mdA?.porcentaje || 0; valB = mdB?.porcentaje || 0; break
                  case 'qVentas': valA = mdA?.qVentas || 0; valB = mdB?.qVentas || 0; break
                  case 'qChicas': valA = mdA?.qChicas || 0; valB = mdB?.qChicas || 0; break
                  case 'alta': valA = vendedorDates[a.nombre]?.fecha_alta || ''; valB = vendedorDates[b.nombre]?.fecha_alta || ''; break
                  case 'baja': valA = vendedorDates[a.nombre]?.fecha_baja || ''; valB = vendedorDates[b.nombre]?.fecha_baja || ''; break
                }

                if (typeof valA === 'string') {
                  const cmp = valA.localeCompare(valB as string)
                  return tableSortDir === 'asc' ? cmp : -cmp
                }
                return tableSortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
              })
              .map(v => {
              const md = getMonthData(v.monthlyData)
              if (!md) return null
              const isChecked = checkedVendedores.has(v.nombre)
              return (
                <tr key={v.nombre} className={`border-b hover:bg-gray-50 ${!isChecked ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleVendedor(v.nombre)}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{formatFullName(v.nombre)}</td>
                  <td className="px-4 py-3 text-right">{formatUSD(md.objetivo)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatUSD(md.producido)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPercentageColor(md.porcentaje)}`}>
                      {md.porcentaje.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{md.qVentas ?? '-'}</td>
                  <td className="px-4 py-3 text-center">{md.qChicas ?? '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {md.cuenta !== undefined ? (
                      <span className={`h-2.5 w-2.5 rounded-full inline-block ${md.cuenta ? 'bg-green-500' : 'bg-gray-300'}`} />
                    ) : '-'}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="date"
                      value={vendedorDates[v.nombre]?.fecha_alta || ''}
                      onChange={(e) => saveDate(v.nombre, 'fecha_alta', e.target.value)}
                      className="border rounded px-1.5 py-1 text-xs w-[115px] bg-white"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="date"
                      value={vendedorDates[v.nombre]?.fecha_baja || ''}
                      onChange={(e) => saveDate(v.nombre, 'fecha_baja', e.target.value)}
                      className="border rounded px-1.5 py-1 text-xs w-[115px] bg-white"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Chat Panel */}
      {chatOpen && (
        <div className="fixed bottom-4 right-4 w-[420px] h-[550px] bg-white border rounded-xl shadow-2xl flex flex-col z-50">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-[#1A237E] text-white rounded-t-xl">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="font-medium text-sm">Analista de Ventas IA</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="hover:bg-white/20 rounded p-1">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500 mb-3">Preguntá sobre el rendimiento del equipo:</p>
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setChatInput(q); }}
                    className="block w-full text-left text-sm px-3 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#1A237E] text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content || (chatLoading && i === chatMessages.length - 1 ? '...' : '')}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                placeholder="Preguntá algo..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A237E]"
                disabled={chatLoading}
              />
              <Button
                size="sm"
                onClick={handleSendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-[#1A237E] hover:bg-[#283593]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
