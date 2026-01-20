import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { AnalysisType, AIAnalysisResponse, AIRecommendation } from '@/lib/meta-ads/types'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })
  }
  return openaiClient
}

const ANALYSIS_PROMPT = `Eres un analista de performance de Meta Ads especializado en el sector turismo.

Analiza los siguientes datos de rendimiento de campañas de una agencia de viajes:

**Período:** {date_range}
**Presupuesto total gastado:** ${'{total_spend}'} USD

**Métricas por anuncio:**
{metrics_json}

**Métricas objetivo:**
- CPL (Costo por Lead) objetivo: $5 USD
- CTR objetivo: >1.5%
- Tasa de conversión objetivo: >2%

Proporciona un análisis completo en español:

1. **RESUMEN**: Estado general de las campañas (2-3 oraciones).

2. **TOP PERFORMERS**: Los 3 anuncios con mejor rendimiento y por qué funcionan.

3. **BAJO RENDIMIENTO**: Anuncios que necesitan atención inmediata.

4. **RECOMENDACIONES** (máximo 5):
   - type: 'action', 'insight', o 'warning'
   - priority: 'high', 'medium', 'low'
   - title: Título corto
   - description: Descripción detallada
   - affected_ads: IDs de anuncios afectados (si aplica)
   - suggested_action: Acción sugerida específica

5. **TENDENCIAS**: Patrones observados.

Responde SOLO con un JSON válido:
{
  "summary": "...",
  "top_performers": [{"ad_id": "...", "ad_name": "...", "metrics": {...}, "reason": "..."}],
  "underperformers": [{"ad_id": "...", "ad_name": "...", "metrics": {...}, "issue": "..."}],
  "recommendations": [{"type": "...", "priority": "...", "title": "...", "description": "...", "affected_ads": [], "suggested_action": "..."}],
  "trends": ["..."]
}`

/**
 * POST /api/meta/insights/analyze
 * Analyze ad performance with AI
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const {
      analysis_type = 'weekly',
      reference_id,
      date_range,
    } = body as {
      analysis_type?: AnalysisType
      reference_id?: string
      date_range?: { start: string; end: string }
    }

    // Build query for insights
    let query = db
      .from('meta_ad_insights')
      .select(`
        *,
        meta_ads!inner (
          ad_name,
          package_id,
          packages (title, tc_package_id)
        )
      `)

    // Apply date range filter
    if (date_range) {
      query = query
        .gte('date_start', date_range.start)
        .lte('date_stop', date_range.end)
    }

    // Apply reference filter based on analysis type
    if (analysis_type === 'campaign' && reference_id) {
      query = query.eq('meta_ads.meta_adset.meta_campaign_id', reference_id)
    } else if (analysis_type === 'package' && reference_id) {
      query = query.eq('meta_ads.package_id', parseInt(reference_id))
    }

    const { data: insights, error: insightsError } = await query

    if (insightsError) {
      throw insightsError
    }

    if (!insights || insights.length === 0) {
      return NextResponse.json({
        summary: 'No hay datos suficientes para analizar en el período seleccionado.',
        recommendations: [],
        metrics_summary: null,
      })
    }

    // Aggregate metrics
    const totalSpend = insights.reduce((sum, i) => sum + (i.spend || 0), 0)
    const totalImpressions = insights.reduce((sum, i) => sum + (i.impressions || 0), 0)
    const totalClicks = insights.reduce((sum, i) => sum + (i.clicks || 0), 0)
    const totalLeads = insights.reduce((sum, i) => sum + (i.leads || 0), 0)

    // Prepare metrics for AI
    const metricsForAI = insights.map((i) => ({
      ad_id: i.meta_ad_id,
      ad_name: i.meta_ads?.ad_name || 'Unknown',
      package: i.meta_ads?.packages?.title || 'Unknown',
      impressions: i.impressions,
      clicks: i.clicks,
      leads: i.leads,
      messages: i.messages,
      spend: i.spend,
      cpm: i.cpm,
      cpc: i.cpc,
      cpl: i.cpl,
      ctr: i.ctr,
    }))

    // Build prompt
    const prompt = ANALYSIS_PROMPT
      .replace('{date_range}', date_range ? `${date_range.start} a ${date_range.end}` : 'Últimos 7 días')
      .replace('{total_spend}', totalSpend.toFixed(2))
      .replace('{metrics_json}', JSON.stringify(metricsForAI, null, 2))

    console.log('[Insights Analyze] Calling OpenAI for analysis...')

    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: 'Eres un analista experto en Meta Ads para agencias de viajes. Proporciona análisis accionables y específicos.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const responseContent = completion.choices[0]?.message?.content
    if (!responseContent) {
      throw new Error('Empty response from AI')
    }

    // Parse response
    let analysis: AIAnalysisResponse
    try {
      let cleanContent = responseContent.trim()
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7)
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3)
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3)
      }
      analysis = JSON.parse(cleanContent.trim())
    } catch {
      console.error('[Insights Analyze] Failed to parse AI response:', responseContent)
      throw new Error('Failed to parse AI response')
    }

    // Save to database
    await db.from('meta_ai_recommendations').insert({
      analysis_date: new Date().toISOString().split('T')[0],
      analysis_type,
      reference_id,
      summary: analysis.summary,
      recommendations: analysis.recommendations as unknown as AIRecommendation[],
      metrics_analyzed: {
        total_spend: totalSpend,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_leads: totalLeads,
        ads_count: insights.length,
      },
      model_used: 'gpt-4o-mini',
    })

    // Calculate summary metrics
    const metricsSummary = {
      total_spend: totalSpend,
      total_impressions: totalImpressions,
      total_reach: insights.reduce((sum, i) => sum + (i.reach || 0), 0),
      total_clicks: totalClicks,
      total_leads: totalLeads,
      total_messages: insights.reduce((sum, i) => sum + (i.messages || 0), 0),
      avg_cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avg_cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      avg_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    }

    return NextResponse.json({
      ...analysis,
      metrics_summary: metricsSummary,
    })
  } catch (error) {
    console.error('[Insights Analyze] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error analyzing insights' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/meta/insights/analyze
 * Get previous AI recommendations
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10')

  try {
    const { data, error } = await db
      .from('meta_ai_recommendations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    return NextResponse.json({ recommendations: data })
  } catch (error) {
    console.error('[Insights Analyze GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching recommendations' },
      { status: 500 }
    )
  }
}
