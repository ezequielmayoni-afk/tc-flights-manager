import { NextRequest, NextResponse } from 'next/server'
import { getOrCreatePackageFolder } from '@/lib/google-drive/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/packages/[id]/drive-folder
 *
 * Devuelve un redirect 302 hacia el folder de Google Drive del paquete.
 * El `[id]` puede ser el id interno (number) o el tc_package_id.
 *
 * Caso de uso: en /packages/comercial, click en el ID del paquete abre
 * automáticamente la carpeta de Drive con las placas / creativos.
 *
 * Si el folder no existe, `getOrCreatePackageFolder` lo crea automáticamente.
 * Query param `?json=1` devuelve `{ folderId, url }` en lugar de redirect (útil para preload).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const numericId = parseInt(id)

  if (!numericId || Number.isNaN(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  // Resolver el tc_package_id si nos pasaron el id interno (los tc_package_id son >1M en general)
  let tcPackageId = numericId
  if (numericId < 1_000_000) {
    const db = createAdminClient()
    const { data: pkg } = await db
      .from('packages')
      .select('tc_package_id')
      .eq('id', numericId)
      .maybeSingle()
    if (!pkg) {
      return NextResponse.json({ error: 'package not found' }, { status: 404 })
    }
    tcPackageId = pkg.tc_package_id
  }

  try {
    const folderId = await getOrCreatePackageFolder(tcPackageId)
    const folderUrl = `https://drive.google.com/drive/u/0/folders/${folderId}`

    if (request.nextUrl.searchParams.get('json') === '1') {
      return NextResponse.json({ folderId, url: folderUrl, tcPackageId })
    }
    return NextResponse.redirect(folderUrl, 302)
  } catch (e) {
    console.error('[drive-folder] error:', e)
    // Fallback: buscar el folder por nombre en Drive search público
    const searchUrl = `https://drive.google.com/drive/search?q=${tcPackageId}`
    return NextResponse.redirect(searchUrl, 302)
  }
}
