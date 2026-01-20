'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw, Info } from 'lucide-react'

interface PromptConfigModalProps {
  open: boolean
  onClose: () => void
}

const DEFAULT_PROMPT = `Genera 5 variantes de copy para Meta Ads (Facebook/Instagram).

**Paquete:** {title}
**Destinos:** {destinations}
**Noches:** {nights}
**Precio:** {price} {currency}/persona
**Salida:** {departure_date}
**Incluye:** {includes}

Cada variante debe tener:
- headline: Max 40 caracteres (gancho emocional, sin emojis)
- primary_text: Max 125 palabras (urgencia y deseo, puede tener emojis)
- description: Max 125 caracteres (CTA secundario)
- wa_message_template: Mensaje pre-armado para WhatsApp

Enfoques por variante:
- V1: PRECIO/OFERTA - Enfocado en el ahorro y la urgencia
- V2: EXPERIENCIA - Emocional y aspiracional
- V3: DESTINO - Características únicas del lugar
- V4: CONVENIENCIA - Todo incluido, sin preocupaciones
- V5: ESCASEZ - Últimos lugares disponibles

IMPORTANTE: El wa_message_template DEBE incluir "SIV {tc_package_id}" para tracking.

Responde SOLO en formato JSON:
{
  "variants": [
    {
      "variant": 1,
      "headline": "...",
      "primary_text": "...",
      "description": "...",
      "wa_message_template": "Hola! Me interesa la promo\\n.\\nPreguntas y respuestas\\n1. Quiero más info de la promo SIV {tc_package_id} (no borrar)"
    }
  ]
}`

const PLACEHOLDER_GROUPS = [
  {
    label: 'Info Basica',
    items: [
      { key: '{title}', desc: 'Titulo del paquete' },
      { key: '{large_title}', desc: 'Titulo largo' },
      { key: '{destinations}', desc: 'Destinos' },
      { key: '{price}', desc: 'Precio por persona' },
      { key: '{currency}', desc: 'Moneda' },
      { key: '{nights}', desc: 'Noches' },
      { key: '{adults}', desc: 'Adultos' },
      { key: '{children}', desc: 'Ninos' },
      { key: '{departure_date}', desc: 'Fecha salida' },
      { key: '{date_range}', desc: 'Rango fechas' },
      { key: '{themes}', desc: 'Temas' },
      { key: '{tc_package_id}', desc: 'ID paquete (tracking)' },
    ],
  },
  {
    label: 'Origen',
    items: [
      { key: '{origin_city}', desc: 'Ciudad origen' },
      { key: '{origin_country}', desc: 'Pais origen' },
    ],
  },
  {
    label: 'Hotel',
    items: [
      { key: '{hotel_name}', desc: 'Nombre hotel' },
      { key: '{hotel_category}', desc: 'Categoria' },
      { key: '{hotel_stars}', desc: 'Estrellas' },
      { key: '{room_type}', desc: 'Tipo habitacion' },
      { key: '{board_type}', desc: 'Regimen' },
      { key: '{hotel_nights}', desc: 'Noches hotel' },
      { key: '{hotel_address}', desc: 'Direccion' },
    ],
  },
  {
    label: 'Vuelo',
    items: [
      { key: '{airline}', desc: 'Aerolinea' },
      { key: '{airline_code}', desc: 'Codigo aerolinea' },
      { key: '{flight_departure}', desc: 'Salida vuelo' },
      { key: '{flight_arrival}', desc: 'Llegada vuelo' },
      { key: '{cabin_class}', desc: 'Clase cabina' },
      { key: '{baggage_info}', desc: 'Info equipaje' },
    ],
  },
  {
    label: 'Conteos',
    items: [
      { key: '{hotels_count}', desc: 'Cant. hoteles' },
      { key: '{transfers_count}', desc: 'Cant. transfers' },
      { key: '{flights_count}', desc: 'Cant. vuelos' },
    ],
  },
  {
    label: 'Inclusiones',
    items: [
      { key: '{includes_flights}', desc: 'Incluye vuelos' },
      { key: '{includes_hotel}', desc: 'Incluye hotel' },
      { key: '{includes_transfers}', desc: 'Incluye transfers' },
      { key: '{includes_all_inclusive}', desc: 'Todo incluido' },
    ],
  },
]

export function PromptConfigModal({ open, onClose }: PromptConfigModalProps) {
  const [prompt, setPrompt] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showPlaceholders, setShowPlaceholders] = useState(false)

  useEffect(() => {
    if (open) {
      loadConfig()
    }
  }, [open])

  const loadConfig = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/meta/copy/config')
      const data = await res.json()

      if (data.config?.prompt_template) {
        setPrompt(data.config.prompt_template)
        setOriginalPrompt(data.config.prompt_template)
      } else {
        // No config exists, use default
        setPrompt(DEFAULT_PROMPT)
        setOriginalPrompt('')
      }
    } catch (error) {
      console.error('Error loading config:', error)
      setPrompt(DEFAULT_PROMPT)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!prompt.trim()) {
      toast.error('El prompt no puede estar vacío')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/meta/copy/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_template: prompt }),
      })

      if (!res.ok) {
        throw new Error('Error al guardar')
      }

      toast.success('Prompt guardado correctamente')
      setOriginalPrompt(prompt)
      onClose()
    } catch (error) {
      toast.error('Error al guardar el prompt')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setPrompt(DEFAULT_PROMPT)
  }

  const hasChanges = prompt !== originalPrompt

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configurar Prompt de IA</DialogTitle>
          <DialogDescription>
            Este prompt se usa para generar las 5 variantes de copy con IA
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Placeholders info */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPlaceholders(!showPlaceholders)}
              >
                <Info className="h-4 w-4 mr-2" />
                {showPlaceholders ? 'Ocultar' : 'Ver'} placeholders disponibles
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar default
              </Button>
            </div>

            {showPlaceholders && (
              <div className="p-3 bg-muted rounded-lg max-h-[200px] overflow-y-auto">
                <p className="text-sm font-medium mb-3">Variables disponibles (click para copiar):</p>
                <div className="space-y-3">
                  {PLACEHOLDER_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{group.label}:</p>
                      <div className="flex flex-wrap gap-1">
                        {group.items.map(p => (
                          <Badge
                            key={p.key}
                            variant="secondary"
                            className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={() => {
                              navigator.clipboard.writeText(p.key)
                              toast.success(`${p.key} copiado`)
                            }}
                            title={p.desc}
                          >
                            {p.key}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Textarea */}
            <div className="flex-1 min-h-0">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Escribe el prompt para la IA..."
                className="h-full min-h-[400px] font-mono text-sm resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                {hasChanges && (
                  <span className="text-yellow-600">Hay cambios sin guardar</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
