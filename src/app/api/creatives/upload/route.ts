import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreatePackageFolder,
  getOrCreateVariantFolder,
  uploadCreative,
  AspectRatio,
} from '@/lib/google-drive/client'
import { createClient } from '@supabase/supabase-js'
import Busboy from 'busboy'
import { Readable } from 'stream'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Allow large file uploads (videos) - 500MB max
export const maxDuration = 300 // 5 minutes timeout for large uploads

// Use Node.js runtime for large file handling
export const runtime = 'nodejs'

// Disable body parsing to handle large files manually
export const dynamic = 'force-dynamic'

interface ParsedFormData {
  packageId: number
  variant: number
  aspectRatio: AspectRatio
  file: Buffer
  fileName: string
  mimeType: string
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  return Buffer.concat(chunks)
}

async function parseMultipartForm(request: NextRequest): Promise<ParsedFormData> {
  const contentType = request.headers.get('content-type') || ''
  console.log('[Creatives] Content-Type:', contentType)

  if (!contentType.includes('multipart/form-data')) {
    throw new Error(`Invalid content type: ${contentType}`)
  }

  if (!request.body) {
    throw new Error('No request body')
  }

  // First, read the entire body into a buffer
  console.log('[Creatives] Reading request body...')
  const bodyBuffer = await streamToBuffer(request.body)
  console.log('[Creatives] Body read, size:', bodyBuffer.length)

  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
    })

    const fields: Record<string, string> = {}
    let fileBuffer: Buffer | null = null
    let fileName = ''
    let mimeType = ''

    busboy.on('field', (name, value) => {
      console.log('[Creatives] Field:', name, '=', value)
      fields[name] = value
    })

    busboy.on('file', (name, file, info) => {
      console.log('[Creatives] Receiving file:', info.filename, info.mimeType)
      const chunks: Buffer[] = []
      fileName = info.filename
      mimeType = info.mimeType

      file.on('data', (chunk) => {
        chunks.push(chunk)
      })

      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks)
        console.log('[Creatives] File parsed, size:', fileBuffer.length)
      })

      file.on('limit', () => {
        reject(new Error('File size exceeds 500MB limit'))
      })

      file.on('error', (err) => {
        console.error('[Creatives] File stream error:', err)
        reject(err)
      })
    })

    busboy.on('finish', () => {
      console.log('[Creatives] Busboy finish, fileBuffer:', fileBuffer ? fileBuffer.length : 'null')
      if (!fileBuffer) {
        reject(new Error('No file uploaded'))
        return
      }

      resolve({
        packageId: parseInt(fields.packageId, 10),
        variant: parseInt(fields.variant, 10),
        aspectRatio: fields.aspectRatio as AspectRatio,
        file: fileBuffer,
        fileName,
        mimeType,
      })
    })

    busboy.on('error', (err) => {
      console.error('[Creatives] Busboy error:', err)
      reject(err)
    })

    // Create a readable stream from the buffer and pipe to busboy
    const readable = Readable.from(bodyBuffer)
    readable.pipe(busboy)
  })
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Creatives] === Starting upload ===')

    // Step 1: Parse multipart form
    console.log('[Creatives] Step 1: Parsing form...')
    const { packageId, variant, aspectRatio, file, fileName, mimeType } = await parseMultipartForm(request)
    console.log('[Creatives] Step 1 complete:', { packageId, variant, aspectRatio, fileName, mimeType, fileSize: file?.length })

    if (!packageId || !variant || !aspectRatio || !file) {
      return NextResponse.json(
        { error: 'Missing required fields: packageId, variant, aspectRatio, file' },
        { status: 400 }
      )
    }

    if (!['4x5', '9x16'].includes(aspectRatio)) {
      return NextResponse.json(
        { error: 'Invalid aspectRatio. Must be "4x5" or "9x16"' },
        { status: 400 }
      )
    }

    // Step 2: Get tc_package_id from database
    console.log('[Creatives] Step 2: Fetching package from DB...')
    const db = getSupabaseClient()
    const { data: pkg, error: dbError } = await db
      .from('packages')
      .select('tc_package_id')
      .eq('id', packageId)
      .single()

    if (dbError || !pkg) {
      console.error('[Creatives] Step 2 failed: Package not found', dbError)
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      )
    }
    console.log('[Creatives] Step 2 complete: tc_package_id =', pkg.tc_package_id)

    // Step 3: Create/get package folder
    console.log('[Creatives] Step 3: Getting package folder...')
    const packageFolderId = await getOrCreatePackageFolder(pkg.tc_package_id)
    console.log('[Creatives] Step 3 complete: packageFolderId =', packageFolderId)

    // Step 4: Create/get variant folder
    console.log('[Creatives] Step 4: Getting variant folder...')
    const variantFolderId = await getOrCreateVariantFolder(packageFolderId, variant)
    console.log('[Creatives] Step 4 complete: variantFolderId =', variantFolderId)

    // Step 5: Upload to Google Drive
    console.log('[Creatives] Step 5: Uploading to Drive...')
    const result = await uploadCreative(variantFolderId, aspectRatio, file, mimeType, fileName)
    console.log('[Creatives] Step 5 complete:', result)

    // Step 6: Increment creative_count atomically
    console.log('[Creatives] Step 6: Incrementing creative_count...')
    const { error: rpcError } = await db.rpc('increment_creative_count', {
      package_id_param: packageId,
    })

    if (rpcError) {
      // Fallback to direct update if RPC doesn't exist
      console.log('[Creatives] RPC fallback, using direct update')
      const { data: currentPkg } = await db
        .from('packages')
        .select('creative_count')
        .eq('id', packageId)
        .single()

      await db
        .from('packages')
        .update({ creative_count: (currentPkg?.creative_count || 0) + 1 })
        .eq('id', packageId)
    }
    console.log('[Creatives] Step 6 complete')

    console.log('[Creatives] === Upload complete ===')

    return NextResponse.json({
      success: true,
      fileId: result.id,
      webViewLink: result.webViewLink,
    })
  } catch (error) {
    console.error('[Creatives] Upload error:', error)
    // Log the full error stack for debugging
    if (error instanceof Error) {
      console.error('[Creatives] Error stack:', error.stack)
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
