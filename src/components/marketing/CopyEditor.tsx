'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Check,
  X,
  Loader2,
  Sparkles,
  Save,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import type { MetaAdCopy } from '@/lib/meta-ads/types'

interface CopyEditorProps {
  packageId: number
  tcPackageId: number
  onCopiesChange?: (copies: MetaAdCopy[]) => void
}

const VARIANT_LABELS: Record<number, { name: string; focus: string }> = {
  1: { name: 'Precio/Oferta', focus: 'Urgencia y ahorro' },
  2: { name: 'Experiencia', focus: 'Emocional y aspiracional' },
  3: { name: 'Destino', focus: 'Características únicas del lugar' },
  4: { name: 'Conveniencia', focus: 'Todo incluido, sin preocupaciones' },
  5: { name: 'Escasez', focus: 'Últimos lugares disponibles' },
}

export function CopyEditor({
  packageId,
  tcPackageId,
  onCopiesChange,
}: CopyEditorProps) {
  const [copies, setCopies] = useState<MetaAdCopy[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch existing copies
  useEffect(() => {
    const fetchCopies = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/meta/copy/${packageId}`)
        const data = await res.json()

        if (data.copies) {
          setCopies(data.copies)
          onCopiesChange?.(data.copies)
        }
      } catch (err) {
        console.error('Error fetching copies:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCopies()
  }, [packageId, onCopiesChange])

  // Generate new copies with AI
  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/copy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_ids: [packageId] }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error generating copies')
      }

      // Refetch copies after generation
      const copiesRes = await fetch(`/api/meta/copy/${packageId}`)
      const copiesData = await copiesRes.json()

      if (copiesData.copies) {
        setCopies(copiesData.copies)
        onCopiesChange?.(copiesData.copies)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating copies')
    } finally {
      setGenerating(false)
    }
  }

  // Update a single copy field
  const handleCopyChange = (
    variant: number,
    field: keyof MetaAdCopy,
    value: string | boolean
  ) => {
    setCopies((prev) =>
      prev.map((c) =>
        c.variant === variant
          ? { ...c, [field]: value }
          : c
      )
    )
  }

  // Save a single copy
  const handleSaveCopy = async (copy: MetaAdCopy) => {
    setSaving(copy.variant)

    try {
      const res = await fetch(`/api/meta/copy/${packageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copies: [copy] }),
      })

      if (!res.ok) {
        throw new Error('Error saving copy')
      }

      // Update local state with saved data
      const data = await res.json()
      if (data.copies) {
        setCopies((prev) =>
          prev.map((c) => {
            const updated = data.copies.find(
              (u: MetaAdCopy) => u.variant === c.variant
            )
            return updated || c
          })
        )
      }
    } catch (err) {
      console.error('Error saving copy:', err)
    } finally {
      setSaving(null)
    }
  }

  // Toggle approval
  const handleToggleApproval = async (copy: MetaAdCopy) => {
    const updatedCopy = { ...copy, approved: !copy.approved }
    handleCopyChange(copy.variant, 'approved', !copy.approved)
    await handleSaveCopy(updatedCopy)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Cargando copies...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with generate button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Variantes de Copy</h3>
          <p className="text-sm text-muted-foreground">
            {copies.length > 0
              ? `${copies.filter((c) => c.approved).length}/${copies.length} aprobados`
              : 'No hay copies generados'}
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          variant={copies.length > 0 ? 'outline' : 'default'}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generando...
            </>
          ) : copies.length > 0 ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerar
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generar con IA
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {copies.length === 0 && !generating && (
        <Card>
          <CardContent className="py-8 text-center">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Haz clic en &quot;Generar con IA&quot; para crear 5 variantes de
              copy
            </p>
          </CardContent>
        </Card>
      )}

      {/* Copy variants */}
      <Accordion type="multiple" className="space-y-2">
        {copies.map((copy) => (
          <AccordionItem
            key={copy.variant}
            value={`v${copy.variant}`}
            className="border rounded-lg"
          >
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <Badge
                  variant={copy.approved ? 'default' : 'secondary'}
                  className="w-8 justify-center"
                >
                  V{copy.variant}
                </Badge>
                <div className="flex-1 text-left">
                  <span className="font-medium">
                    {VARIANT_LABELS[copy.variant]?.name}
                  </span>
                  <span className="text-muted-foreground text-sm ml-2">
                    {VARIANT_LABELS[copy.variant]?.focus}
                  </span>
                </div>
                {copy.approved && (
                  <Badge variant="outline" className="text-green-600">
                    <Check className="h-3 w-3 mr-1" />
                    Aprobado
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4">
                {/* Headline */}
                <div className="space-y-2">
                  <Label>Headline (max 40 chars)</Label>
                  <Input
                    value={copy.headline}
                    onChange={(e) =>
                      handleCopyChange(copy.variant, 'headline', e.target.value)
                    }
                    maxLength={40}
                    placeholder="Título llamativo"
                  />
                  <span className="text-xs text-muted-foreground">
                    {copy.headline.length}/40
                  </span>
                </div>

                {/* Primary Text */}
                <div className="space-y-2">
                  <Label>Texto principal</Label>
                  <Textarea
                    value={copy.primary_text}
                    onChange={(e) =>
                      handleCopyChange(
                        copy.variant,
                        'primary_text',
                        e.target.value
                      )
                    }
                    placeholder="Texto principal del anuncio"
                    rows={4}
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label>Descripción (max 125 chars)</Label>
                  <Input
                    value={copy.description || ''}
                    onChange={(e) =>
                      handleCopyChange(
                        copy.variant,
                        'description',
                        e.target.value
                      )
                    }
                    maxLength={125}
                    placeholder="Descripción secundaria"
                  />
                  <span className="text-xs text-muted-foreground">
                    {(copy.description || '').length}/125
                  </span>
                </div>

                {/* WhatsApp Message Template */}
                <div className="space-y-2">
                  <Label>Plantilla WhatsApp</Label>
                  <Textarea
                    value={copy.wa_message_template}
                    onChange={(e) =>
                      handleCopyChange(
                        copy.variant,
                        'wa_message_template',
                        e.target.value
                      )
                    }
                    placeholder="Mensaje de WhatsApp"
                    rows={3}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Debe incluir &quot;SIV {tcPackageId}&quot; para tracking
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleApproval(copy)}
                  >
                    {copy.approved ? (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Desaprobar
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Aprobar
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveCopy(copy)}
                    disabled={saving === copy.variant}
                  >
                    {saving === copy.variant ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-1" />
                        Guardar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
