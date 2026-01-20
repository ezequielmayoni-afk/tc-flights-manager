'use client'

import { useState } from 'react'
import { InsightsDashboard } from '@/components/marketing/InsightsDashboard'
import { AIRecommendations } from '@/components/marketing/AIRecommendations'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BarChart3, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function MarketingAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('insights')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/packages/marketing">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Analytics de Marketing</h1>
          <p className="text-muted-foreground">
            Analiza el rendimiento de tus anuncios en Meta
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="insights" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Métricas
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Análisis IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-6">
          <InsightsDashboard />
        </TabsContent>

        <TabsContent value="ai" className="mt-6">
          <AIRecommendations />
        </TabsContent>
      </Tabs>
    </div>
  )
}
