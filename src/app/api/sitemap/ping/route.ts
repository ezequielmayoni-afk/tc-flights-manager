import { NextResponse } from 'next/server'

/**
 * POST /api/sitemap/ping
 * Notify Google that the sitemap has been updated
 * Call this after creating/updating/deactivating packages
 */
export async function POST() {
  const sitemapUrl = 'https://www.siviajo.com/packages-sitemap.xml'

  try {
    const res = await fetch(
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
    )

    return NextResponse.json({
      success: true,
      status: res.status,
      message: 'Google notified of sitemap update',
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
