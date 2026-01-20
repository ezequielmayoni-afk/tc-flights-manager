'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { MetaAdSet } from '@/lib/meta-ads/types'

interface AdSetSelectProps {
  campaignId?: string
  value?: string
  onChange: (adSetId: string) => void
  disabled?: boolean
  label?: string
}

export function AdSetSelect({
  campaignId,
  value,
  onChange,
  disabled = false,
  label = 'Ad Set',
}: AdSetSelectProps) {
  const [adSets, setAdSets] = useState<MetaAdSet[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!campaignId) {
      setAdSets([])
      return
    }

    const fetchAdSets = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/meta/adsets?campaign_id=${campaignId}`)
        const data = await res.json()

        if (data.adsets) {
          setAdSets(data.adsets)
        }
      } catch (error) {
        console.error('Error fetching ad sets:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAdSets()
  }, [campaignId])

  const activeAdSets = adSets.filter((a) => a.status === 'ACTIVE')

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || loading || !campaignId}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              !campaignId
                ? 'Primero selecciona una campaña'
                : loading
                  ? 'Cargando...'
                  : 'Seleccionar ad set'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {activeAdSets.map((adSet) => (
            <SelectItem key={adSet.meta_adset_id} value={adSet.meta_adset_id}>
              <div className="flex flex-col">
                <span>{adSet.name}</span>
                {adSet.optimization_goal && (
                  <span className="text-xs text-muted-foreground">
                    {adSet.optimization_goal}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
          {activeAdSets.length === 0 && !loading && campaignId && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No hay ad sets activos en esta campaña
            </div>
          )}
        </SelectContent>
      </Select>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando ad sets...
        </div>
      )}
    </div>
  )
}
