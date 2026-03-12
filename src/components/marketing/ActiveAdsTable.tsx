'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Loader2, Search, LinkIcon, Unlink, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'

interface ActiveAd {
  meta_ad_id: string
  ad_name: string
  status: string
  campaign_name: string
  adset_name: string
  spend: number
  impressions: number
  clicks: number
  thumbnail_url: string | null
  linked: boolean
  package_id: number | null
  tc_package_id: number | null
  package_title: string | null
}

interface MarketingPackage {
  id: number
  tc_package_id: number
  title: string
}

type SortKey = 'ad_name' | 'campaign_name' | 'adset_name' | 'spend' | 'impressions' | 'clicks' | 'status'
type SortDir = 'asc' | 'desc' | null

export function ActiveAdsTable() {
  const [ads, setAds] = useState<ActiveAd[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [total, setTotal] = useState(0)
  const [linkedCount, setLinkedCount] = useState(0)
  const [unlinkedCount, setUnlinkedCount] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  // Link dialog state
  const [linkAd, setLinkAd] = useState<ActiveAd | null>(null)
  const [packages, setPackages] = useState<MarketingPackage[]>([])
  const [pkgSearch, setPkgSearch] = useState('')
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null)
  const [adsetIdInput, setAdsetIdInput] = useState('')
  const [linking, setLinking] = useState(false)
  const [loadingPkgs, setLoadingPkgs] = useState(false)

  const fetchAds = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/meta/ads/active')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error fetching ads')
      setAds(data.ads)
      setTotal(data.total)
      setLinkedCount(data.linked_count)
      setUnlinkedCount(data.unlinked_count)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error cargando anuncios')
    } finally {
      setLoading(false)
    }
  }

  const fetchPackages = async () => {
    setLoadingPkgs(true)
    try {
      const res = await fetch('/api/meta/ads/active/packages')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setPackages(data.packages || [])
    } catch {
      toast.error('Error cargando paquetes')
    } finally {
      setLoadingPkgs(false)
    }
  }

  const handleOpenLink = (ad: ActiveAd) => {
    setLinkAd(ad)
    setSelectedPkgId(null)
    setPkgSearch('')
    setAdsetIdInput('')
    if (packages.length === 0) fetchPackages()
  }

  const handleLink = async () => {
    if (!linkAd || !selectedPkgId) return
    setLinking(true)
    try {
      const res = await fetch('/api/meta/ads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: selectedPkgId,
          meta_adset_id: adsetIdInput.trim() || 'unknown',
          meta_ad_ids: [linkAd.meta_ad_id],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error vinculando')
      if (data.imported?.length > 0) {
        toast.success(`Anuncio vinculado correctamente`)
        setLinkAd(null)
        fetchAds()
      } else if (data.errors?.length > 0) {
        toast.error(data.errors[0].error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error vinculando anuncio')
    } finally {
      setLinking(false)
    }
  }

  useEffect(() => {
    fetchAds()
  }, [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null) }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    if (sortDir === 'asc') return <ArrowUp className="h-3 w-3 ml-1" />
    return <ArrowDown className="h-3 w-3 ml-1" />
  }

  // Filter
  let filtered = ads
  if (filter === 'linked') filtered = filtered.filter(a => a.linked)
  if (filter === 'unlinked') filtered = filtered.filter(a => !a.linked)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(a =>
      a.ad_name.toLowerCase().includes(q) ||
      a.campaign_name.toLowerCase().includes(q) ||
      a.adset_name.toLowerCase().includes(q) ||
      a.meta_ad_id.includes(q) ||
      (a.package_title && a.package_title.toLowerCase().includes(q))
    )
  }

  // Sort
  if (sortKey && sortDir) {
    const dir = sortDir === 'asc' ? 1 : -1
    filtered = [...filtered].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }

  const ctr = (ad: ActiveAd) => ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Cargando anuncios activos de Meta...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Total activos</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Vinculados a Hub</p>
          <p className="text-2xl font-bold text-green-600">{linkedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Sin vincular</p>
          <p className="text-2xl font-bold text-orange-600">{unlinkedCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, campaña, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Todos ({total})
          </Button>
          <Button
            variant={filter === 'linked' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('linked')}
          >
            <LinkIcon className="h-3 w-3 mr-1" />
            Vinculados ({linkedCount})
          </Button>
          <Button
            variant={filter === 'unlinked' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unlinked')}
          >
            <Unlink className="h-3 w-3 mr-1" />
            Sin vincular ({unlinkedCount})
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAds} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 w-12"></th>
              <th
                className="text-left p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('ad_name')}
              >
                <span className="flex items-center">Anuncio<SortIcon col="ad_name" /></span>
              </th>
              <th
                className="text-left p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('campaign_name')}
              >
                <span className="flex items-center">Campaña<SortIcon col="campaign_name" /></span>
              </th>
              <th
                className="text-left p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('adset_name')}
              >
                <span className="flex items-center">Conjunto<SortIcon col="adset_name" /></span>
              </th>
              <th
                className="text-left p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('status')}
              >
                <span className="flex items-center">Estado<SortIcon col="status" /></span>
              </th>
              <th
                className="text-right p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('spend')}
              >
                <span className="flex items-center justify-end">Gasto (7d)<SortIcon col="spend" /></span>
              </th>
              <th
                className="text-right p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('impressions')}
              >
                <span className="flex items-center justify-end">Impresiones<SortIcon col="impressions" /></span>
              </th>
              <th
                className="text-right p-3 cursor-pointer select-none hover:bg-muted/80"
                onClick={() => handleSort('clicks')}
              >
                <span className="flex items-center justify-end">Clicks<SortIcon col="clicks" /></span>
              </th>
              <th className="text-right p-3">CTR</th>
              <th className="text-center p-3">Hub</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-muted-foreground">
                  {search || filter !== 'all' ? 'No se encontraron anuncios con estos filtros' : 'No hay anuncios activos en Meta'}
                </td>
              </tr>
            ) : (
              filtered.map(ad => (
                <tr key={ad.meta_ad_id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    {ad.thumbnail_url ? (
                      <img
                        src={ad.thumbnail_url}
                        alt={ad.ad_name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </td>
                  <td className="p-3">
                    <p className="font-medium truncate max-w-[250px]">{ad.ad_name}</p>
                    <p className="text-xs text-muted-foreground">{ad.meta_ad_id}</p>
                  </td>
                  <td className="p-3">
                    <p className="truncate max-w-[180px]">{ad.campaign_name}</p>
                  </td>
                  <td className="p-3">
                    <p className="truncate max-w-[180px]">{ad.adset_name}</p>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={ad.status === 'ACTIVE' ? 'default' : 'secondary'}
                      className={ad.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200' : ''}
                    >
                      {ad.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-mono">
                    ${ad.spend.toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {ad.impressions.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {ad.clicks.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {ctr(ad)}%
                  </td>
                  <td className="p-3 text-center">
                    {ad.linked ? (
                      <div className="flex flex-col items-center">
                        <LinkIcon className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-[120px]">
                          #{ad.tc_package_id}
                        </span>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleOpenLink(ad)}
                      >
                        <LinkIcon className="h-3 w-3 mr-1" />
                        Vincular
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals row */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>{filtered.length} anuncio{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex gap-6 font-mono">
            <span>Gasto: ${filtered.reduce((s, a) => s + a.spend, 0).toFixed(2)}</span>
            <span>Impresiones: {filtered.reduce((s, a) => s + a.impressions, 0).toLocaleString()}</span>
            <span>Clicks: {filtered.reduce((s, a) => s + a.clicks, 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Link ad to package dialog */}
      <Dialog open={!!linkAd} onOpenChange={(open) => !open && setLinkAd(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular anuncio a paquete</DialogTitle>
          </DialogHeader>
          {linkAd && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                {linkAd.thumbnail_url ? (
                  <img src={linkAd.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{linkAd.ad_name}</p>
                  <p className="text-xs text-muted-foreground">{linkAd.meta_ad_id}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>AdSet ID (opcional)</Label>
                <Input
                  placeholder="Ej: 23456789012345"
                  value={adsetIdInput}
                  onChange={e => setAdsetIdInput(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Paquete</Label>
                <Input
                  placeholder="Buscar paquete por nombre o ID..."
                  value={pkgSearch}
                  onChange={e => setPkgSearch(e.target.value)}
                />
                {loadingPkgs ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {packages
                      .filter(p => {
                        if (!pkgSearch.trim()) return true
                        const q = pkgSearch.toLowerCase()
                        return p.title.toLowerCase().includes(q) || String(p.tc_package_id).includes(q)
                      })
                      .map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-b-0 ${
                            selectedPkgId === p.id ? 'bg-primary/10 font-medium' : ''
                          }`}
                          onClick={() => setSelectedPkgId(p.id)}
                        >
                          <span className="text-muted-foreground">#{p.tc_package_id}</span>{' '}
                          {p.title}
                        </button>
                      ))}
                    {packages.filter(p => {
                      if (!pkgSearch.trim()) return true
                      const q = pkgSearch.toLowerCase()
                      return p.title.toLowerCase().includes(q) || String(p.tc_package_id).includes(q)
                    }).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No se encontraron paquetes
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setLinkAd(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleLink} disabled={!selectedPkgId || linking}>
                  {linking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Vincular
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
