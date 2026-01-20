'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Palette,
  Check,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

interface CompletedRequest {
  id: number
  package_id: number
  tc_package_id: number
  reason: string
  reason_detail: string | null
  priority: 'urgent' | 'normal' | 'low'
  completed_at: string | null
  packages: {
    title: string
    current_price_per_pax: number | null
    currency: string
    price_at_creative_creation: number | null
  } | null
}

interface CreativesReadyPanelProps {
  requests: CompletedRequest[]
}

const REASON_LABELS: Record<string, string> = {
  new_package: 'Paquete nuevo',
  price_change: 'Cambio de precio',
  low_performance: 'Bajo rendimiento',
  new_variant: 'Nueva variante',
  update_content: 'Actualizar contenido',
  other: 'Otro',
}

export function CreativesReadyPanel({ requests: initialRequests }: CreativesReadyPanelProps) {
  const router = useRouter()
  const [requests, setRequests] = useState(initialRequests)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [processingId, setProcessingId] = useState<number | null>(null)

  const handleMarkComplete = async (requestId: number) => {
    setProcessingId(requestId)
    try {
      const res = await fetch(`/api/creative-requests?id=${requestId}&action=complete`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al marcar como completado')
      }

      setRequests(prev => prev.filter(r => r.id !== requestId))
      toast.success('Solicitud marcada como completada')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDiscard = async (requestId: number) => {
    setProcessingId(requestId)
    try {
      const res = await fetch(`/api/creative-requests?id=${requestId}&action=discard`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al descartar')
      }

      setRequests(prev => prev.filter(r => r.id !== requestId))
      toast.success('Solicitud descartada')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    } finally {
      setProcessingId(null)
    }
  }

  if (requests.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
      {/* Panel Header */}
      <button
        onClick={() => setPanelExpanded(!panelExpanded)}
        className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="font-semibold text-green-900">
            Creativos Listos
          </span>
          <Badge variant="secondary" className="bg-green-200 text-green-800">
            {requests.length} listo{requests.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        {panelExpanded ? (
          <ChevronUp className="h-5 w-5 text-green-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-green-600" />
        )}
      </button>

      {/* Panel Content */}
      {panelExpanded && (
        <div className="divide-y">
          {requests.map((request) => {
            const isProcessing = processingId === request.id
            const priceChanged = request.packages?.price_at_creative_creation &&
              request.packages?.current_price_per_pax &&
              request.packages.price_at_creative_creation !== request.packages.current_price_per_pax

            return (
              <div key={request.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono">
                        {request.tc_package_id}
                      </Badge>
                      <span className="font-medium truncate">
                        {request.packages?.title || 'Paquete'}
                      </span>
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        <Palette className="h-3 w-3 mr-1" />
                        Creativos listos
                      </Badge>
                    </div>

                    <div className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Motivo: {REASON_LABELS[request.reason] || request.reason}
                      </span>
                      {request.reason_detail && (
                        <span> - {request.reason_detail}</span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      {request.completed_at && (
                        <span>
                          Completado hace {formatDistanceToNow(new Date(request.completed_at), { locale: es })}
                        </span>
                      )}
                      {request.packages?.current_price_per_pax && (
                        <span className="font-medium">
                          Precio: {request.packages.currency}{' '}
                          {request.packages.current_price_per_pax.toLocaleString('es-AR')}
                        </span>
                      )}
                      {priceChanged && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          Precio actualizado
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleMarkComplete(request.id)}
                      disabled={isProcessing}
                      className="gap-1 bg-green-600 hover:bg-green-700"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Completado
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDiscard(request.id)}
                      disabled={isProcessing}
                      className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <X className="h-4 w-4" />
                          Descartar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
