/**
 * Crea (o actualiza) el contenedor de Google Tag Manager de vuelos.siviajo.com
 * y lo publica. Idempotente: busca cada entidad por nombre y la crea o la
 * actualiza, así se puede volver a correr cuando cambie el diseño de eventos.
 *
 *   npx tsx scripts/gtm-vuelos-setup.ts            # crea/actualiza y publica
 *   npx tsx scripts/gtm-vuelos-setup.ts --no-publish
 *
 * Qué arma:
 *   - GA4 (misma propiedad que siviajo.com) con page_view automático y un tag
 *     por evento de negocio: view_destination, search_submit, select_flight;
 *     más uno genérico para las interacciones (select_month, filter_change,
 *     change_origin).
 *   - Meta Pixel (plantilla oficial de Facebook, copiada del contenedor de
 *     siviajo.com) sobre el dataset "00 - WABA General Events": PageView,
 *     ViewContent, Search y el custom SelectFlight, todos con `eventID` =
 *     `event_id` del dataLayer para que Meta deduplique con la Conversions API
 *     que manda HUB desde `/api/vuelos-baratos/track`.
 *
 * Auth: la service account de GOOGLE_DRIVE_CREDENTIALS (admin de la cuenta GTM).
 */
import { google, type tagmanager_v2 as gtm } from 'googleapis'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const ACCOUNT_ID = '6247989446'
const SOURCE_CONTAINER_ID = '194489644' // GTM-WR6MCZWL (siviajo.com), de donde se copia la plantilla Meta Pixel
const SOURCE_META_TEMPLATE_ID = '283'
const CONTAINER_NAME = 'vuelos.siviajo.com'
const GA4_ID = 'G-27Y5RTNZWF'
const META_DATASET_ID = '1310175447121594'
const PUBLISH = !process.argv.includes('--no-publish')
/**
 * La API de Tag Manager admite 30 llamadas por minuto por usuario: cada
 * escritura espera un poco y, si igual llega un 429, gaxios reintenta con
 * espera exponencial (20 s, 40 s, 80 s).
 */
const GAP_MS = 2200
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Param = gtm.Schema$Parameter
const tpl = (key: string, value: string): Param => ({ type: 'template', key, value })
const bool = (key: string, value: boolean): Param => ({ type: 'boolean', key, value: String(value) })
const table = (key: string, rows: Array<[string, string]>, cols: [string, string] = ['parameter', 'parameterValue']): Param => ({
  type: 'list',
  key,
  list: rows.map(([a, b]) => ({ type: 'map', map: [tpl(cols[0], a), tpl(cols[1], b)] })),
})

/** Variables de dataLayer: nombre en GTM → clave en el push. */
const DL_VARS: Array<[string, string]> = [
  ['dl - event_id', 'event_id'],
  ['dl - slug', 'slug'],
  ['dl - origin', 'origin'],
  ['dl - destination', 'destination'],
  ['dl - destination_name', 'destination_name'],
  ['dl - depart', 'depart'],
  ['dl - return', 'return'],
  ['dl - nights', 'nights'],
  ['dl - price_pp', 'price_pp'],
  ['dl - min_price', 'min_price'],
  ['dl - airline', 'airline'],
  ['dl - month', 'month'],
  ['dl - adults', 'adults'],
  ['dl - children', 'children'],
  ['dl - changed', 'changed'],
]

/** Objetos de Meta armados en JS: content_ids tiene que ser array y el template no lo arma solo. */
const META_JS_VARS: Array<[string, string]> = [
  [
    'js - meta ViewContent',
    `function() {
  var o = {{dl - origin}}, d = {{dl - destination}}, v = {{dl - min_price}};
  var data = { content_type: 'flight_route', content_ids: [o + '-' + d], content_name: {{dl - destination_name}} || d, currency: 'USD', origin: o, destination: d };
  if (typeof v === 'number') data.value = v;
  return data;
}`,
  ],
  [
    'js - meta Search',
    `function() {
  var o = {{dl - origin}}, d = {{dl - destination}};
  return { content_type: 'flight_route', content_ids: [o + '-' + d], search_string: o + '-' + d + ' ' + {{dl - depart}} + '/' + {{dl - return}}, origin: o, destination: d, depart: {{dl - depart}}, return: {{dl - return}}, adults: {{dl - adults}}, children: {{dl - children}} };
}`,
  ],
  [
    'js - meta SelectFlight',
    `function() {
  var o = {{dl - origin}}, d = {{dl - destination}}, p = {{dl - price_pp}};
  return { content_type: 'flight_route', content_ids: [o + '-' + d], contents: [{ id: o + '-' + d, quantity: 1, item_price: p }], currency: 'USD', value: p, origin: o, destination: d, depart: {{dl - depart}}, return: {{dl - return}}, nights: {{dl - nights}}, airline: {{dl - airline}}, month: {{dl - month}} };
}`,
  ],
]

