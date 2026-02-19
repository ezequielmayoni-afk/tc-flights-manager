'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

interface PackageData {
  id: number
  tc_package_id: number
  destination: string
  price: number
  currency: string
  nights: number
  departure_date: string
  hotel?: string
  board_type?: string
  airline?: string
}

export default function DesignStudioPage() {
  const [packageId, setPackageId] = useState('')
  const [packageData, setPackageData] = useState<PackageData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  // Buscar paquete
  const handleSearch = async () => {
    if (!packageId) {
      toast.error('Ingresá un ID de paquete')
      return
    }

    setIsLoading(true)
    setPackageData(null)
    setGeneratedImage(null)

    try {
      const response = await fetch(`/api/ai/design-studio/package?id=${packageId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al buscar paquete')
      }

      const data = await response.json()
      setPackageData(data)
      toast.success('Paquete encontrado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  // Generar imagen de fondo (Capa 1)
  const handleGenerateImage = async () => {
    if (!packageData) return

    setIsGenerating(true)
    setGeneratedImage(null)

    try {
      const response = await fetch('/api/ai/design-studio/generate-layer1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: packageData.tc_package_id,
          variant: 1, // Por ahora siempre variante 1
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al generar imagen')
      }

      const data = await response.json()
      setGeneratedImage(data.imageUrl)
      toast.success('Imagen generada')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Design Studio - Capa 1</h1>
        <p className="text-muted-foreground">
          Prueba de generación de imagen de fondo (destino + sentimiento)
        </p>
      </div>

      {/* Búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle>1. Buscar Paquete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="packageId">ID del Paquete (tc_package_id)</Label>
              <Input
                id="packageId"
                type="number"
                placeholder="Ej: 22740744"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={isLoading || !packageId}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Buscar</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* JSON del paquete */}
      {packageData && (
        <Card>
          <CardHeader>
            <CardTitle>2. Datos del Paquete</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto max-h-80">
              {JSON.stringify(packageData, null, 2)}
            </pre>

            <div className="mt-4">
              <Button
                onClick={handleGenerateImage}
                disabled={isGenerating}
                size="lg"
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generando imagen de fondo...
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Crear Imagen de Fondo (Capa 1)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Imagen generada */}
      {generatedImage && (
        <Card>
          <CardHeader>
            <CardTitle>3. Imagen Generada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <img
                src={generatedImage}
                alt="Imagen generada"
                className="max-w-full max-h-[600px] rounded-lg shadow-lg"
              />
            </div>
            <div className="mt-4 text-center">
              <a
                href={generatedImage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Abrir en nueva pestaña
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
