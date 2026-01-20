'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Eye,
  MousePointer,
  Users,
  MessageSquare,
  DollarSign,
  Target,
} from 'lucide-react'
import type { MetaAdInsight } from '@/lib/meta-ads/types'

interface InsightsDashboardProps {
  onRefresh?: () => void
}

type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d'

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  last_7d: 'Últimos 7 días',
  last_14d: 'Últimos 14 días',
  last_30d: 'Últimos 30 días',
}

interface AggregatedMetrics {
  impressions: number
  reach: number
  clicks: number
  leads: number
  messages: number
  spend: number
  avgCpm: number
  avgCpc: number
  avgCpl: number
  avgCtr: number
}

export function InsightsDashboard({ onRefresh }: InsightsDashboardProps) {
  const [insights, setInsights] = useState<MetaAdInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [datePreset, setDatePreset] = useState<DatePreset>('last_7d')
  const [aggregated, setAggregated] = useState<AggregatedMetrics | null>(null)

  // Fetch insights from database
  const fetchInsights = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/meta/insights?date_preset=${datePreset}`)
      const data = await res.json()

      if (data.insights) {
        setInsights(data.insights)
        calculateAggregates(data.insights)
      }
    } catch (error) {
      console.error('Error fetching insights:', error)
    } finally {
      setLoading(false)
    }
  }

  // Sync insights from Meta
  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/meta/insights/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_preset: datePreset }),
      })

      if (res.ok) {
        await fetchInsights()
        onRefresh?.()
      }
    } catch (error) {
      console.error('Error syncing insights:', error)
    } finally {
      setSyncing(false)
    }
  }

  // Calculate aggregate metrics
  const calculateAggregates = (data: MetaAdInsight[]) => {
    if (data.length === 0) {
      setAggregated(null)
      return
    }

    const totals = data.reduce(
      (acc, insight) => ({
        impressions: acc.impressions + (insight.impressions || 0),
        reach: acc.reach + (insight.reach || 0),
        clicks: acc.clicks + (insight.clicks || 0),
        leads: acc.leads + (insight.leads || 0),
        messages: acc.messages + (insight.messages || 0),
        spend: acc.spend + (insight.spend || 0),
      }),
      { impressions: 0, reach: 0, clicks: 0, leads: 0, messages: 0, spend: 0 }
    )

    setAggregated({
      ...totals,
      avgCpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      avgCpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      avgCpl: totals.leads > 0 ? totals.spend / totals.leads : 0,
      avgCtr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    })
  }

  useEffect(() => {
    fetchInsights()
  }, [datePreset])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-AR').format(value)
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Performance de Anuncios</h2>
          <p className="text-sm text-muted-foreground">
            Métricas de rendimiento de Meta Ads
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={datePreset}
            onValueChange={(v) => setDatePreset(v as DatePreset)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATE_PRESET_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Sincronizar</span>
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      {aggregated && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Impresiones</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {formatNumber(aggregated.impressions)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Alcance</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {formatNumber(aggregated.reach)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <MousePointer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Clicks</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {formatNumber(aggregated.clicks)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CTR: {formatPercent(aggregated.avgCtr)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Leads</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {formatNumber(aggregated.leads)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CPL: {formatCurrency(aggregated.avgCpl)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Mensajes</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {formatNumber(aggregated.messages)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Gasto Total</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(aggregated.spend)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CPM: {formatCurrency(aggregated.avgCpm)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Insights Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle por Anuncio</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : insights.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay datos de insights para el período seleccionado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad ID</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Mensajes</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insights.slice(0, 20).map((insight, idx) => (
                  <TableRow key={`${insight.meta_ad_id}-${idx}`}>
                    <TableCell className="font-mono text-xs">
                      {insight.meta_ad_id}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(insight.impressions || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(insight.clicks || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          (insight.ctr || 0) >= 1.5 ? 'default' : 'secondary'
                        }
                      >
                        {formatPercent(insight.ctr || 0)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(insight.leads || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(insight.messages || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(insight.spend || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {insight.cpl ? (
                        <Badge
                          variant={insight.cpl <= 5 ? 'default' : 'destructive'}
                        >
                          {formatCurrency(insight.cpl)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
