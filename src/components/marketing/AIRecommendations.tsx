'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import type { AIRecommendation } from '@/lib/meta-ads/types'

interface AIRecommendationsProps {
  datePreset?: string
}

export function AIRecommendations({
  datePreset = 'last_7d',
}: AIRecommendationsProps) {
  const [analysis, setAnalysis] = useState<{
    summary: string
    top_performers: string[]
    underperformers: string[]
    recommendations: AIRecommendation[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null)

  // Fetch latest analysis from database
  const fetchLatestAnalysis = async () => {
    try {
      const res = await fetch('/api/meta/insights/analyze?latest=true')
      const data = await res.json()

      if (data.analysis) {
        setAnalysis(data.analysis)
        setLastAnalyzed(new Date(data.created_at))
      }
    } catch (err) {
      console.error('Error fetching analysis:', err)
    }
  }

  // Generate new analysis
  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/insights/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_preset: datePreset }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error generating analysis')
      }

      setAnalysis(data.analysis)
      setLastAnalyzed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating analysis')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLatestAnalysis()
  }, [])

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'action':
        return <ArrowRight className="h-4 w-4" />
      case 'insight':
        return <Lightbulb className="h-4 w-4" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <CheckCircle className="h-4 w-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Análisis con IA
          </h2>
          <p className="text-sm text-muted-foreground">
            {lastAnalyzed
              ? `Último análisis: ${lastAnalyzed.toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Sin análisis previo'}
          </p>
        </div>
        <Button onClick={handleAnalyze} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analizando...
            </>
          ) : analysis ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Nuevo análisis
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Analizar ahora
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!analysis && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Haz clic en &quot;Analizar ahora&quot; para obtener recomendaciones
              de IA
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Analizaremos el rendimiento de tus anuncios y te daremos
              sugerencias para optimizar
            </p>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{analysis.summary}</p>
            </CardContent>
          </Card>

          {/* Top/Under Performers */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Top Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.top_performers.length > 0 ? (
                  <ul className="space-y-2">
                    {analysis.top_performers.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-sm flex items-start gap-2"
                      >
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay suficientes datos
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Necesitan mejora
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.underperformers.length > 0 ? (
                  <ul className="space-y-2">
                    {analysis.underperformers.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-sm flex items-start gap-2"
                      >
                        <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay suficientes datos
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recomendaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysis.recommendations.length > 0 ? (
                analysis.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${getPriorityColor(rec.priority)}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getRecommendationIcon(rec.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{rec.title}</span>
                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm opacity-90">{rec.description}</p>
                        {rec.action && (
                          <p className="text-sm font-medium mt-2 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" />
                            {rec.action}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay recomendaciones disponibles
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
