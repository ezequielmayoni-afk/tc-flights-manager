'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

/** Horas hasta el vencimiento de una solicitud de creativos */
const SLA_HOURS = 48

interface RequestedRequest {
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

interface CreativesRequestedPanelProps {
  requests: RequestedRequest[]
}

const REASON_LABELS: Record<string, string> = {
  new_package: 'Paquete nuevo',
  price_change: 'Cambio de precio',
  low_performance: 'Bajo rendimiento',
  new_variant: 'Nueva variante',
  update_content: 'Actualizar contenido',
  other: 'Otro',
}

export function CreativesRequestedPanel({ requests }: CreativesRequestedPanelProps) {
  const [expanded, setExpanded] = useState(true)

  if (requests.length === 0) return null

  const now = Date.now()
  const getExpiresAt = (createdAt: string) =>
    new Date(createdAt).getTime() + SLA_HOURS * 60 * 60 * 1000

  const expiredCount = requests.filter(r => now > getExpiresAt(r.created_at)).length
  const hasExpired = expiredCount > 0

  return (
    <div className={`bg-white rounded-lg border overflow-hidden ${hasExpired ? 'border-red-300' : 'border-blue-200'}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-4 transition-colors ${
          hasExpired ? 'bg-red-50 hover:bg-red-100' : 'bg-blue-50 hover:bg-blue-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <Send className={`h-5 w-5 ${hasExpired ? 'text-red-600' : 'text-blue-600'}`} />
          <span className={`font-semibold ${hasExpired ? 'text-red-900' : 'text-blue-900'}`}>
            Creativos Solicitados
          </span>
          <Badge variant="secondary" className={hasExpired ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'}>
            {requests.length} solicitud{requests.length !== 1 ? 'es' : ''}
          </Badge>
          {expiredCount > 0 && (
            <Badge variant="destructive">
              {expiredCount} vencida{expiredCount !== 1 ? 's' : ''} (+{SLA_HOURS}h)
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className={`h-5 w-5 ${hasExpired ? 'text-red-600' : 'text-blue-600'}`} />
        ) : (
          <ChevronDown className={`h-5 w-5 ${hasExpired ? 'text-red-600' : 'text-blue-600'}`} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="divide-y">
          {requests.map((request) => {
            const createdDate = new Date(request.created_at)
            const expiresAt = getExpiresAt(request.created_at)
            const expiresDate = new Date(expiresAt)
            const isExpired = now > expiresAt

            return (
              <div
                key={request.id}
                className={`p-4 ${isExpired ? 'bg-red-50 border-l-4 border-red-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                        onClick={() => {
                          const row = document.getElementById(`pkg-row-${request.package_id}`)
                          if (row) {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            row.click()
                          }
                        }}
                        title="Ir al paquete en la tabla"
                      >
                        {request.tc_package_id}
                      </Badge>
                      <a
                        href={`https://drive.google.com/drive/search?q=${request.tc_package_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-medium truncate hover:underline ${isExpired ? 'text-red-700' : 'text-blue-600'}`}
                        title="Abrir carpeta en Drive"
                      >
                        {request.packages?.title || 'Paquete'}
                      </a>
                      {request.status === 'in_progress' ? (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                          En progreso
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                          Pendiente
                        </Badge>
                      )}
                      {isExpired && (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          VENCIDO
                        </Badge>
                      )}
                    </div>

                    {/* Resumen de lo solicitado */}
                    <div className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {REASON_LABELS[request.reason] || request.reason}
                      </span>
                      {request.reason_detail && <span> — {request.reason_detail}</span>}
                    </div>

                    {/* Variantes solicitadas */}
                    {request.requested_variants && request.requested_variants.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Variantes:</span>
                        {[...request.requested_variants].sort((a, b) => a - b).map(v => (
                          <Badge key={v} variant="outline" className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0">
                            V{v}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Fechas: solicitud + vencimiento (+48h) */}
                    <div className="mt-2 flex items-center gap-4 text-xs flex-wrap">
                      <span className="text-muted-foreground">
                        Solicitado el <span className="font-medium text-foreground">{format(createdDate, "d MMM yyyy HH:mm", { locale: es })}</span>
                        {' '}({formatDistanceToNow(createdDate, { locale: es, addSuffix: true })})
                      </span>
                      <span className={`flex items-center gap-1 font-medium ${isExpired ? 'text-red-700' : 'text-amber-700'}`}>
                        <Clock className="h-3 w-3" />
                        {isExpired
                          ? `Venció el ${format(expiresDate, "d MMM HH:mm", { locale: es })} (hace ${formatDistanceToNow(expiresDate, { locale: es })})`
                          : `Vence el ${format(expiresDate, "d MMM HH:mm", { locale: es })} (en ${formatDistanceToNow(expiresDate, { locale: es })})`}
                      </span>
                      <span className="text-muted-foreground">
                        por {request.requested_by}
                      </span>
                    </div>
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
