import type { Db } from '@/lib/jobs/types'
import { getPackageCreatives, uploadCreativeToMeta } from './creative-uploader'

export interface UploadedCreativeRow {
  id: number
  package_id: number
  variant: number
  aspect_ratio: string
  drive_file_id: string | null
  meta_image_hash: string | null
  meta_video_id: string | null
  creative_type: string | null
  upload_status: string
}

export interface CreativeVariant {
  variant: number
  creative4x5: UploadedCreativeRow
  creative9x16: UploadedCreativeRow | null
}

/**
 * Deja en Meta todo lo que hay en la carpeta de Drive del paquete y devuelve
 * las variantes listas para un anuncio (hace falta la 4x5; la 9x16 es
 * opcional). Misma lógica que usa la pantalla de Marketing al crear anuncios:
 * resube cuando el archivo de Drive cambió o la fila no tiene id de Meta.
 */
export async function ensureCreativesUploaded(db: Db, packageId: number, tcPackageId: number, options: { adAccountId?: string; onStep?: (step: string) => void } = {}): Promise<{ variants: CreativeVariant[]; errors: string[]; uploaded: number }> {
  const errors: string[] = []
  let uploaded = 0
  const load = async () => (await db.from('meta_creatives').select('id, package_id, variant, aspect_ratio, drive_file_id, meta_image_hash, meta_video_id, creative_type, upload_status').eq('package_id', packageId).eq('upload_status', 'uploaded').order('variant')).data as UploadedCreativeRow[] | null
  let rows = (await load()) ?? []
  try {
    const driveCreatives = await getPackageCreatives(tcPackageId)
    for (const dc of driveCreatives) {
      const row = rows.find(r => r.variant === dc.variant && r.aspect_ratio === dc.aspectRatio)
      const missingMetaId = row ? (dc.creativeType === 'VIDEO' ? !row.meta_video_id : !row.meta_image_hash) : false
      if (!row || !row.drive_file_id || row.drive_file_id !== dc.fileId || missingMetaId) {
        options.onStep?.(`Subiendo V${dc.variant} ${dc.aspectRatio} a Meta`)
        const r = await uploadCreativeToMeta(dc, options.adAccountId)
        if (!r.success) { errors.push(`V${dc.variant} ${dc.aspectRatio}: ${r.error ?? 'no se pudo subir'}`); continue }
        const { error } = await db.from('meta_creatives').upsert({
          package_id: packageId, tc_package_id: tcPackageId, variant: r.variant, aspect_ratio: r.aspectRatio, drive_file_id: r.driveFileId || '',
          meta_image_hash: r.metaHash || null, meta_video_id: r.metaVideoId || null, creative_type: r.creativeType, upload_status: 'uploaded', uploaded_at: new Date().toISOString(),
        }, { onConflict: 'package_id,variant,aspect_ratio' })
        if (error) errors.push(`V${r.variant} ${r.aspectRatio}: ${error.message}`)
        else uploaded++
        await new Promise(res => setTimeout(res, 400))
      }
    }
    if (uploaded > 0) rows = (await load()) ?? rows
  } catch (err) {
    errors.push(`Drive: ${err instanceof Error ? err.message : String(err)}`)
  }
  const byVariant = new Map<number, { creative4x5?: UploadedCreativeRow; creative9x16?: UploadedCreativeRow }>()
  for (const r of rows) {
    const e = byVariant.get(r.variant) ?? {}
    if (r.aspect_ratio === '4x5') e.creative4x5 = r
    else if (r.aspect_ratio === '9x16') e.creative9x16 = r
    byVariant.set(r.variant, e)
  }
  const variants: CreativeVariant[] = [...byVariant.entries()].filter(([, e]) => e.creative4x5).map(([variant, e]) => ({ variant, creative4x5: e.creative4x5!, creative9x16: e.creative9x16 ?? null })).sort((a, b) => a.variant - b.variant)
  return { variants, errors, uploaded }
}
