import { getMetaAdsClient } from './client'
import { ensureCreativesUploaded } from './ensure-creatives'
import { buildWaMessage, getPackageDestinationLabel } from './wa-message'
import { generateBrandCopies } from '@/lib/marketing/copy/generate'
import { adsetNameFor, familyKeyForPackage, loadFamilies, type MarketingFamily } from '@/lib/marketing/families'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { findFlightsForPackages } from '@/lib/packages/flight-match'
import { logEvent } from '@/lib/logs'
import { sendSlackMessage } from '@/lib/slack/client'
import { enqueueJob } from '@/lib/jobs/queue'
import type { Db } from '@/lib/jobs/types'

/**
 * Fase 5: de "creatividad lista" a "conjunto y anuncios en Meta, en pausa".
 * Todo lo que escribe en Meta corre dentro de un job (lane meta, flag
 * automation.meta_writes). Nada queda activo sin un clic de una persona.
 */

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

interface LaunchPackageRow {
  id: number; tc_package_id: number; title: string; status: string | null; tc_active: boolean; needs_manual_quote: boolean | null
  current_price_per_pax: number | string | null; departure_date: string | null; flight_departure_date: string | null; date_range_end: string | null
  send_to_marketing: boolean | null; marketing_status: string | null; marketing_family: string | null; marketing_expiration_date: string | null
  meta_launch_adset_id: string | null; meta_launch_campaign_id: string | null; meta_campaign_id: string | null; meta_campaign_ids: string[] | null; meta_adset_ids: string | null; meta_ad_account_id: string | null
  destination_profile_code: string | null; themes: string[] | null; themes_local: string[] | null
  package_destinations: Array<{ destination_name: string | null; sort_order: number | null }> | null
}

const SELECT = 'id, tc_package_id, title, status, tc_active, needs_manual_quote, current_price_per_pax, departure_date, flight_departure_date, date_range_end, send_to_marketing, marketing_status, marketing_family, marketing_expiration_date, meta_launch_adset_id, meta_launch_campaign_id, meta_campaign_id, meta_campaign_ids, meta_adset_ids, meta_ad_account_id, destination_profile_code, themes, themes_local, package_destinations(destination_name, sort_order)'

async function loadPackage(db: Db, packageId: number): Promise<LaunchPackageRow> {
  const { data, error } = await db.from('packages').select(SELECT).eq('id', packageId).maybeSingle()
  if (error || !data) throw new Error(`Paquete ${packageId} no encontrado${error ? `: ${error.message}` : ''}`)
  return data as unknown as LaunchPackageRow
}

export interface FamilyResolution { key: string | null; family: MarketingFamily | null; profileFamily: string | null; operatorDeparture: boolean }

/** Familia del paquete: override manual, evento deportivo, perfil del destino o grupal. */
export async function resolveFamilyForPackage(db: Db, pkg: Pick<LaunchPackageRow, 'id' | 'title' | 'themes' | 'themes_local' | 'destination_profile_code' | 'marketing_family'>): Promise<FamilyResolution> {
  let profileFamily: string | null = null
  if (pkg.destination_profile_code) {
    const { data } = await db.from('destination_profiles').select('family').eq('code', pkg.destination_profile_code).maybeSingle()
    profileFamily = (data?.family as string | null) ?? null
  }
  const cupoIds = await getCupoPackageIds(db, [pkg.id])
  const operatorDeparture = cupoIds.has(pkg.id) && ((await findFlightsForPackages(db, [pkg.id])).get(pkg.id) ?? []).length === 0
  const key = familyKeyForPackage({ title: pkg.title, themes: pkg.themes_local ?? pkg.themes, profileFamily, operatorDeparture, override: pkg.marketing_family })
  const families = await loadFamilies(db)
  return { key, family: key ? families.find(f => f.key === key) ?? null : null, profileFamily, operatorDeparture }
}

export interface LaunchResult {
  packageId: number; tcPackageId: number; familyKey: string; campaignId: string; adsetId: string; adsetName: string; adsetCreated: boolean
  adsCreated: number; adsExisting: number; copiesGenerated: number; creativesUploaded: number; warnings: string[]
}

