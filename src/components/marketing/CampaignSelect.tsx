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
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import type { MetaCampaign } from '@/lib/meta-ads/types'

interface CampaignSelectProps {
  value?: string
  onChange: (campaignId: string) => void
  disabled?: boolean
  label?: string
  showRefresh?: boolean
}

export function CampaignSelect({
  value,
  onChange,
  disabled = false,
  label = 'Campaña',
  showRefresh = true,
}: CampaignSelectProps) {
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchCampaigns = async (sync: boolean = false) => {
    if (sync) {
      setSyncing(true)
    } else {
      setLoading(true)
    }

    try {
      const url = sync ? '/api/meta/campaigns?sync=true' : '/api/meta/campaigns'
      const res = await fetch(url)
      const data = await res.json()

      if (data.campaigns) {
        setCampaigns(data.campaigns)
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE')

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {showRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchCampaigns(true)}
            disabled={syncing}
            className="h-6 px-2 text-xs"
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1">Sync</span>
          </Button>
        )}
      </div>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || loading}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={loading ? 'Cargando...' : 'Seleccionar campaña'}
          />
        </SelectTrigger>
        <SelectContent>
          {activeCampaigns.map((campaign) => (
            <SelectItem
              key={campaign.meta_campaign_id}
              value={campaign.meta_campaign_id}
            >
              {campaign.name}
            </SelectItem>
          ))}
          {activeCampaigns.length === 0 && !loading && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No hay campañas activas
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
