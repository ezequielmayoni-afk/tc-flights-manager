// Creative Uploader: Download from Google Drive, Upload to Meta
import { google } from 'googleapis'
import { getMetaAdsClient } from './client'
import type { AspectRatio, CreativeType } from './types'

// =====================================================
// Retry with Exponential Backoff
// =====================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelayMs?: number
    context?: string
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, context = 'operation' } = options
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`[Retry] ${context} - Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, lastError.message)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// =====================================================
// File Validation Before Upload
// =====================================================

interface FileValidation {
  valid: boolean
  error?: string
  detectedType?: 'image' | 'video'
}

function validateCreativeFile(
  buffer: Buffer,
  filename: string,
  expectedType: 'IMAGE' | 'VIDEO'
): FileValidation {
  // Size limits
  const maxImageSize = 30 * 1024 * 1024  // 30MB for images
  const maxVideoSize = 4 * 1024 * 1024 * 1024  // 4GB for videos
  const maxSize = expectedType === 'IMAGE' ? maxImageSize : maxVideoSize

  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max: ${maxSize / 1024 / 1024}MB)`
    }
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'Empty file' }
  }

  // Validate magic bytes for type detection
  if (expectedType === 'IMAGE') {
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46
    const isWebp = buffer.length > 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50

    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return { valid: false, error: `Unsupported image format for ${filename}` }
    }

    return { valid: true, detectedType: 'image' }
  }

  if (expectedType === 'VIDEO') {
    // Common video magic bytes
    const isMp4 = buffer.length > 8 && (
      (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) || // ftyp
      (buffer[4] === 0x6D && buffer[5] === 0x6F && buffer[6] === 0x6F && buffer[7] === 0x76)    // moov
    )
    const isWebm = buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3
    const isMov = buffer.length > 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
    const isAvi = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46

    // Be more lenient with video - some formats are hard to detect
    if (!isMp4 && !isWebm && !isMov && !isAvi) {
      console.warn(`[File Validation] Could not verify video format for ${filename}, proceeding anyway`)
    }

    return { valid: true, detectedType: 'video' }
  }

  return { valid: true }
}

// In-memory cache for Drive creatives (reduces API calls within a request)
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const driveCreativesCache = new Map<number, CacheEntry<DriveCreativeInfo[]>>()
const CACHE_TTL_MS = 60 * 1000 // 1 minute cache (creatives don't change frequently)

function getCachedCreatives(tcPackageId: number): DriveCreativeInfo[] | null {
  const cached = driveCreativesCache.get(tcPackageId)
  if (!cached) return null

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    driveCreativesCache.delete(tcPackageId)
    return null
  }

  console.log(`[Creative Uploader] Using cached creatives for package ${tcPackageId}`)
  return cached.data
}

function setCachedCreatives(tcPackageId: number, creatives: DriveCreativeInfo[]): void {
  driveCreativesCache.set(tcPackageId, {
    data: creatives,
    timestamp: Date.now(),
  })
}

// Image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
// Video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mpeg']

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)

  // If impersonation email is set, use domain-wide delegation
  // Otherwise, use direct service account access (folder must be shared with service account)
  const impersonateEmail = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL

  const authConfig: {
    email: string
    key: string
    scopes: string[]
    subject?: string
  } = {
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  }

  if (impersonateEmail) {
    authConfig.subject = impersonateEmail
  }

  return new google.auth.JWT(authConfig)
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

export interface DriveCreativeInfo {
  fileId: string
  fileName: string
  mimeType: string
  variant: number
  aspectRatio: AspectRatio
  creativeType: CreativeType
}

export interface UploadResult {
  success: boolean
  variant: number
  aspectRatio: AspectRatio
  creativeType: CreativeType
  driveFileId?: string
  metaHash?: string
  metaVideoId?: string
  error?: string
}

/**
 * Download a file from Google Drive as a buffer
 */
export async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const drive = getDrive()

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(response.data as ArrayBuffer)
}

/**
 * Get creative info from Google Drive for a package
 * Returns all creatives organized by variant and aspect ratio
 * OPTIMIZED: Uses caching to avoid repeated Drive API calls
 */
