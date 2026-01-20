import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Search } from 'lucide-react'
import { SeoTable } from '@/components/packages/SeoTable'

type PackageWithSeo = {
  id: number
  tc_package_id: number
  title: string
  seo_title: string | null
  seo_description: string | null
  seo_keywords: string | null
  meta_title: string | null
  meta_description: string | null
  image_alt: string | null
  include_sitemap: boolean
  seo_status: string | null
  seo_generated_at: string | null
  seo_uploaded_to_tc: boolean
}

async function getPackagesWithSeo(): Promise<PackageWithSeo[]> {
  const supabase = await createClient()

  const { data: packages, error } = await supabase
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      seo_title,
      seo_description,
      seo_keywords,
      meta_title,
      meta_description,
      image_alt,
      include_sitemap,
      seo_status,
      seo_generated_at,
      seo_uploaded_to_tc
    `)
    .eq('tc_active', true)
    .order('tc_package_id', { ascending: false })

  if (error) {
    console.error('Error fetching packages with SEO:', error)
    return []
  }

  return (packages as PackageWithSeo[]) || []
}

async function getSeoStats() {
  const supabase = await createClient()

  const [
    { count: totalCount },
    { count: sitemapCount },
    { count: generatedCount },
    { count: pendingCount },
    { count: uploadedCount },
  ] = await Promise.all([
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tc_active', true),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tc_active', true).eq('include_sitemap', true),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tc_active', true).eq('seo_status', 'generated'),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tc_active', true).or('seo_status.is.null,seo_status.eq.pending'),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tc_active', true).eq('seo_uploaded_to_tc', true),
  ])

  return {
    total: totalCount || 0,
    sitemap: sitemapCount || 0,
    generated: generatedCount || 0,
    pending: pendingCount || 0,
    uploaded: uploadedCount || 0,
  }
}

export default async function SeoPage() {
  const [packages, stats] = await Promise.all([getPackagesWithSeo(), getSeoStats()])

  return (
    <div className="flex flex-col h-full">
      <Header title="SEO de Paquetes" />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {stats.total} paquetes activos
              </span>
            </div>

            <div className="flex items-center gap-2 text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>{stats.generated} con SEO</span>
            </div>

            <div className="flex items-center gap-2 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{stats.pending} pendientes</span>
            </div>

            <div className="flex items-center gap-2 text-blue-600">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>{stats.sitemap} en sitemap</span>
            </div>

            <div className="flex items-center gap-2 text-purple-600">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>{stats.uploaded} subidos a TC</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <SeoTable packages={packages} />
        </div>
      </div>
    </div>
  )
}
