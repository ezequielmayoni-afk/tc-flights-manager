'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

interface CreativeRequestModalProps {
  packageId: number
  tcPackageId: number
  packageTitle: string
  currentPrice: number | null
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const REASON_OPTIONS = [
  { value: 'price_change', label: 'Cambio de precio' },
  { value: 'update_content', label: 'Actualizar contenido' },
  { value: 'low_performance', label: 'Bajo rendimiento del anuncio' },
  { value: 'new_variant', label: 'Nueva variante necesaria' },
  { value: 'other', label: 'Otro' },
]

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgente', description: 'Atender hoy' },
  { value: 'normal', label: 'Normal', description: 'Esta semana' },
  { value: 'low', label: 'Baja', description: 'Cuando se pueda' },
]

export function CreativeRequestModal({
  packageId,
  tcPackageId,
  packageTitle,
  currentPrice,
  currency,
  open,
  onOpenChange,
  onSuccess,
}: CreativeRequestModalProps) {
  const [reason, setReason] = useState('price_change')
  const [priority, setPriority] = useState('normal')
  const [reasonDetail, setReasonDetail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Selecciona un motivo')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/creative-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: packageId,
          reason,
          reason_detail: reasonDetail || null,
          priority,
          requested_by: 'Cotizaciones',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear solicitud')
      }

      toast.success('Solicitud enviada a Diseño')
      onOpenChange(false)
      onSuccess?.()

      // Reset form
      setReason('price_change')
      setPriority('normal')
      setReasonDetail('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al enviar solicitud')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Solicitar Nuevos Creativos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Package Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="text-sm font-medium">{packageTitle}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">#{tcPackageId}</span>
              {currentPrice && (
                <>
                  <span>-</span>
                  <span>
                    {currency} {currentPrice.toLocaleString('es-AR')}/pax
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Prioridad</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona prioridad" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">
                        ({opt.description})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Detail */}
          <div className="space-y-2">
            <Label htmlFor="detail">Detalle (opcional)</Label>
            <Textarea
              id="detail"
              placeholder="Agrega detalles adicionales para el equipo de diseño..."
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar a Diseño
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
