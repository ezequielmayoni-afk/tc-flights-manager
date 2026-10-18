/**
 * Publica en el contenedor web de siviajo.com (GTM-WR6MCZWL) la etiqueta que
 * manda cada búsqueda de vuelos a HUB (`POST /api/vuelos-baratos/site-search`
 * de vuelos.siviajo.com): la ruta, las fechas, los pasajeros y el precio por
 * persona de cada tarjeta que la web empuja al dataLayer en `view_item_list`.
 *
 *   npx tsx scripts/gtm-siviajo-site-search.ts --no-publish   # crea la versión y la deja sin publicar
 *   npx tsx scripts/gtm-siviajo-site-search.ts                # crea la versión y la publica
 *
 * Trabaja en un workspace propio ("HUB - búsquedas de vuelos") para no
 * arrastrar cambios sin publicar de otros workspaces: la versión que crea es
 * la última publicada + esta etiqueta, su disparador y su variable. Es
 * idempotente: si el workspace o las entidades ya existen, las actualiza.
 *
 * Auth: la service account de GOOGLE_DRIVE_CREDENTIALS (publish en el contenedor).
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
const CONTAINER_ID = '194489644' // GTM-WR6MCZWL (siviajo.com)
const WORKSPACE_NAME = 'HUB - búsquedas de vuelos'
const ENDPOINT = 'https://vuelos.siviajo.com/api/vuelos-baratos/site-search'
const PUBLISH = !process.argv.includes('--no-publish')
const GAP_MS = 2200
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Param = gtm.Schema$Parameter
const tpl = (key: string, value: string): Param => ({ type: 'template', key, value })
const bool = (key: string, value: boolean): Param => ({ type: 'boolean', key, value: String(value) })

/**
 * El script que corre en la página de resultados. Busca el último
 * `view_item_list` y el último `searchData` del dataLayer, recorta las
 * tarjetas y manda un beacon (texto plano: sin preflight, sin esperar
 * respuesta). Nada de datos de personas: ruta, fechas, pasajeros y precios.
 */
