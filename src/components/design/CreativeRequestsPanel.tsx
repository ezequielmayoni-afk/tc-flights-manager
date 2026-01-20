'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Palette,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { DesignRowExpanded } from '@/components/packages/DesignRowExpanded'

interface CreativeRequest {
  id: number
  package_id: number
  tc_package_id: number
  reason: string
  reason_detail: string | null
  priority: 'urgent' | 'normal' | 'low'
  status: 'pending' | 'in_progress'
  requested_by: string
  created_at: string
  requested_variants: number[] | null
  packages: {
    title: string
    current_price_per_pax: number | null
    currency: string
  } | null
}

interface CreativeRequestsPanelProps {
  requests: CreativeRequest[]
}

const REASON_LABELS: Record<string, string> = {
  new_package: 'Paquete nuevo',
  price_change: 'Cambio de precio',
  low_performance: 'Bajo rendimiento',
  new_variant: 'Nueva variante',
  update_content: 'Actualizar contenido',
  other: 'Otro',
}

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle },
  normal: { label: 'Normal', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  low: { label: 'Baja', color: 'bg-green-100 text-green-800 border-green-200', icon: Clock },
}

export function CreativeRequestsPanel({ requests: initialRequests }: CreativeRequestsPanelProps) {
  const [requests, setRequests] = useState(initialRequests)
  const [expanded, setExpanded] = useState(true)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(null)
  const [creativeCounts, setCreativeCounts] = useState<Record<number, number>>({})

  const handleStartWork = async (requestId: number) => {
    setProcessingId(requestId)
    try {
      const res = await fetch('/api/creative-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requestId,
          status: 'in_progress',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'in_progress' as const } : r))
      )
      toast.success('Comenzaste a trabajar en esta solicitud')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    } finally {
      setProcessingId(null)
    }
  }

  const handleComplete = async (requestId: number) => {
    setProcessingId(requestId)
    try {
      const res = await fetch('/api/creative-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requestId,
          status: 'completed',
          assigned_to: 'Diseño',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }

      // Remove from list
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
      toast.success('Solicitud completada. Se notificó a Marketing.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    } finally {
      setProcessingId(null)
    }
  }

  const handleToggleExpand = (request: CreativeRequest) => {
    // First mark as in_progress if pending
    if (request.status === 'pending') {
      handleStartWork(request.id)
    }

    // Toggle expand
    setExpandedRequestId(prev => prev === request.id ? null : request.id)
  }

  const handleCreativesChange = (requestId: number, count: number) => {
    setCreativeCounts(prev => ({ ...prev, [requestId]: count }))
  }

  if (requests.length === 0) return null

  const urgentCount = requests.filter((r) => r.priority === 'urgent').length

  return (
    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <span className="font-semibold text-amber-900">
            Solicitudes de Creativos
          </span>
          <Badge variant="secondary" className="bg-amber-200 text-amber-800">
            {requests.length} pendiente{requests.length !== 1 ? 's' : ''}
          </Badge>
          {urgentCount > 0 && (
            <Badge variant="destructive">
              {urgentCount} urgente{urgentCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-amber-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-amber-600" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="divide-y">
          {requests.map((request) => {
            const PriorityIcon = PRIORITY_CONFIG[request.priority].icon
            const isProcessing = processingId === request.id
            const isExpanded = expandedRequestId === request.id

            return (
              <div
                key={request.id}
                className={`p-4 ${request.status === 'in_progress' ? 'bg-blue-50' : ''} ${isExpanded ? 'bg-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono">
                        {request.tc_package_id}
                      </Badge>
                      <span className="font-medium truncate">
                        {request.packages?.title || 'Paquete'}
                      </span>
                      <Badge
                        variant="outline"
                        className={PRIORITY_CONFIG[request.priority].color}
                      >
                        <PriorityIcon className="h-3 w-3 mr-1" />
                        {PRIORITY_CONFIG[request.priority].label}
                      </Badge>
                      {request.status === 'in_progress' && (
                        <Badge className="bg-blue-100 text-blue-800">
                          En progreso
                        </Badge>
                      )}
                    </div>

                    <div className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {REASON_LABELS[request.reason] || request.reason}
                      </span>
                      {request.reason_detail && (
                        <span> - {request.reason_detail}</span>
                      )}
                    </div>

                    {/* Variantes solicitadas */}
                    {request.requested_variants && request.requested_variants.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Variantes:</span>
                        {request.requested_variants.sort((a, b) => a - b).map(v => (
                          <Badge key={v} variant="outline" className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0">
                            V{v}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Solicitado por {request.requested_by}
                      </span>
                      <span>
                        hace {formatDistanceToNow(new Date(request.created_at), { locale: es })}
                      </span>
                      {request.packages?.current_price_per_pax && (
                        <span>
                          Precio: {request.packages.currency}{' '}
                          {request.packages.current_price_per_pax.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Mostrar conteo de creativos si está disponible */}
                    {creativeCounts[request.id] !== undefined && (() => {
                      const variantCount = request.requested_variants?.length || 5
                      const total = variantCount * 2 // 2 aspect ratios per variant
                      return (
                        <Badge variant="outline" className={creativeCounts[request.id] >= total ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}>
                          {creativeCounts[request.id]}/{total}
                        </Badge>
                      )
                    })()}

                    {/* Botón principal: Subir Creativos - expande la sección */}
                    <Button
                      size="sm"
                      variant={isExpanded ? 'default' : 'outline'}
                      onClick={() => handleToggleExpand(request)}
                      disabled={isProcessing}
                      className="gap-1"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <Palette className="h-4 w-4" />
                          )}
                          {isExpanded ? 'Cerrar' : 'Subir Creativos'}
                        </>
                      )}
                    </Button>

                    {/* Si ya está en progreso, mostrar botón de completar */}
                    {request.status === 'in_progress' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleComplete(request.id)}
                        disabled={isProcessing}
                        className="gap-1"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Completar
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Sección expandible con los creativos */}
                {isExpanded && (
                  <div className="mt-4 border-t pt-4">
                    <DesignRowExpanded
                      packageId={request.package_id}
                      tcPackageId={request.tc_package_id}
                      requestedVariants={request.requested_variants || undefined}
                      onCreativesChange={(count) => handleCreativesChange(request.id, count)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
