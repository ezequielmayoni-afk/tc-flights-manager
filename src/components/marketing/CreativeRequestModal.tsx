'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader2, AlertTriangle, ImageIcon } from 'lucide-react'

interface Package {
  id: number
  tc_package_id: number
  title: string
  current_price_per_pax: number
  currency: string
  creative_update_needed?: boolean
  creative_update_reason?: string | null
  price_at_creative_creation?: number | null
}

interface DriveCreative {
  variant: number
  aspectRatio: '4x5' | '9x16'
  fileId: string
}

interface CreativeRequestModalProps {
  open: boolean
  onClose: () => void
  pkg: Package
  onSuccess?: () => void
}

const REASON_OPTIONS = [
  { value: 'price_change', label: 'Cambio de precio' },
  { value: 'low_performance', label: 'Bajo rendimiento del anuncio' },
  { value: 'new_variant', label: 'Nueva variante necesaria' },
  { value: 'update_content', label: 'Actualización de contenido' },
  { value: 'other', label: 'Otro' },
]

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgente', description: 'Necesita atención inmediata' },
  { value: 'normal', label: 'Normal', description: 'Prioridad estándar' },
  { value: 'low', label: 'Baja', description: 'Puede esperar' },
]

const VARIANT_LABELS: Record<number, string> = {
  1: 'Precio/Oferta',
  2: 'Experiencia',
  3: 'Destino',
  4: 'Conveniencia',
  5: 'Escasez',
}