const HTML = `<script>
(function(){try{
  var dl=window.dataLayer||[],ev=null,sd=null;
  for(var i=dl.length-1;i>=0;i--){var e=dl[i];if(!e)continue;if(!ev&&e.event==='view_item_list')ev=e;if(!sd&&e.searchData)sd=e.searchData;if(ev&&sd)break;}
  if(!ev||!ev.ecommerce||!ev.ecommerce.items||!ev.page||ev.page.section!=='ONLY_FLIGHT')return;
  var items=ev.ecommerce.items.slice(0,40).map(function(i){return{id:i.item_id,price:i.price,brand:i.item_brand,variant:i.item_variant,start:i.start_date,end:i.end_date}});
  var s=sd||ev.search||{};
  var body=JSON.stringify({v:1,section:ev.page.section,subsection:ev.page.subsection,search:{departureCode:s.departureCode,departureName:s.departureName,destinationCode:s.destinationCode,destinationName:s.destinationName,startDate:s.startDate,endDate:s.endDate,adults:s.adults,children:s.children,infants:s.infants},itinerary:(ev.search&&ev.search.itinerary)||null,items:items,url:location.pathname,ts:Date.now()});
  var u='${ENDPOINT}';
  if(navigator.sendBeacon){navigator.sendBeacon(u,body);}else{fetch(u,{method:'POST',body:body,keepalive:true,mode:'no-cors'}).catch(function(){});}
}catch(e){}})();
</script>`

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
  const containerPath = `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`

  // 1. Workspace propio
  const workspaces = (await tm.accounts.containers.workspaces.list({ parent: containerPath })).data.workspace || []
  let ws = workspaces.find(w => w.name === WORKSPACE_NAME)
  if (!ws) {
    await sleep(GAP_MS)
    ws = (await tm.accounts.containers.workspaces.create({ parent: containerPath, requestBody: { name: WORKSPACE_NAME, description: 'Beacon de búsquedas de vuelos hacia vuelos.siviajo.com (HUB). scripts/gtm-siviajo-site-search.ts' } })).data
    console.log(`🧰 workspace creado ${ws.workspaceId}`)
  } else {
    console.log(`🧰 workspace existente ${ws.workspaceId}`)
  }
  const wsPath = ws.path!

  // 2. Variable: sección de la página (page.section del push view_item_list)
  const vars = (await tm.accounts.containers.workspaces.variables.list({ parent: wsPath })).data.variable || []
  const varBody: gtm.Schema$Variable = {
    name: 'dl - page.section',
    type: 'v',
    parameter: [tpl('name', 'page.section'), { type: 'integer', key: 'dataLayerVersion', value: '2' }, bool('setDefaultValue', false)],
  }
  const foundVar = vars.find(v => v.name === varBody.name)
  await sleep(GAP_MS)
  if (foundVar) await tm.accounts.containers.workspaces.variables.update({ path: foundVar.path!, fingerprint: foundVar.fingerprint, requestBody: varBody })
  else await tm.accounts.containers.workspaces.variables.create({ parent: wsPath, requestBody: varBody })

  // 3. Disparador: view_item_list sólo en solo vuelo
  const triggers = (await tm.accounts.containers.workspaces.triggers.list({ parent: wsPath })).data.trigger || []
  const trgBody: gtm.Schema$Trigger = {
    name: 'CE - view_item_list / solo vuelo (HUB)',
    type: 'customEvent',
    customEventFilter: [{ type: 'equals', parameter: [tpl('arg0', '{{_event}}'), tpl('arg1', 'view_item_list')] }],
    filter: [{ type: 'equals', parameter: [tpl('arg0', '{{dl - page.section}}'), tpl('arg1', 'ONLY_FLIGHT')] }],
  }
  const foundTrg = triggers.find(t => t.name === trgBody.name)
  await sleep(GAP_MS)
  const trg = foundTrg
    ? (await tm.accounts.containers.workspaces.triggers.update({ path: foundTrg.path!, fingerprint: foundTrg.fingerprint, requestBody: trgBody })).data
    : (await tm.accounts.containers.workspaces.triggers.create({ parent: wsPath, requestBody: trgBody })).data

  // 4. Etiqueta HTML
  const tags = (await tm.accounts.containers.workspaces.tags.list({ parent: wsPath })).data.tag || []
  const tagBody: gtm.Schema$Tag = {
    name: 'HUB - búsqueda de vuelos → vuelos.siviajo.com',
    type: 'html',
    firingTriggerId: [trg.triggerId!],
    tagFiringOption: 'oncePerEvent',
    parameter: [tpl('html', HTML), bool('supportDocumentWrite', false)],
    notes: 'Manda cada búsqueda de solo vuelo (ruta, fechas, pax, precios por persona) a HUB. Sin datos de personas.',
  }
  const foundTag = tags.find(t => t.name === tagBody.name)
  await sleep(GAP_MS)
  if (foundTag) await tm.accounts.containers.workspaces.tags.update({ path: foundTag.path!, fingerprint: foundTag.fingerprint, requestBody: tagBody })
  else await tm.accounts.containers.workspaces.tags.create({ parent: wsPath, requestBody: tagBody })
  console.log('🏷️  etiqueta, disparador y variable listos')

  // 5. Compilar sin publicar
  await sleep(GAP_MS)
  const preview = await tm.accounts.containers.workspaces.quick_preview({ path: wsPath })
  if (preview.data.compilerError) {
    console.error('💥 compilerError en quick_preview:', JSON.stringify(preview.data, null, 2).slice(0, 3000))
    process.exit(1)
  }
  console.log('✅ compila')

  // 6. Versión + publicación
  await sleep(GAP_MS)
  const version = await tm.accounts.containers.workspaces.create_version({
    path: wsPath,
    requestBody: { name: `HUB búsquedas de vuelos ${new Date().toISOString().slice(0, 16)}`, notes: 'Beacon de view_item_list (solo vuelo) a vuelos.siviajo.com. scripts/gtm-siviajo-site-search.ts' },
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
}

main().catch(e => {
  console.error('💥', e?.response?.data ? JSON.stringify(e.response.data).slice(0, 2000) : e?.message ?? e)
  process.exit(1)
})