export async function getPackageCreatives(tcPackageId: number): Promise<DriveCreativeInfo[]> {
  // Check cache first
  const cached = getCachedCreatives(tcPackageId)
  if (cached) {
    return cached
  }

  const drive = getDrive()
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID!
  const creatives: DriveCreativeInfo[] = []

  // Find the package folder
  const packageFolderResult = await drive.files.list({
    q: `'${rootFolderId}' in parents and name = '${tcPackageId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  const packageFolder = packageFolderResult.data.files?.[0]
  if (!packageFolder) {
    console.log(`[Creative Uploader] No folder found for package ${tcPackageId}`)
    return creatives
  }

  // List variant folders (v1, v2, v3, v4, v5)
  const variantFoldersResult = await drive.files.list({
    q: `'${packageFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  const variantFolders = variantFoldersResult.data.files || []

  for (const variantFolder of variantFolders) {
    // Extract variant number from folder name (e.g., "v1" -> 1)
    const variantMatch = variantFolder.name?.match(/v(\d+)/i)
    if (!variantMatch) continue

    const variant = parseInt(variantMatch[1], 10)
    if (variant < 1 || variant > 5) continue

    // List files in variant folder
    const filesResult = await drive.files.list({
      q: `'${variantFolder.id}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    const files = filesResult.data.files || []

    for (const file of files) {
      if (!file.name || !file.id) continue

      const fileName = file.name.toLowerCase()

      // Determine aspect ratio from filename
      let aspectRatio: AspectRatio | null = null
      if (fileName.startsWith('4x5')) {
        aspectRatio = '4x5'
      } else if (fileName.startsWith('9x16')) {
        aspectRatio = '9x16'
      }

      if (!aspectRatio) continue

      // Determine creative type from extension
      const extension = fileName.substring(fileName.lastIndexOf('.'))
      let creativeType: CreativeType

      if (IMAGE_EXTENSIONS.includes(extension)) {
        creativeType = 'IMAGE'
      } else if (VIDEO_EXTENSIONS.includes(extension)) {
        creativeType = 'VIDEO'
      } else {
        continue // Skip unsupported file types
      }

      creatives.push({
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType || 'application/octet-stream',
        variant,
        aspectRatio,
        creativeType,
      })
    }
  }

  // Sort by variant and aspect ratio
  creatives.sort((a, b) => {
    if (a.variant !== b.variant) return a.variant - b.variant
    return a.aspectRatio.localeCompare(b.aspectRatio)
  })

  // Cache the results
  setCachedCreatives(tcPackageId, creatives)

  return creatives
}

/**
 * Upload a single creative from Drive to Meta
 * Uses retry with exponential backoff and file validation
 */
export async function uploadCreativeToMeta(
  creative: DriveCreativeInfo
): Promise<UploadResult> {
  try {
    console.log(`[Creative Uploader] Downloading ${creative.fileName} from Drive...`)

    // Download from Drive with retry
    const fileBuffer = await withRetry(
      () => downloadFromDrive(creative.fileId),
      { maxRetries: 3, baseDelayMs: 2000, context: `Download ${creative.fileName}` }
    )
    console.log(`[Creative Uploader] Downloaded ${fileBuffer.length} bytes`)

    // Validate file before upload
    const validation = validateCreativeFile(fileBuffer, creative.fileName, creative.creativeType)
    if (!validation.valid) {
      console.error(`[Creative Uploader] Validation failed for ${creative.fileName}: ${validation.error}`)
      return {
        success: false,
        variant: creative.variant,
        aspectRatio: creative.aspectRatio,
        creativeType: creative.creativeType,
        driveFileId: creative.fileId,
        error: validation.error,
      }
    }

    // Upload to Meta with retry
    const metaClient = getMetaAdsClient()

    if (creative.creativeType === 'IMAGE') {
      console.log(`[Creative Uploader] Uploading image to Meta...`)
      const imageHash = await withRetry(
        () => metaClient.uploadImage(fileBuffer, creative.fileName),
        { maxRetries: 3, baseDelayMs: 2000, context: `Upload image ${creative.fileName}` }
      )
      console.log(`[Creative Uploader] Uploaded image, hash: ${imageHash}`)

      return {
        success: true,
        variant: creative.variant,
        aspectRatio: creative.aspectRatio,
        creativeType: creative.creativeType,
        driveFileId: creative.fileId,
        metaHash: imageHash,
      }
    } else {
      console.log(`[Creative Uploader] Uploading video to Meta...`)
      const videoId = await withRetry(
        () => metaClient.uploadVideo(fileBuffer, creative.fileName),
        { maxRetries: 3, baseDelayMs: 3000, context: `Upload video ${creative.fileName}` }
      )
      console.log(`[Creative Uploader] Uploaded video, ID: ${videoId}`)

      return {
        success: true,
        variant: creative.variant,
        aspectRatio: creative.aspectRatio,
        creativeType: creative.creativeType,
        driveFileId: creative.fileId,
        metaVideoId: videoId,
      }
    }
  } catch (error) {
    console.error(`[Creative Uploader] Error uploading ${creative.fileName}:`, error)
    return {
      success: false,
      variant: creative.variant,
      aspectRatio: creative.aspectRatio,
      creativeType: creative.creativeType,
      driveFileId: creative.fileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Upload all creatives for a package from Drive to Meta
 * Returns results for each creative
 */
export async function uploadPackageCreativesToMeta(
  tcPackageId: number,
  variantsFilter?: number[]
): Promise<UploadResult[]> {
  console.log(`[Creative Uploader] Starting upload for package ${tcPackageId}`)

  // Get all creatives from Drive
  const creatives = await getPackageCreatives(tcPackageId)
  console.log(`[Creative Uploader] Found ${creatives.length} creatives in Drive`)

  if (creatives.length === 0) {
    return []
  }

  // Filter by variants if specified
  const filteredCreatives = variantsFilter
    ? creatives.filter((c) => variantsFilter.includes(c.variant))
    : creatives

  console.log(`[Creative Uploader] Will upload ${filteredCreatives.length} creatives`)

  // Upload each creative
  const results: UploadResult[] = []

  for (const creative of filteredCreatives) {
    const result = await uploadCreativeToMeta(creative)
    results.push(result)

    // Small delay between uploads to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const successCount = results.filter((r) => r.success).length
  console.log(`[Creative Uploader] Completed: ${successCount}/${results.length} successful`)

  return results
}

/**
 * Check if a package has creatives ready in Drive
 */
export async function hasCreativesInDrive(tcPackageId: number): Promise<{
  hasCreatives: boolean
  count: number
  variants: number[]
}> {
  const creatives = await getPackageCreatives(tcPackageId)
  const variants = Array.from(new Set(creatives.map((c) => c.variant)))

  return {
    hasCreatives: creatives.length > 0,
    count: creatives.length,
    variants,
  }
}