export function CreativeRequestModal({
  open,
  onClose,
  pkg,
  onSuccess,
}: CreativeRequestModalProps) {
  const [reason, setReason] = useState<string>(pkg.creative_update_reason || 'price_change')
  const [priority, setPriority] = useState<string>('normal')
  const [reasonDetail, setReasonDetail] = useState('')
  const [requestedBy, setRequestedBy] = useState('Marketing')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedVariants, setSelectedVariants] = useState<number[]>([])
  const [driveCreatives, setDriveCreatives] = useState<DriveCreative[]>([])
  const [isLoadingCreatives, setIsLoadingCreatives] = useState(false)

  // Load existing creatives when modal opens
  useEffect(() => {
    if (open && pkg.id) {
      loadDriveCreatives()
    }
  }, [open, pkg.id])

  const loadDriveCreatives = async () => {
    setIsLoadingCreatives(true)
    try {
      const res = await fetch(`/api/creatives/${pkg.id}`)
      if (res.ok) {
        const data = await res.json()
        setDriveCreatives(data.creatives || [])
      }
    } catch (error) {
      console.error('Error loading creatives:', error)
    } finally {
      setIsLoadingCreatives(false)
    }
  }

  const toggleVariant = (variant: number) => {
    setSelectedVariants(prev =>
      prev.includes(variant)
        ? prev.filter(v => v !== variant)
        : [...prev, variant]
    )
  }

  const selectAllVariants = () => {
    if (selectedVariants.length === 5) {
      setSelectedVariants([])
    } else {
      setSelectedVariants([1, 2, 3, 4, 5])
    }
  }

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Selecciona un motivo')
      return
    }

    if (selectedVariants.length === 0) {
      toast.error('Selecciona al menos una variante')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/creative-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: pkg.id,
          tc_package_id: pkg.tc_package_id,
          reason,
          reason_detail: reasonDetail || null,
          priority,
          requested_by: requestedBy,
          requested_variants: selectedVariants.sort((a, b) => a - b),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error creando solicitud')
      }

      toast.success('Solicitud de creativo enviada a Diseño')
      onSuccess?.()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error creando solicitud')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(price)
  }

  // Get creative for a specific variant and aspect ratio
  const getCreative = (variant: number, aspectRatio: '4x5' | '9x16') => {
    return driveCreatives.find(c => c.variant === variant && c.aspectRatio === aspectRatio)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar Nuevo Creativo</DialogTitle>
          <DialogDescription>
            Selecciona las variantes que necesitan nuevos creativos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Package Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm bg-background px-2 py-0.5 rounded">
                {pkg.tc_package_id}
              </span>
              <span className="font-medium text-sm truncate">{pkg.title}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Precio actual: {formatPrice(pkg.current_price_per_pax, pkg.currency)}
              {pkg.price_at_creative_creation && pkg.price_at_creative_creation !== pkg.current_price_per_pax && (
                <span className="text-amber-600 ml-2">
                  (antes: {formatPrice(pkg.price_at_creative_creation, pkg.currency)})
                </span>
              )}
            </div>
          </div>

          {/* Price change warning */}
          {pkg.creative_update_needed && pkg.creative_update_reason === 'price_change' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-900">El precio ha cambiado</p>
                <p className="text-amber-700">
                  Los creativos actuales tienen un precio desactualizado.
                </p>
              </div>
            </div>
          )}

          {/* Variant Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Variantes a solicitar</Label>
              <button
                type="button"
                onClick={selectAllVariants}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {selectedVariants.length === 5 ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            </div>

            {isLoadingCreatives ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(variant => {
                  const isSelected = selectedVariants.includes(variant)
                  const creative4x5 = getCreative(variant, '4x5')
                  const creative9x16 = getCreative(variant, '9x16')
                  const hasCreatives = creative4x5 || creative9x16

                  return (
                    <div
                      key={variant}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 bg-gray-50/50 opacity-60'
                      }`}
                      onClick={() => toggleVariant(variant)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleVariant(variant)}
                        onClick={(e) => e.stopPropagation()}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">V{variant}</span>
                          <span className="text-xs text-muted-foreground">
                            {VARIANT_LABELS[variant]}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded">
                              SOLICITAR
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Thumbnails */}
                      <div className="flex gap-2">
                        {/* 4x5 thumbnail */}
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] text-muted-foreground mb-0.5">4x5</span>
                          {creative4x5 ? (
                            <div className={`relative w-10 h-12 rounded overflow-hidden border ${
                              isSelected ? 'border-blue-300' : 'border-gray-300'
                            }`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`https://lh3.googleusercontent.com/d/${creative4x5.fileId}=w100`}
                                alt={`V${variant} 4x5`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <div className={`w-10 h-12 rounded border-2 border-dashed flex items-center justify-center ${
                              isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-100'
                            }`}>
                              <ImageIcon className="h-3 w-3 text-gray-400" />
                            </div>
                          )}
                        </div>

                        {/* 9x16 thumbnail */}
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] text-muted-foreground mb-0.5">9x16</span>
                          {creative9x16 ? (
                            <div className={`relative w-7 h-12 rounded overflow-hidden border ${
                              isSelected ? 'border-blue-300' : 'border-gray-300'
                            }`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`https://lh3.googleusercontent.com/d/${creative9x16.fileId}=w100`}
                                alt={`V${variant} 9x16`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <div className={`w-7 h-12 rounded border-2 border-dashed flex items-center justify-center ${
                              isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-100'
                            }`}>
                              <ImageIcon className="h-3 w-3 text-gray-400" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {selectedVariants.length > 0 && (
              <p className="text-xs text-blue-600">
                {selectedVariants.length} variante{selectedVariants.length > 1 ? 's' : ''} seleccionada{selectedVariants.length > 1 ? 's' : ''}: V{selectedVariants.sort((a, b) => a - b).join(', V')}
              </p>
            )}
          </div>

          {/* Reason Select */}
          <div className="space-y-2">
            <Label>Motivo</Label>
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

          {/* Priority Select */}
          <div className="space-y-2">
            <Label>Prioridad</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona prioridad" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Detail */}
          <div className="space-y-2">
            <Label>Detalle (opcional)</Label>
            <Textarea
              placeholder="Describe qué tipo de creativo necesitas, cambios específicos, etc."
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              rows={3}
            />
          </div>

          {/* Requested By */}
          <div className="space-y-2">
            <Label>Solicitado por</Label>
            <Input
              placeholder="Tu nombre o equipo"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedVariants.length === 0}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar Solicitud ({selectedVariants.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
