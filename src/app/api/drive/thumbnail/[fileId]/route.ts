import { NextRequest, NextResponse } from 'next/server'
import { getDriveThumbnail } from '@/lib/google-drive/client'

/**
 * GET /api/drive/thumbnail/[fileId]?sz=400
 *
 * Server-side proxy for Google Drive thumbnails. Fetches the thumbnail through the
 * Drive API (service account) and streams the bytes. Reliable for images AND videos,
 * and works regardless of the file's public-sharing state — unlike the flaky
 * drive.google.com/thumbnail?id=... endpoint the browser used to hit directly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: 'invalid fileId' }, { status: 400 })
  }
  const szParam = parseInt(request.nextUrl.searchParams.get('sz') || '400', 10)
  const size = Number.isFinite(szParam) ? Math.min(Math.max(szParam, 64), 1600) : 400

  try {
    const thumb = await getDriveThumbnail(fileId, size)
    if (!thumb) {
      return NextResponse.json({ error: 'no thumbnail available' }, { status: 404 })
    }
    return new NextResponse(thumb.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': thumb.contentType,
        // Cache in the browser/CDN — thumbnails are stable for a given fileId
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error(`[drive/thumbnail] ${fileId}:`, error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'thumbnail fetch failed' },
      { status: 502 },
    )
  }
}
