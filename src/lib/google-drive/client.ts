import { google } from 'googleapis'
import { Readable, PassThrough } from 'stream'

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!
const IMPERSONATE_EMAIL = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL || 'emayoni@siviajo.com'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)

  // Use JWT with domain-wide delegation to impersonate a real user
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: IMPERSONATE_EMAIL, // Impersonate this user
  })

  return auth
}

function getDrive() {
  const auth = getAuth()
  return google.drive({ version: 'v3', auth })
}

// Helper to create a stream from buffer with proper backpressure handling
function bufferToStream(buffer: Buffer): PassThrough {
  const stream = new PassThrough()
  stream.end(buffer)
  return stream
}

export async function getOrCreatePackageFolder(packageId: number): Promise<string> {
  const drive = getDrive()
  const folderName = String(packageId)

  // Search for existing folder (supports Shared Drives)
  const response = await drive.files.list({
    q: `name='${folderName}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id!
  }

  // Create new folder (supports Shared Drives)
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [ROOT_FOLDER_ID],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  return folder.data.id!
}

export async function getOrCreateVariantFolder(packageFolderId: string, variant: number): Promise<string> {
  const drive = getDrive()
  const folderName = `v${variant}`

  // Search for existing folder (supports Shared Drives)
  const response = await drive.files.list({
    q: `name='${folderName}' and '${packageFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id!
  }

  // Create new folder (supports Shared Drives)
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [packageFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  return folder.data.id!
}

export type AspectRatio = '4x5' | '9x16' | '1080' | '1920' | '1x1'

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
    'video/mpeg': 'mpeg',
  }
  return mimeToExt[mimeType] || 'bin'
}

export async function uploadCreative(
  variantFolderId: string,
  aspectRatio: AspectRatio,
  file: Buffer,
  mimeType: string,
  originalFileName?: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDrive()

  // Get extension from mime type or original filename
  let extension = getExtensionFromMimeType(mimeType)
  if (originalFileName) {
    const extFromName = originalFileName.split('.').pop()?.toLowerCase()
    if (extFromName) extension = extFromName
  }

  const fileName = `${aspectRatio}.${extension}`
  const fileSizeMB = (file.length / (1024 * 1024)).toFixed(2)
  console.log(`[Drive] Uploading ${fileName} (${fileSizeMB}MB) to folder ${variantFolderId}`)

  // Delete any existing files with same aspect ratio (any extension) - supports Shared Drives
  console.log('[Drive] Checking for existing files...')
  const existing = await drive.files.list({
    q: `name contains '${aspectRatio}.' and '${variantFolderId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  // Delete all existing files for this aspect ratio
  if (existing.data.files && existing.data.files.length > 0) {
    console.log(`[Drive] Deleting ${existing.data.files.length} existing file(s)...`)
    for (const existingFile of existing.data.files) {
      await drive.files.delete({ fileId: existingFile.id!, supportsAllDrives: true })
    }
  }

  // Upload new file using PassThrough stream for better large file handling
  console.log('[Drive] Starting upload...')
  const stream = bufferToStream(file)

  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [variantFolderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })

    console.log('[Drive] Upload complete, fileId:', response.data.id)

    // Make the file publicly viewable so thumbnails work
    await drive.permissions.create({
      fileId: response.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    })
    console.log('[Drive] File made publicly viewable')

    return {
      id: response.data.id!,
      webViewLink: response.data.webViewLink!,
    }
  } catch (uploadError) {
    console.error('[Drive] Upload failed:', uploadError)
    throw uploadError
  }
}

export type PackageCreativesResult = {
  creatives: {
    variant: number
    aspectRatio: AspectRatio
    fileId: string
    webViewLink: string
  }[]
  folders: {
    packageFolderId: string | null
    variantFolders: Record<number, string>
  }
}

export async function listPackageCreatives(packageId: number): Promise<PackageCreativesResult> {
  const drive = getDrive()
  const creatives: PackageCreativesResult['creatives'] = []
  const folders: PackageCreativesResult['folders'] = {
    packageFolderId: null,
    variantFolders: {},
  }

  try {
    // Find package folder - supports Shared Drives
    const packageFolder = await drive.files.list({
      q: `name='${packageId}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (!packageFolder.data.files || packageFolder.data.files.length === 0) {
      return { creatives: [], folders }
    }

    const packageFolderId = packageFolder.data.files[0].id!
    folders.packageFolderId = packageFolderId

    // List variant folders - supports Shared Drives
    const variantFolders = await drive.files.list({
      q: `'${packageFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (!variantFolders.data.files) return { creatives, folders }

    for (const variantFolder of variantFolders.data.files) {
      const variantMatch = variantFolder.name?.match(/^v(\d+)$/)
      if (!variantMatch) continue

      const variant = parseInt(variantMatch[1], 10)
      folders.variantFolders[variant] = variantFolder.id!

      // List files in variant folder - supports Shared Drives
      const files = await drive.files.list({
        q: `'${variantFolder.id}' in parents and trashed=false`,
        fields: 'files(id, name, webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

      if (!files.data.files) continue

      for (const file of files.data.files) {
        // Check if file starts with known aspect ratios (any extension)
        if (file.name?.startsWith('4x5.')) {
          creatives.push({
            variant,
            aspectRatio: '4x5',
            fileId: file.id!,
            webViewLink: file.webViewLink!,
          })
        } else if (file.name?.startsWith('9x16.')) {
          creatives.push({
            variant,
            aspectRatio: '9x16',
            fileId: file.id!,
            webViewLink: file.webViewLink!,
          })
        } else if (file.name?.startsWith('1080.')) {
          creatives.push({
            variant,
            aspectRatio: '1080',
            fileId: file.id!,
            webViewLink: file.webViewLink!,
          })
        } else if (file.name?.startsWith('1920.')) {
          creatives.push({
            variant,
            aspectRatio: '1920',
            fileId: file.id!,
            webViewLink: file.webViewLink!,
          })
        }
      }
    }
  } catch (error) {
    console.error('Error listing creatives:', error)
  }

  return {
    creatives: creatives.sort((a, b) => a.variant - b.variant || a.aspectRatio.localeCompare(b.aspectRatio)),
    folders,
  }
}

export async function deleteCreative(fileId: string): Promise<void> {
  const drive = getDrive()
  await drive.files.delete({ fileId, supportsAllDrives: true })
}
