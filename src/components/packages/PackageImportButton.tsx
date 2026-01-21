'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { RefreshCw, Download, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

interface ImportStats {
  total: number
  imported: number
  updated: number
  skipped: number
  errors: number
  errorDetails: Array<{ id: number; title: string; error: string }>
}

interface ImportResult {
  success: boolean
  message?: string
  stats?: ImportStats
  error?: string
  package?: { id: number; tc_package_id: number; title: string; price: number; currency: string }
}

export function PackageImportButton() {
  const router = useRouter()
  const { isReadOnly } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [singlePackageId, setSinglePackageId] = useState('')
  const [isLoadingSingle, setIsLoadingSingle] = useState(false)

  // Hide the import button for read-only users
  if (isReadOnly) {
    return null
  }

  const handleImport = async (forceUpdate: boolean = false) => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/packages/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceUpdate }),
      })

      const data = await response.json()

      if (!response.ok) {
        setResult({
          success: false,
          error: data.error || 'Error al importar paquetes',
        })
      } else {
        setResult({
          success: true,
          message: data.message,
          stats: data.stats,
        })
        router.refresh()
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error de conexión',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleImportSingle = async () => {
    if (!singlePackageId.trim()) return

    setIsLoadingSingle(true)
    setResult(null)

    try {
      const response = await fetch('/api/packages/import-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tcPackageId: singlePackageId.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        setResult({
          success: false,
          error: data.error || 'Error al importar el paquete',
        })
      } else {
        setResult({
          success: true,
          message: data.message,
          package: data.package,
        })
        setSinglePackageId('')
        router.refresh()
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error de conexión',
      })
    } finally {
      setIsLoadingSingle(false)
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    setResult(null)
    setSinglePackageId('')
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Importar desde TC
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Importar Paquetes</DialogTitle>
          <DialogDescription>
            Importa todos los paquetes activos desde TravelCompositor (excepto los de Ezequiel Mayoni).
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!result && !isLoading && !isLoadingSingle && (
            <div className="space-y-6">
              {/* Import single package */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Importar paquete individual</p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="ID del paquete (ej: 38742558)"
                    value={singlePackageId}
                    onChange={(e) => setSinglePackageId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleImportSingle()}
                  />
                  <Button
                    onClick={handleImportSingle}
                    disabled={!singlePackageId.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Importar
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Importar todos los paquetes</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Importa todos los paquetes activos (excepto Ezequiel Mayoni) y actualiza los precios de los existentes.
                </p>

                <div className="flex gap-3">
                  <Button
                    onClick={() => handleImport(false)}
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Importar nuevos
                  </Button>
                  <Button
                    onClick={() => handleImport(true)}
                    variant="outline"
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Forzar actualización
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isLoadingSingle && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Importando paquete {singlePackageId}...
              </p>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Importando paquetes desde TravelCompositor...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Esto puede tomar unos minutos
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {result.success ? (
                <>
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Importación completada</span>
                  </div>

                  {result.package && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>ID TC:</div>
                        <div className="font-medium">{result.package.tc_package_id}</div>

                        <div>Título:</div>
                        <div className="font-medium">{result.package.title}</div>

                        <div>Precio:</div>
                        <div className="font-medium text-green-600">
                          {result.package.currency} {result.package.price.toLocaleString('es-AR')}
                        </div>
                      </div>
                    </div>
                  )}

                  {result.stats && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Total procesados:</div>
                        <div className="font-medium">{result.stats.total}</div>

                        <div>Nuevos importados:</div>
                        <div className="font-medium text-green-600">
                          {result.stats.imported}
                        </div>

                        <div>Actualizados:</div>
                        <div className="font-medium text-blue-600">
                          {result.stats.updated}
                        </div>

                        <div>Sin cambios:</div>
                        <div className="font-medium text-muted-foreground">
                          {result.stats.skipped}
                        </div>

                        {result.stats.errors > 0 && (
                          <>
                            <div>Errores:</div>
                            <div className="font-medium text-red-600">
                              {result.stats.errors}
                            </div>
                          </>
                        )}
                      </div>

                      {result.stats.errorDetails && result.stats.errorDetails.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium text-red-600 mb-2">
                            Errores:
                          </p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {result.stats.errorDetails.map((err, i) => (
                              <p key={i} className="text-xs text-muted-foreground">
                                ID {err.id}: {err.error}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-2 text-red-600">
                  <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Error en la importación</p>
                    <p className="text-sm mt-1">{result.error}</p>
                  </div>
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                Cerrar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
