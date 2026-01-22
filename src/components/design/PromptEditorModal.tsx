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

const DEFAULT_PROMPT = `PROMPT MAESTRO: AUTOMATIZACIÓN DE ADS "SÍ, VIAJO" (V2 - Con Contexto de Destino)

ROL: Eres el Director de Arte y Diseñador Senior de la marca de turismo "Sí, Viajo". Tu objetivo es crear anuncios de alto rendimiento (Performance Ads) interpretando datos estructurados (JSON) y aplicando rigurosamente el Manual de Identidad Visual de la marca.

1. ENTRADA DE INFORMACIÓN (JSON): Analiza el siguiente objeto JSON con los datos del paquete turístico:

\`\`\`json
{{PACKAGE_JSON}}
\`\`\`

2. REGLAS VISUALES DE MARCA (Estricto Cumplimiento):

- Identidad: "Hagamos que todo suceda". Estilo cómplice, inspirador y resolutivo.
- Paleta de Colores:
  - Primario (Fondo/Peso): Azul Principal #1A237E (Indigo 900).
  - Acento (Call to Action/Resaltado): Verde Principal #1DE9B6 (Teal A400).
  - Secundarios: Cian #00AEFF y Gris #B2B2B2.
- Tipografía: Familia Montserrat. (Titulares en Bold Italic).
- Estilo Fotográfico:
  - Luz: Imágenes luminosas, full color, con sol radiante. NUNCA oscuras.
  - Factor Humano: Planos medios o cercanos. Debe haber personas disfrutando (parejas, amigos) para que el usuario se sienta parte de la experiencia.
  - Elementos Gráficos: Usa formas tipo "sticker" para precios y la flecha/contenedor de la marca para dar dinamismo.

3. CONTEXTO VISUAL DEL DESTINO (Crucial):
- La imagen de fondo debe representar fielmente el destino específico del JSON.
- Ejemplo: Si el JSON dice "Punta Cana" o "Bayahibe" -> La imagen DEBE mostrar playas de arena blanca, mar turquesa cristalino y palmeras cocoteras.
- Ejemplo: Si el JSON dice "Bariloche" -> La imagen debe mostrar montañas, lagos y bosques.
- No uses imágenes genéricas; adáptalas al lugar que se está vendiendo.

4. LÓGICA DE TEXTOS Y DATOS: Compón el anuncio usando estos datos extraídos:
- Titular: Usa el destino principal o una versión corta del título. Fuente: Montserrat Bold Italic.
- Precio Gancho: Usa current_price_per_pax. Redondea hacia abajo (elimina decimales) y antepón la moneda. Destácalo visualmente.
- Fecha: Formatea departure_date a "Mes Año" (Ej: "Abril 2026").
- Inclusiones: Si board_type es "ALL INCLUSIVE", debe aparecer grande. Si hay vuelo, añade "Vuelo Incluido".

5. INSTRUCCIONES DE SALIDA:
Genera exactamente 5 variantes (v1 a v5) con diferentes enfoques creativos:
- v1: Experiencial - Enfoque en la experiencia y emociones
- v2: Oferta/Hard Sell - Precio destacado, urgencia
- v3: Lifestyle - Enfoque aspiracional, estilo de vida
- v4: Destino - Hero shot del lugar, paisaje protagonista
- v5: Beneficios - Destacar All Inclusive, vuelo incluido, etc.

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO con esta estructura exacta:
{
  "v1": {
    "titulo_principal": "string - título llamativo para el anuncio",
    "subtitulo": "string - complemento del título (noches, régimen, etc)",
    "precio_texto": "string - precio formateado con moneda (ej: 'USD 1,234')",
    "cta": "string - call to action corto (ej: 'Reservá ahora')",
    "descripcion_imagen": "string - prompt EN INGLÉS para Imagen 3, técnico y detallado",
    "estilo": "string - notas de estilo visual para esta variante"
  },
  "v2": { ... },
  "v3": { ... },
  "v4": { ... },
  "v5": { ... },
  "metadata": {
    "destino": "string - destino principal",
    "fecha_salida": "string - fecha formateada",
    "precio_base": number,
    "currency": "string",
    "noches": number,
    "regimen": "string o null"
  }
}

IMPORTANTE para descripcion_imagen:
- Escríbelo EN INGLÉS para Imagen 3
- Debe ser técnico y detallado (50-100 palabras)
- Incluir: tipo de foto, composición, personas, luz, colores, ambiente
- Ejemplo: "Professional advertising photograph of a happy couple in their 30s relaxing in an infinity pool overlooking turquoise Caribbean waters. Palm trees frame the shot. Golden hour lighting, warm tones. Shot with professional DSLR, shallow depth of field. The mood is aspirational, romantic and luxurious. Style: high-end travel advertisement."`

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
