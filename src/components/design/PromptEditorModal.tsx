'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

interface PromptEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_PROMPT = `PROMPT MAESTRO: AUTOMATIZACIÓN DE ADS "SÍ, VIAJO" (V3)

ROL: Eres el Director de Arte de "Sí, Viajo". Creas anuncios de alto rendimiento donde TODO EL TEXTO VA SOBRE LA IMAGEN.

1. ENTRADA (JSON):
{{PACKAGE_JSON}}

2. REGLAS VISUALES:
- Colores: Azul #1A237E (fondo), Verde #1DE9B6 (precio/CTA)
- Tipografía: Montserrat Bold Italic
- Fotos: Luminosas, con sol, personas disfrutando
- El precio debe ser el elemento más visible

3. CONTEXTO DEL DESTINO:
La imagen debe representar fielmente el destino del JSON (playas caribeñas, montañas, ciudades europeas, etc.)

4. DATOS OBLIGATORIOS:
- Precio: usar current_price_per_pax redondeado hacia abajo con moneda
- Fecha: formatear como "Mes Año"
- Si es ALL INCLUSIVE o incluye vuelo, destacarlo

5. VARIANTES (5 enfoques):
- variante_1_precio: Urgencia, oferta, "aprovechá ahora"
- variante_2_experiencia: Emocional, aspiracional, escaparse
- variante_3_destino: El lugar es protagonista, paisaje icónico
- variante_4_conveniencia: Todo resuelto, cero estrés
- variante_5_escasez: Últimos lugares, decisión inmediata

6. FORMATOS POR VARIANTE:
Cada variante tiene DOS formatos:
- formato_1080: Imagen 1080x1080 (1:1) para Feed
- formato_1920: Imagen 1920x1080 (16:9) para Stories/Reels

RESPONDE ÚNICAMENTE CON JSON VÁLIDO:
{
  "variante_1_precio": {
    "concepto": "Precio / Oferta",
    "formato_1080": {
      "titulo_principal": "string",
      "subtitulo": "string",
      "precio_texto": "string (ej: USD 1234)",
      "cta": "string",
      "descripcion_imagen": "string EN INGLÉS (50-100 palabras)",
      "estilo": "string"
    },
    "formato_1920": {
      "titulo_principal": "string",
      "subtitulo": "string",
      "precio_texto": "string",
      "cta": "string",
      "descripcion_imagen": "string EN INGLÉS (50-100 palabras)",
      "estilo": "string"
    }
  },
  "variante_2_experiencia": { "concepto": "...", "formato_1080": {...}, "formato_1920": {...} },
  "variante_3_destino": { "concepto": "...", "formato_1080": {...}, "formato_1920": {...} },
  "variante_4_conveniencia": { "concepto": "...", "formato_1080": {...}, "formato_1920": {...} },
  "variante_5_escasez": { "concepto": "...", "formato_1080": {...}, "formato_1920": {...} },
  "metadata": {
    "destino": "string",
    "fecha_salida": "string",
    "precio_base": number,
    "currency": "string",
    "noches": number,
    "regimen": "string o null"
  }
}

IMPORTANTE para descripcion_imagen:
- Escribir EN INGLÉS para Imagen 3
- 50-100 palabras, estilo técnico publicitario
- Incluir: tipo de foto, composición, personas, luz, colores, mood
- Ejemplo: "Professional advertising photograph of a happy couple relaxing in an infinity pool overlooking turquoise Caribbean waters. Palm trees frame the shot. Golden hour lighting, warm tones. Shot with professional DSLR. The mood is aspirational and luxurious."`

export function PromptEditorModal({ open, onOpenChange }: PromptEditorModalProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load current prompt
  useEffect(() => {
    if (open) {
      loadPrompt()
    }
  }, [open])

  const loadPrompt = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/ai/prompt')
      const data = await response.json()
      setPrompt(data.prompt || DEFAULT_PROMPT)
    } catch (error) {
      console.error('Error loading prompt:', error)
      setPrompt(DEFAULT_PROMPT)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/ai/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })

      if (!response.ok) {
        throw new Error('Failed to save prompt')
      }

      toast.success('Prompt guardado exitosamente')
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving prompt:', error)
      toast.error('Error al guardar el prompt')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setPrompt(DEFAULT_PROMPT)
    toast.info('Prompt restaurado al valor por defecto')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Prompt de IA</DialogTitle>
          <DialogDescription>
            Este prompt se usa para generar los creativos con Gemini. Usa {'{{PACKAGE_JSON}}'} como placeholder para los datos del paquete.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
              placeholder="Ingresa el prompt para la generación de creativos..."
            />
            <p className="text-xs text-muted-foreground">
              {prompt.length} caracteres
            </p>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={handleReset} disabled={loading || saving}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
