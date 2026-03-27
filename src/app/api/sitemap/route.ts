import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function buildPackageUrl(packageId: number, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `https://www.siviajo.com/es/idea/${packageId}/${slug}`
}

/**
 * GET /api/sitemap
 * Dynamic sitemap XML with all active packages from Hub
 */
export async function GET() {
  const db = createAdminClient()

  // All packages in Hub are active/relevant - include all
  const { data: packages } = await db
    .from('packages')
    .select('tc_package_id, title, updated_at, created_at')
    .order('updated_at', { ascending: false })

  const urls = (packages || []).map(pkg => {
    const url = buildPackageUrl(pkg.tc_package_id, pkg.title)
    const lastmod = (pkg.updated_at || pkg.created_at || new Date().toISOString()).slice(0, 10)
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
