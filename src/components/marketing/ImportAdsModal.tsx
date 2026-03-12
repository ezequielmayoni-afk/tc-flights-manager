'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react'

interface ImportAdsModalProps {
  open: boolean
  onClose: () => void
  packageId: number
  packageTitle: string
  onSuccess: (adsCreatedCount: number) => void
}

interface ImportResult {
  meta_ad_id: string
  ad_name: string
  status: string
  thumbnail_url: string | null
}

export function ImportAdsModal({ open, onClose, packageId, packageTitle, onSuccess }: ImportAdsModalProps) {
  const [adsetId, setAdsetId] = useState('')
  const [adIds, setAdIds] = useState<string[]>([''])
  const [isImporting, setIsImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [importErrors, setImportErrors] = useState<Array<{ meta_ad_id: string; error: string }>>([])

  const addAdIdField = () => {
    setAdIds(prev => [...prev, ''])
  }

  const removeAdIdField = (index: number) => {
    setAdIds(prev => prev.filter((_, i) => i !== index))
  }

  const updateAdId = (index: number, value: string) => {
    setAdIds(prev => prev.map((id, i) => i === index ? value.trim() : id))
  }

  const handleImport = async () => {
    const validAdIds = adIds.filter(id => id.trim())

    if (!adsetId.trim()) {
      toast.error('Ingresá el AdSet ID')
      return
    }
    if (validAdIds.length === 0) {
      toast.error('Ingresá al menos un Ad ID')
      return
    }

    setIsImporting(true)
    setResults(null)
    setImportErrors([])

    try {
      const res = await fetch('/api/meta/ads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: packageId,
          meta_adset_id: adsetId.trim(),
          meta_ad_ids: validAdIds,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error importando anuncios')
      }

      setResults(data.imported)
      setImportErrors(data.errors || [])

      if (data.imported.length > 0) {
        toast.success(`${data.imported.length} anuncio${data.imported.length > 1 ? 's' : ''} importado${data.imported.length > 1 ? 's' : ''}`)
        onSuccess(data.ads_created_count)
      }

      if (data.errors?.length > 0) {
        toast.error(`${data.errors.length} anuncio${data.errors.length > 1 ? 's' : ''} no se pudieron importar`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error importando anuncios')
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = () => {
    setAdsetId('')
    setAdIds([''])
    setResults(null)
    setImportErrors([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar anuncios existentes</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Vinculá anuncios de Meta que ya existen con <strong>{packageTitle}</strong>
        </p>

        <div className="space-y-4">
          {/* AdSet ID */}
          <div className="space-y-2">
            <Label>AdSet ID</Label>
            <Input
              placeholder="Ej: 23456789012345"
              value={adsetId}
              onChange={(e) => setAdsetId(e.target.value)}
              disabled={isImporting}
            />
          </div>

          {/* Ad IDs */}
          <div className="space-y-2">
            <Label>Ad IDs</Label>
            {adIds.map((id, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Ej: 23456789012345"
                  value={id}
                  onChange={(e) => updateAdId(index, e.target.value)}
                  disabled={isImporting}
                />
                {adIds.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAdIdField(index)}
                    disabled={isImporting}
                    className="h-10 w-10 p-0 shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addAdIdField}
              disabled={isImporting}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar otro anuncio
            </Button>
          </div>

          {/* Results */}
          {results && results.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3">
              <p className="text-sm font-medium">Importados:</p>
              {results.map((r) => (
                <div key={r.meta_ad_id} className="flex items-center gap-3 text-sm">
                  {r.thumbnail_url ? (
                    <img
                      src={r.thumbnail_url}
                      alt={r.ad_name}
                      className="h-10 w-10 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{r.ad_name}</p>
                    <p className="text-muted-foreground text-xs">{r.meta_ad_id} · {r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="space-y-2 border border-red-200 rounded-lg p-3 bg-red-50">
              <p className="text-sm font-medium text-red-700">Errores:</p>
              {importErrors.map((e) => (
                <div key={e.meta_ad_id} className="flex items-center gap-2 text-sm text-red-600">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{e.meta_ad_id}: {e.error}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isImporting}>
              {results ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!results && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Importar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