export async function launchPackage(db: Db, packageId: number, options: { actor: string; log?: (msg: string) => Promise<void> | void }): Promise<LaunchResult> {
  const log = options.log ?? (() => {})
  const pkg = await loadPackage(db, packageId)
  const fail = async (msg: string): Promise<never> => { await db.from('packages').update({ launch_error: msg }).eq('id', packageId); throw new Error(msg) }

  if (!pkg.tc_active) return fail('El paquete está dado de baja en TC')
  if (pkg.status === 'expired' || pkg.status === 'not_visible') return fail(`El paquete está ${pkg.status === 'expired' ? 'vencido' : 'no visible'}`)
  if (pkg.needs_manual_quote) return fail('El paquete está en cotización manual: resolvé el precio antes de pautar')
  if (!pkg.current_price_per_pax || Number(pkg.current_price_per_pax) <= 0) return fail('El paquete no tiene precio')

  const resolved = await resolveFamilyForPackage(db, pkg)
  if (!resolved.key || !resolved.family) return fail(`No se pudo deducir la familia del paquete (perfil: ${resolved.profileFamily ?? 'sin perfil'}). Elegila a mano en el paquete.`)
  const family = resolved.family
  if (!family.active) return fail(`La familia "${family.name}" está desactivada`)
  if (!family.metaCampaignId || !family.templateAdsetId) return fail(`La familia "${family.name}" no tiene campaña o conjunto plantilla cargados en Marketing → Familias`)
  await log(`Familia ${family.name} → campaña ${family.metaCampaignId}`)

  // Copys: si no hay, se generan con la voz de marca.
  const { count: copiesCount } = await db.from('meta_ad_copies').select('*', { count: 'exact', head: true }).eq('package_id', packageId)
  let copiesGenerated = 0
  if (!copiesCount) {
    await log('Sin copys: generando con la voz de marca')
    const r = await generateBrandCopies(db, packageId, { actor: options.actor })
    copiesGenerated = r.saved.length
    if (copiesGenerated === 0) return fail(`No se pudo generar ningún copy: ${r.rejected.map(x => `V${x.variant} ${x.issues.join(', ')}`).join(' | ')}`)
  }
  const { data: copies } = await db.from('meta_ad_copies').select('primary_text, headline, description, variant').eq('package_id', packageId).order('variant')
  const copyVariations = (copies ?? []).map(c => ({ primary_text: String(c.primary_text), headline: String(c.headline), description: c.description ? String(c.description) : undefined }))

  // Creativos: lo que haya en Drive, subido a Meta.
  const metaClient = getMetaAdsClient(pkg.meta_ad_account_id ?? undefined)
  const creatives = await ensureCreativesUploaded(db, packageId, pkg.tc_package_id, { adAccountId: pkg.meta_ad_account_id ?? undefined, onStep: s => log(s) })
  const warnings = [...creatives.errors]
  if (creatives.variants.length === 0) return fail(`No hay creativos 4x5 en Drive para ${pkg.tc_package_id}${creatives.errors.length ? ` (${creatives.errors.join('; ')})` : ''}`)

  // Conjunto: reutiliza el que ya lanzó, o el que tenga el mismo nombre, o crea uno desde la plantilla.
  const dests = [...(pkg.package_destinations ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(d => d.destination_name ?? '').filter(Boolean)
  const adsetName = adsetNameFor({ destination: dests[0] ?? pkg.title, departureDate: pkg.flight_departure_date ?? pkg.departure_date, tcPackageId: pkg.tc_package_id })
  let adsetId = pkg.meta_launch_adset_id
  let adsetCreated = false
  if (adsetId) {
    const existing = await metaClient.getAdSetById(adsetId)
    if (!existing || existing.campaign_id !== family.metaCampaignId) { warnings.push(`El conjunto ${adsetId} ya no existe o cambió de campaña; se crea otro`); adsetId = null }
  }
  if (!adsetId) {
    const byName = await metaClient.findAdSetByName(family.metaCampaignId, adsetName)
    if (byName) { adsetId = byName.id; await log(`Conjunto existente ${adsetName} (${adsetId})`) }
    else {
      adsetId = await metaClient.createAdSetFromTemplate({ templateAdSetId: family.templateAdsetId, campaignId: family.metaCampaignId, name: adsetName, status: 'PAUSED' })
      adsetCreated = true
      await log(`Conjunto creado en pausa: ${adsetName} (${adsetId})`)
      if (family.dailyBudgetCents) {
        try { await metaClient.updateAdSetDailyBudget(adsetId, family.dailyBudgetCents) } catch (err) { warnings.push(`No se pudo fijar el presupuesto del conjunto (¿campaña CBO?): ${err instanceof Error ? err.message : String(err)}`) }
      }
    }
  }
  const finalAdsetId = adsetId as string

  // Anuncios: uno por variante de creativo, en pausa, saltando los que ya existen en ese conjunto.
  const { data: existingAds } = await db.from('meta_ads').select('variant').eq('package_id', packageId).eq('meta_adset_id', finalAdsetId)
  const existingVariants = new Set((existingAds ?? []).map(a => Number(a.variant)))
  const destino = await getPackageDestinationLabel(db, packageId)
  const waMessageTemplate = buildWaMessage(destino, pkg.tc_package_id)
  const instagramUserId = process.env.META_INSTAGRAM_USER_ID || undefined
  let adsCreated = 0
  const adsExisting = creatives.variants.filter(v => existingVariants.has(v.variant)).length
  const toCreate = creatives.variants.filter(v => !existingVariants.has(v.variant)).slice(0, Math.max(0, family.maxActiveAdsPerAdset - existingVariants.size))
  for (const v of toCreate) {
    let thumbnailUrl4x5: string | undefined
    let thumbnailUrl9x16: string | undefined
    if (v.creative4x5.meta_video_id) {
      const r = await metaClient.waitForVideoReady(v.creative4x5.meta_video_id)
      if (!r.ready) { warnings.push(`V${v.variant}: el video 4x5 no terminó de procesarse en Meta`); continue }
      thumbnailUrl4x5 = r.thumbnailUrl
    }
    if (v.creative9x16?.meta_video_id) {
      const r = await metaClient.waitForVideoReady(v.creative9x16.meta_video_id)
      if (!r.ready) { warnings.push(`V${v.variant}: el video 9x16 no terminó de procesarse; el anuncio sale sólo con 4x5`); v.creative9x16 = null }
      else thumbnailUrl9x16 = r.thumbnailUrl
    }
    const name = `${pkg.title} - ${pkg.tc_package_id} - V${v.variant}`
    const creativeId = await metaClient.createWhatsAppAdCreative({
      name, imageHash4x5: v.creative4x5.meta_image_hash ?? undefined, imageHash9x16: v.creative9x16?.meta_image_hash ?? undefined,
      videoId4x5: v.creative4x5.meta_video_id ?? undefined, videoId9x16: v.creative9x16?.meta_video_id ?? undefined, thumbnailUrl4x5, thumbnailUrl9x16,
      copies: copyVariations, waMessageTemplate, tcPackageId: pkg.tc_package_id, instagramUserId,
    })
    const adId = await metaClient.createAdFromCreative({ name, adsetId: finalAdsetId, creativeId, status: 'PAUSED' })
    const { error } = await db.from('meta_ads').upsert({
      package_id: packageId, tc_package_id: pkg.tc_package_id, variant: v.variant, meta_ad_id: adId, meta_adset_id: finalAdsetId, meta_creative_id: creativeId, ad_name: name,
      status: 'PAUSED', meta_status: 'PAUSED', creative_id: v.creative4x5.id, published_at: new Date().toISOString(), launched_by: 'auto', auto_managed: true,
    }, { onConflict: 'package_id,variant,meta_adset_id' })
    if (error) warnings.push(`V${v.variant}: anuncio ${adId} creado pero no se pudo registrar: ${error.message}`)
    adsCreated++
    await log(`Anuncio V${v.variant} creado en pausa (${adId})`)
    await new Promise(r => setTimeout(r, 400))
  }

  // Paquete: queda "launched" (todo en pausa) y con el conjunto asociado para que el resto de HUB lo vea.
  const { count: adsTotal } = await db.from('meta_ads').select('*', { count: 'exact', head: true }).eq('package_id', packageId)
  const adsetIds = new Set((pkg.meta_adset_ids ?? '').split(',').map(s => s.trim()).filter(Boolean)); adsetIds.add(finalAdsetId)
  const campaignIds = new Set(pkg.meta_campaign_ids ?? []); campaignIds.add(family.metaCampaignId)
  const expiration = pkg.marketing_expiration_date ?? (pkg.date_range_end ? new Date(new Date(`${pkg.date_range_end}T12:00:00Z`).getTime() - 15 * 86400000).toISOString().slice(0, 10) : null)
  const wasActive = pkg.marketing_status === 'active'
  await db.from('packages').update({
    meta_launch_adset_id: finalAdsetId, meta_launch_campaign_id: family.metaCampaignId, meta_campaign_id: pkg.meta_campaign_id ?? family.metaCampaignId,
    meta_adset_ids: [...adsetIds].join(','), meta_campaign_ids: [...campaignIds], marketing_family: pkg.marketing_family ?? resolved.key,
    marketing_status: wasActive ? 'active' : 'launched', launched_at: new Date().toISOString(), launch_error: null, status: 'in_marketing', send_to_marketing: true,
    ads_created_count: adsTotal ?? adsCreated, ...(expiration ? { marketing_expiration_date: expiration } : {}),
  }).eq('id', packageId)

  const result: LaunchResult = { packageId, tcPackageId: pkg.tc_package_id, familyKey: family.key, campaignId: family.metaCampaignId, adsetId: finalAdsetId, adsetName, adsetCreated, adsCreated, adsExisting, copiesGenerated, creativesUploaded: creatives.uploaded, warnings }
  await logEvent(db, { source: 'marketing', action: 'marketing.launched', message: `${pkg.tc_package_id}: ${adsCreated} anuncio(s) en pausa en ${adsetName}${adsetCreated ? ' (conjunto nuevo)' : ''}`, entityType: 'package', entityId: packageId, entityLabel: `${pkg.tc_package_id} · ${pkg.title}`, details: result as unknown as Record<string, unknown> }, null)
  await notifyLaunch(db, pkg, result)
  return result
}

async function notifyLaunch(db: Db, pkg: LaunchPackageRow, r: LaunchResult): Promise<void> {
  try {
    const { data: s } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url').eq('id', 1).maybeSingle()
    if (!s?.slack_enabled || !s.slack_webhook_url) return
    const text = `🚀 *${pkg.tc_package_id} · ${pkg.title}* listo en Meta, en pausa: ${r.adsCreated} anuncio(s) en el conjunto \`${r.adsetName}\`${r.adsetCreated ? ' (nuevo)' : ''}${r.copiesGenerated ? ` · ${r.copiesGenerated} copys generados` : ''}. Activar desde ${SYSTEM_URL}/packages/marketing${r.warnings.length ? `\n⚠️ ${r.warnings.join(' · ')}` : ''}`
    await sendSlackMessage(s.slack_webhook_url, { text })
  } catch { /* el aviso nunca frena el lanzamiento */ }
}

/** Activa el conjunto y los anuncios que HUB lanzó. Es el clic humano. */
export async function activateLaunchedPackage(db: Db, packageId: number, options: { actor: string }): Promise<{ adsetId: string; adsActivated: number }> {
  const pkg = await loadPackage(db, packageId)
  if (!pkg.meta_launch_adset_id) throw new Error('El paquete no tiene un conjunto lanzado desde HUB')
  const metaClient = getMetaAdsClient(pkg.meta_ad_account_id ?? undefined)
  await metaClient.updateAdSetStatus(pkg.meta_launch_adset_id, 'ACTIVE')
  const { data: ads } = await db.from('meta_ads').select('id, meta_ad_id').eq('package_id', packageId).eq('meta_adset_id', pkg.meta_launch_adset_id)
  let adsActivated = 0
  for (const ad of ads ?? []) {
    if (!ad.meta_ad_id) continue
    await metaClient.updateAdStatus(String(ad.meta_ad_id), 'ACTIVE')
    await db.from('meta_ads').update({ status: 'ACTIVE', meta_status: 'ACTIVE', paused_reason: null, paused_by: null, paused_at: null }).eq('id', ad.id)
    adsActivated++
    await new Promise(r => setTimeout(r, 250))
  }
  await db.from('packages').update({ marketing_status: 'active', marketing_activated_at: new Date().toISOString(), marketing_started_at: new Date().toISOString() }).eq('id', packageId).is('marketing_started_at', null)
  await db.from('packages').update({ marketing_status: 'active', marketing_activated_at: new Date().toISOString() }).eq('id', packageId)
  await logEvent(db, { source: 'marketing', action: 'marketing.activated', message: `${pkg.tc_package_id}: conjunto ${pkg.meta_launch_adset_id} y ${adsActivated} anuncio(s) activados por ${options.actor}`, entityType: 'package', entityId: packageId, entityLabel: `${pkg.tc_package_id} · ${pkg.title}`, details: { adsetId: pkg.meta_launch_adset_id, adsActivated } }, null)
  return { adsetId: pkg.meta_launch_adset_id, adsActivated }
}

/** Si la familia tiene auto_launch, encola el lanzamiento (siempre en pausa). Se llama al completarse diseño. */
export async function maybeEnqueueAutoLaunch(db: Db, packageId: number, reason: string): Promise<{ enqueued: boolean; why: string }> {
  try {
    const pkg = await loadPackage(db, packageId)
    if (pkg.marketing_status === 'active' || pkg.marketing_status === 'launched') return { enqueued: false, why: `ya está ${pkg.marketing_status}` }
    const { family } = await resolveFamilyForPackage(db, pkg)
    if (!family) return { enqueued: false, why: 'sin familia' }
    if (!family.autoLaunch) return { enqueued: false, why: `la familia ${family.key} no tiene auto_launch` }
    const job = await enqueueJob(db, { kind: 'marketing.launch', payload: { packageId, trigger: reason }, dedupeKey: `marketing.launch:${packageId}`, entityType: 'package', entityId: packageId, createdBy: 'auto' })
    return { enqueued: !job.deduped, why: job.deduped ? 'ya había un lanzamiento en cola' : `job ${job.id}` }
  } catch (err) {
    return { enqueued: false, why: err instanceof Error ? err.message : String(err) }
  }
}
