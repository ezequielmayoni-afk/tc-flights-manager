/**
 * Crea (o actualiza) en GTM-WR6MCZWL el tag "SV Giftcard widget" (Custom HTML, ES5) y su trigger
 * (Page View en páginas cuyo path contiene "/giftcard"), y publica una versión.
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/gtm-giftcard.ts [--publish]
 * Sin --publish deja el tag en el Default Workspace para revisarlo en la consola.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { resolve } from 'path'
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const PUBLISH = process.argv.includes('--publish')
const TAG_NAME = 'SV Giftcard widget'
const TRIGGER_NAME = 'Page View - landing giftcard'
const HTML = `<div id="sv-giftcard"></div>
<script>
(function(){
  if (window.__svGiftcardTag) return; window.__svGiftcardTag = true;
  var s = document.createElement('script');
  s.src = 'https://hub.siviajo.com/api/giftcard/widget?v=3';
  s.async = true;
  s.setAttribute('data-api', 'https://hub.siviajo.com/api/giftcard');
  document.head.appendChild(s);
})();
</script>`
async function main() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)
  const auth = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ['https://www.googleapis.com/auth/tagmanager.edit.containers', 'https://www.googleapis.com/auth/tagmanager.edit.containerversions', 'https://www.googleapis.com/auth/tagmanager.publish'] })
  const tm = google.tagmanager({ version: 'v2', auth })
  const containers = await tm.accounts.containers.list({ parent: 'accounts/6247989446' })
  const c = containers.data.container!.find((x) => x.publicId === 'GTM-WR6MCZWL')!
  const ws = await tm.accounts.containers.workspaces.list({ parent: c.path! })
  const def = ws.data.workspace!.find((w) => w.name === 'Default Workspace')!
  // trigger
  const triggers = await tm.accounts.containers.workspaces.triggers.list({ parent: def.path! })
  let trigger = (triggers.data.trigger ?? []).find((t) => t.name === TRIGGER_NAME)
  if (!trigger) {
    const r = await tm.accounts.containers.workspaces.triggers.create({ parent: def.path!, requestBody: { name: TRIGGER_NAME, type: 'pageview', filter: [{ type: 'contains', parameter: [{ type: 'template', key: 'arg0', value: '{{Page Path}}' }, { type: 'template', key: 'arg1', value: '/giftcard' }] }] } })
    trigger = r.data; console.log('trigger creado', trigger.triggerId)
  } else console.log('trigger existente', trigger.triggerId)
  // tag
  const tags = await tm.accounts.containers.workspaces.tags.list({ parent: def.path! })
  const existing = (tags.data.tag ?? []).find((t) => t.name === TAG_NAME)
  const body = { name: TAG_NAME, type: 'html', parameter: [{ type: 'template', key: 'html', value: HTML }, { type: 'boolean', key: 'supportDocumentWrite', value: 'false' }], firingTriggerId: [trigger.triggerId!], tagFiringOption: 'oncePerEvent' }
  if (existing) { const r = await tm.accounts.containers.workspaces.tags.update({ path: existing.path!, requestBody: { ...body, fingerprint: existing.fingerprint } as never }); console.log('tag actualizado', r.data.tagId) }
  else { const r = await tm.accounts.containers.workspaces.tags.create({ parent: def.path!, requestBody: body as never }); console.log('tag creado', r.data.tagId) }
  if (!PUBLISH) { console.log('Sin --publish: queda en el workspace.'); return }
  const v = await tm.accounts.containers.workspaces.create_version({ path: def.path!, requestBody: { name: 'Giftcard widget', notes: 'Tag SV Giftcard widget + trigger /giftcard (HUB)' } })
  const cv = v.data.containerVersion
  if (v.data.compilerError || !cv?.path) { console.error('compilerError:', JSON.stringify(v.data, null, 1).slice(0, 1500)); process.exit(1) }
  console.log('versión creada', cv.containerVersionId)
  const pub = await tm.accounts.containers.versions.publish({ path: cv.path })
  console.log('publicada', pub.data.containerVersion?.containerVersionId)
}
main().catch((e) => { console.error('💥', e.message); process.exit(1) })
