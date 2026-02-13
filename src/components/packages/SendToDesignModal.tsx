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

interface SendToDesignModalProps {
  selectedCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (data: { reason: string; priority: string; reasonDetail: string }) => void
  isLoading: boolean
}

const REASON_OPTIONS = [
  { value: 'new_package', label: 'Paquete nuevo' },
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

export function SendToDesignModal({
  selectedCount,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: SendToDesignModalProps) {
  const [reason, setReason] = useState('new_package')
  const [priority, setPriority] = useState('normal')
  const [reasonDetail, setReasonDetail] = useState('')

  const handleSubmit = () => {
    onConfirm({ reason, priority, reasonDetail })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enviar a Diseño</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selection Info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium">
              {selectedCount} paquete{selectedCount > 1 ? 's' : ''} seleccionado{selectedCount > 1 ? 's' : ''}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Se crearán solicitudes de creativos para cada paquete
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
          <Button onClick={handleSubmit} disabled={isLoading} className="gap-2">
            {isLoading ? (
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
