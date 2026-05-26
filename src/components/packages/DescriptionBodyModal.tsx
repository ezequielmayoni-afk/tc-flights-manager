'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw, FileText, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'

interface DescriptionBodyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  packageId: number
  tcPackageId: number
  title: string
  initialBody: string | null
  initialFetchedAt: string | null
}

export function DescriptionBodyModal({
  open,
  onOpenChange,
  packageId,
  tcPackageId,
  title,
  initialBody,
  initialFetchedAt,
}: DescriptionBodyModalProps) {
  const [body, setBody] = useState<string | null>(initialBody)
  const [fetchedAt, setFetchedAt] = useState<string | null>(initialFetchedAt)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ chars: number; preview: string } | null>(null)

  async function handleFetch(force = false) {
    setIsLoading(true)
    setError(null)
    try {
      const qs = force ? '?force=1' : ''
      const r = await fetch(`/api/packages/${packageId}/fetch-body${qs}`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || `HTTP ${r.status}`)
      } else if (data.skipped) {
        setError(`Última actualización: ${new Date(data.fetched_at).toLocaleString('es-AR')}. Apretá "Forzar refresh" para volver a cargar.`)
      } else {
        setLastResult({ chars: data.html_size, preview: data.text_preview })
        setFetchedAt(new Date().toISOString())
        // Re-fetch full body from API
        const r2 = await fetch(`/api/packages/${packageId}/fetch-body?dry=1`, { method: 'POST' })
        if (r2.ok) {
          // dry mode no devuelve el body completo, hacer un GET al package
          const r3 = await fetch(`/api/packages/${packageId}`)
          if (r3.ok) {
            const pkg = await r3.json()
            setBody(pkg.description_body || null)
          }
        }
      }
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setIsLoading(false)
    }
  }

  const hasBody = !!body && body.length > 0
  const sourceUrl = `https://siviajo.com/es/idea/${tcPackageId}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Descripción del paquete
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="flex items-center gap-2 text-xs">
              {hasBody ? (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cargada {fetchedAt ? `(${new Date(fetchedAt).toLocaleString('es-AR')})` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Sin descripción cargada — apretá "Cargar desde siviajo"
                </span>
              )}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline ml-auto"
              >
                Ver en siviajo.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-y py-2">
          <Button
            onClick={() => handleFetch(false)}
            disabled={isLoading}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {hasBody ? 'Refrescar' : 'Cargar desde siviajo'}
          </Button>
          {hasBody && (
            <Button
              onClick={() => handleFetch(true)}
              disabled={isLoading}
              size="sm"
              variant="ghost"
            >
              Forzar refresh (ignora cache 24h)
            </Button>
          )}
          {lastResult && (
            <span className="text-xs text-muted-foreground ml-auto">
              ✓ {lastResult.chars.toLocaleString()} chars guardados
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="flex-1 overflow-auto border rounded-md p-4 bg-white">
          {hasBody ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: body! }}
            />
          ) : (
            <div className="text-center text-muted-foreground py-12">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Este paquete todavía no tiene la descripción cargada.</p>
              <p className="text-xs mt-1">Apretá <strong>"Cargar desde siviajo"</strong> para scrapear el body de la página pública.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