async function main() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
      'https://www.googleapis.com/auth/tagmanager.publish',
    ],
  })
  const tm = google.tagmanager({
    version: 'v2',
    auth,
    retry: true,
    retryConfig: { retry: 4, retryDelay: 20000, httpMethodsToRetry: ['GET', 'POST', 'PUT', 'DELETE'], statusCodesToRetry: [[429, 429], [500, 599]] },
  })
  const accountPath = `accounts/${ACCOUNT_ID}`

  // 1. Contenedor
  const containers = await tm.accounts.containers.list({ parent: accountPath })
  let container = (containers.data.container || []).find(c => c.name === CONTAINER_NAME)
  if (!container) {
    container = (
      await tm.accounts.containers.create({
        parent: accountPath,
        requestBody: { name: CONTAINER_NAME, usageContext: ['web'], domainName: ['vuelos.siviajo.com'], notes: 'Landing vuelos baratos (HUB). Creado por scripts/gtm-vuelos-setup.ts' },
      })
    ).data
    console.log(`🆕 contenedor creado ${container.publicId} (${container.containerId})`)
  } else {
    console.log(`📦 contenedor existente ${container.publicId} (${container.containerId})`)
  }
  const containerPath = container.path!

  // 2. Workspace por defecto
  const workspaces = await tm.accounts.containers.workspaces.list({ parent: containerPath })
  const ws = (workspaces.data.workspace || [])[0]
  if (!ws) throw new Error('el contenedor no tiene workspace')
  const wsPath = ws.path!
  console.log(`🧰 workspace ${ws.name} (${ws.workspaceId})`)

  // 3. Plantilla Meta Pixel (copiada del contenedor de siviajo.com)
  const existingTemplates = (await tm.accounts.containers.workspaces.templates.list({ parent: wsPath })).data.template || []
  let metaTemplate = existingTemplates.find(t => t.name === 'Meta Pixel')
  if (!metaTemplate) {
    const sourceLive = await tm.accounts.containers.versions.live({ parent: `${accountPath}/containers/${SOURCE_CONTAINER_ID}` })
    const source = (sourceLive.data.customTemplate || []).find(t => t.templateId === SOURCE_META_TEMPLATE_ID)
    if (!source?.templateData) throw new Error('no encontré la plantilla Meta Pixel en el contenedor de siviajo.com')
    try {
      metaTemplate = (
        await tm.accounts.containers.workspaces.templates.create({
          parent: wsPath,
          requestBody: { name: 'Meta Pixel', templateData: source.templateData, galleryReference: source.galleryReference },
        })
      ).data
    } catch (err) {
      console.log('   (la referencia a la galería no se aceptó, la creo sin ella)', err instanceof Error ? err.message : err)
      metaTemplate = (
        await tm.accounts.containers.workspaces.templates.create({
          parent: wsPath,
          requestBody: { name: 'Meta Pixel', templateData: source.templateData },
        })
      ).data
    }
    console.log(`🧩 plantilla Meta Pixel creada (${metaTemplate.templateId})`)
  }
  // Una plantilla importada de la galería se referencia por su ID público
  // (`cvt_5RM3Q`, como en el contenedor de siviajo.com); una plantilla suelta,
  // por contenedor + ID.
  const galleryId = metaTemplate.galleryReference?.galleryTemplateId
  const META_TAG_TYPE = galleryId ? `cvt_${galleryId}` : `cvt_${container.containerId}_${metaTemplate.templateId}`

  // 4. Variables integradas
  try {
    await tm.accounts.containers.workspaces.built_in_variables.create({
      parent: wsPath,
      type: ['event', 'pageUrl', 'pagePath', 'pageHostname', 'referrer', 'clickUrl', 'clickText'],
    })
  } catch (err) {
    console.log('   built-in variables:', err instanceof Error ? err.message : err)
  }

  // Helpers de upsert por nombre
  const existingVars = (await tm.accounts.containers.workspaces.variables.list({ parent: wsPath })).data.variable || []
  async function upsertVariable(body: gtm.Schema$Variable) {
    const found = existingVars.find(v => v.name === body.name)
    await sleep(GAP_MS)
    if (found) {
      await tm.accounts.containers.workspaces.variables.update({ path: found.path!, fingerprint: found.fingerprint, requestBody: body })
      return found
    }
    const created = (await tm.accounts.containers.workspaces.variables.create({ parent: wsPath, requestBody: body })).data
    existingVars.push(created)
    return created
  }
  const existingTriggers = (await tm.accounts.containers.workspaces.triggers.list({ parent: wsPath })).data.trigger || []
  async function upsertTrigger(body: gtm.Schema$Trigger): Promise<string> {
    const found = existingTriggers.find(t => t.name === body.name)
    await sleep(GAP_MS)
    if (found) {
      await tm.accounts.containers.workspaces.triggers.update({ path: found.path!, fingerprint: found.fingerprint, requestBody: body })
      return found.triggerId!
    }
    const created = (await tm.accounts.containers.workspaces.triggers.create({ parent: wsPath, requestBody: body })).data
    existingTriggers.push(created)
    return created.triggerId!
  }
  const existingTags = (await tm.accounts.containers.workspaces.tags.list({ parent: wsPath })).data.tag || []
  async function upsertTag(body: gtm.Schema$Tag) {
    const found = existingTags.find(t => t.name === body.name)
    await sleep(GAP_MS)
    if (found) {
      await tm.accounts.containers.workspaces.tags.update({ path: found.path!, fingerprint: found.fingerprint, requestBody: body })
      return found
    }
    const created = (await tm.accounts.containers.workspaces.tags.create({ parent: wsPath, requestBody: body })).data
    existingTags.push(created)
    return created
  }

  // 5. Variables
  await upsertVariable({ name: 'const - GA4 ID', type: 'c', parameter: [tpl('value', GA4_ID)] })
  await upsertVariable({ name: 'const - Meta Dataset', type: 'c', parameter: [tpl('value', META_DATASET_ID)] })
  for (const [name, key] of DL_VARS) {
    await upsertVariable({ name, type: 'v', parameter: [tpl('name', key), { type: 'integer', key: 'dataLayerVersion', value: '2' }, bool('setDefaultValue', false)] })
  }
  for (const [name, javascript] of META_JS_VARS) {
    await upsertVariable({ name, type: 'jsm', parameter: [tpl('javascript', javascript)] })
  }
  console.log('🔡 variables listas')

  // 6. Triggers
  const eventEquals = (event: string): gtm.Schema$Condition => ({
    type: 'equals',
    parameter: [tpl('arg0', '{{_event}}'), tpl('arg1', event)],
  })
  const trgInit = await upsertTrigger({ name: 'Initialization - All Pages', type: 'init' })
  const trgAllPages = await upsertTrigger({ name: 'All Pages', type: 'pageview' })
  const trgViewDestination = await upsertTrigger({ name: 'CE - view_destination', type: 'customEvent', customEventFilter: [eventEquals('view_destination')] })
  const trgSearchSubmit = await upsertTrigger({ name: 'CE - search_submit', type: 'customEvent', customEventFilter: [eventEquals('search_submit')] })
  const trgSelectFlight = await upsertTrigger({ name: 'CE - select_flight', type: 'customEvent', customEventFilter: [eventEquals('select_flight')] })
  const trgInteractions = await upsertTrigger({
    name: 'CE - interacciones (select_month, filter_change, change_origin)',
    type: 'customEvent',
    customEventFilter: [{ type: 'matchRegex', parameter: [tpl('arg0', '{{_event}}'), tpl('arg1', '^(select_month|filter_change|change_origin)$')] }],
  })
  console.log('⚡ triggers listos')

  // 7. Tags
  const ga4Event = (name: string, eventName: string, params: Array<[string, string]>, trigger: string): gtm.Schema$Tag => ({
    name,
    type: 'gaawe',
    firingTriggerId: [trigger],
    tagFiringOption: 'oncePerEvent',
    parameter: [tpl('measurementIdOverride', '{{const - GA4 ID}}'), tpl('eventName', eventName), table('eventSettingsTable', params)],
  })
  const metaTag = (name: string, event: { standard?: string; custom?: string }, dataVar: string | null, trigger: string): gtm.Schema$Tag => ({
    name,
    type: META_TAG_TYPE,
    firingTriggerId: [trigger],
    tagFiringOption: 'oncePerEvent',
    parameter: [
      tpl('pixelId', '{{const - Meta Dataset}}'),
      tpl('eventName', event.standard ? 'standard' : 'custom'),
      ...(event.standard ? [tpl('standardEventName', event.standard)] : [tpl('customEventName', event.custom!)]),
      ...(dataVar ? [tpl('objectPropertiesFromVariable', `{{${dataVar}}}`), tpl('eventId', '{{dl - event_id}}')] : []),
      bool('enhancedEcommerce', false),
      bool('useGA4Ecommerce', false),
      bool('advancedMatching', false),
      tpl('consent', 'true'),
    ],
  })

  await upsertTag({
    name: 'GA4 - Config',
    type: 'googtag',
    firingTriggerId: [trgInit],
    tagFiringOption: 'oncePerEvent',
    parameter: [tpl('tagId', '{{const - GA4 ID}}'), table('configSettingsTable', [['send_page_view', 'true']])],
  })
  await upsertTag(
    ga4Event(
      'GA4 - view_destination',
      'view_destination',
      [
        ['slug', '{{dl - slug}}'],
        ['origin', '{{dl - origin}}'],
        ['destination', '{{dl - destination}}'],
        ['destination_name', '{{dl - destination_name}}'],
        ['min_price', '{{dl - min_price}}'],
        ['currency', 'USD'],
        ['event_id', '{{dl - event_id}}'],
      ],
      trgViewDestination,
    ),
  )
  await upsertTag(
    ga4Event(
      'GA4 - search_submit',
      'search_submit',
      [
        ['origin', '{{dl - origin}}'],
        ['destination', '{{dl - destination}}'],
        ['depart', '{{dl - depart}}'],
        ['return', '{{dl - return}}'],
        ['adults', '{{dl - adults}}'],
        ['children', '{{dl - children}}'],
        ['search_term', '{{dl - origin}}-{{dl - destination}}'],
        ['event_id', '{{dl - event_id}}'],
      ],
      trgSearchSubmit,
    ),
  )
  await upsertTag(
    ga4Event(
      'GA4 - select_flight',
      'select_flight',
      [
        ['origin', '{{dl - origin}}'],
        ['destination', '{{dl - destination}}'],
        ['depart', '{{dl - depart}}'],
        ['return', '{{dl - return}}'],
        ['nights', '{{dl - nights}}'],
        ['airline', '{{dl - airline}}'],
        ['month', '{{dl - month}}'],
        ['value', '{{dl - price_pp}}'],
        ['currency', 'USD'],
        ['event_id', '{{dl - event_id}}'],
      ],
      trgSelectFlight,
    ),
  )
  await upsertTag(
    ga4Event(
      'GA4 - interacciones',
      '{{Event}}',
      [
        ['slug', '{{dl - slug}}'],
        ['origin', '{{dl - origin}}'],
        ['month', '{{dl - month}}'],
        ['changed', '{{dl - changed}}'],
        ['event_id', '{{dl - event_id}}'],
      ],
      trgInteractions,
    ),
  )
  await upsertTag(metaTag('Meta - PageView', { standard: 'PageView' }, null, trgAllPages))
  await upsertTag(metaTag('Meta - ViewContent', { standard: 'ViewContent' }, 'js - meta ViewContent', trgViewDestination))
  await upsertTag(metaTag('Meta - Search', { standard: 'Search' }, 'js - meta Search', trgSearchSubmit))
  await upsertTag(metaTag('Meta - SelectFlight', { custom: 'SelectFlight' }, 'js - meta SelectFlight', trgSelectFlight))
  console.log('🏷️  tags listos')

  // 8. Versión + publicación
  await sleep(GAP_MS)
  const version = await tm.accounts.containers.workspaces.create_version({
    path: wsPath,
    requestBody: { name: `vuelos ${new Date().toISOString().slice(0, 16)}`, notes: 'GA4 + Meta Pixel (scripts/gtm-vuelos-setup.ts)' },
  })
  if (version.data.compilerError) {
    console.error('💥 compilerError al crear la versión:', JSON.stringify(version.data, null, 2).slice(0, 3000))
    process.exit(1)
  }
  const cv = version.data.containerVersion!
  console.log(`📄 versión ${cv.containerVersionId} creada`)
  if (PUBLISH) {
    await sleep(GAP_MS)
    const published = await tm.accounts.containers.versions.publish({ path: cv.path!, fingerprint: cv.fingerprint })
    if (published.data.compilerError) {
      console.error('💥 compilerError al publicar:', JSON.stringify(published.data, null, 2).slice(0, 3000))
      process.exit(1)
    }
    console.log(`🚀 publicada la versión ${published.data.containerVersion?.containerVersionId}`)
  }
  console.log(`\n✅ ${container.publicId} → poné GTM_ID=${container.publicId} en /opt/hub/.env.local`)
}

main().catch(e => {
  console.error('💥', e?.response?.data ? JSON.stringify(e.response.data).slice(0, 2000) : e?.message ?? e)
  process.exit(1)
})
