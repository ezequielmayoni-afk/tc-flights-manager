/**
 * Lista TODOS los hoteles del backoffice de TC ("hotel-landing") por destino y los
 * guarda en hotel-landings.json [{code, name, destination}]. Es el universo de
 * hoteles a los que se les puede cargar SEO; después `hub/scripts/seo-hotel-sitemap.ts
 * hotels --landings=SEO_HOTEL/hotel-landings.json` revisa cuáles lo tienen y arma el sitemap.
 *
 * El login de HUBSIVIAJO pide un código OTP por mail (hu****@siviajo.com): el script se
 * queda esperando hasta 15 minutos a que exista /tmp/siviajo_otp.txt con los 6 dígitos.
 *
 *   cd SEO_HOTEL && npx tsx list-hotel-landings.ts [--dest="Cancun,Punta Cana"]
 */
import { chromium, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const USER = process.env.TC_USERNAME || 'HUBSIVIAJO'
const PASS = process.env.TC_PASSWORD!
const ADMIN_URL = 'https://www.siviajo.com/admin/hotel-landing/List.xhtml'
const OTP_FILE = '/tmp/siviajo_otp.txt'
const OUT = path.join(__dirname, 'hotel-landings.json')

/** Destinos con SEO cargado (según queue.json y la memoria del proyecto). */
const DESTINATIONS = ['Punta Cana', 'Bayahibe', 'Cancun', 'Playa del Carmen', 'Rio de Janeiro', 'Orlando', 'San Carlos de Bariloche', 'Salta', 'El Calafate']

async function waitForOtp(): Promise<string> {
  console.log(`🔑 OTP requerido: escribí los 6 dígitos en ${OTP_FILE} (espero hasta 15 min)`)
  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    if (fs.existsSync(OTP_FILE)) {
      const code = fs.readFileSync(OTP_FILE, 'utf8').replace(/\D/g, '')
      if (code.length === 6) {
        fs.unlinkSync(OTP_FILE)
        return code
      }
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('OTP no recibido a tiempo')
}

async function login(page: Page) {
  await page.goto(ADMIN_URL, { waitUntil: 'networkidle' })
  await page.locator('[id="login-form:login-content:login:Email"]').fill(USER)
  await page.locator('[id="login-form:login-content:login:j_password"]').fill(PASS)
  await page.getByRole('button', { name: 'Siguiente' }).click()
  const otpInputs = page.locator('input.otp-input')
  const landed = await Promise.race([
    page.waitForURL('**/hotel-landing/List.xhtml', { timeout: 20000 }).then(() => 'list').catch(() => null),
    otpInputs.first().waitFor({ timeout: 20000 }).then(() => 'otp').catch(() => null),
  ])
  if (landed === 'otp') {
    const code = await waitForOtp()
    const inputs = await otpInputs.all()
    if (inputs.length >= 6) for (let i = 0; i < 6; i++) await inputs[i].fill(code[i])
    else await otpInputs.first().fill(code)
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForURL('**/hotel-landing/List.xhtml', { timeout: 30000 })
  } else if (landed !== 'list') throw new Error('No se pudo loguear (ni lista ni OTP)')
  console.log('✅ Adentro')
}

async function selectDestination(page: Page, query: string): Promise<boolean> {
  try {
    const combo = page.getByRole('combobox', { name: 'Destino:*' })
    await combo.click()
    await combo.fill('')
    await combo.pressSequentially(query, { delay: 90 })
    const opt = page.locator('.ui-autocomplete-panel:visible li.ui-autocomplete-item, [role="option"]').first()
    await opt.waitFor({ timeout: 15000 })
    const label = (await opt.textContent())?.trim()
    await opt.click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Búsqueda' }).click()
    await page.waitForTimeout(2500)
    console.log(`📍 ${query} → ${label}`)
    return true
  } catch (e) {
    console.log(`⚠️  no pude seleccionar "${query}": ${(e as Error).message.slice(0, 80)}`)
    return false
  }
}

async function setPageSize50(page: Page) {
  try {
    const rpp = page.getByRole('combobox', { name: 'Filas por página' }).first()
    await rpp.selectOption('50', { timeout: 8000 })
    await page.waitForTimeout(1500)
  } catch {
    /* default */
  }
}

async function totalPages(page: Page): Promise<number> {
  const t = (await page.locator('.ui-paginator-current').first().textContent().catch(() => '')) || ''
  const m = t.match(/Page:\s*\d+\/(\d+)/)
  return m ? parseInt(m[1]) : 1
}

async function currentPage(page: Page): Promise<number> {
  const t = (await page.locator('.ui-paginator-current').first().textContent().catch(() => '')) || ''
  const m = t.match(/Page:\s*(\d+)/)
  return m ? parseInt(m[1]) : 0
}

async function rowsOnPage(page: Page): Promise<Array<{ code: string; name: string }>> {
  await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  const data = await page.$$eval('table tbody tr', trs =>
    trs.map(tr => {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim())
      return { code: tds[1] || '', name: tds[2] || '' }
    })
  )
  return data.filter(r => r.code)
}

async function goToPage(page: Page, target: number): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.evaluate(() => {
      const btn = document.querySelector('a.ui-paginator-next:not(.ui-state-disabled)') as HTMLElement | null
      btn?.click()
    })
    try {
      await page.waitForFunction(exp => {
        const el = document.querySelector('.ui-paginator-current')
        const m = el?.textContent?.match(/Page:\s*(\d+)/)
        return m ? parseInt(m[1]) === exp : false
      }, target, { timeout: 30000 })
      await page.waitForTimeout(300)
      return
    } catch {
      await page.waitForTimeout(2000)
    }
  }
  throw new Error(`No se pudo ir a la página ${target}`)
}

async function main() {
  const only = process.argv.find(a => a.startsWith('--dest='))?.slice(7).split(',').map(s => s.trim())
  const dests = only ?? DESTINATIONS
  const out: Array<{ code: string; name: string; destination: string }> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : []
  const done = new Set(out.map(o => o.destination))
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  try {
    await login(page)
    for (const dest of dests) {
      if (done.has(dest) && !only) {
        console.log(`⏭️  ${dest} ya listado (${out.filter(o => o.destination === dest).length})`)
        continue
      }
      await page.goto(ADMIN_URL, { waitUntil: 'networkidle' })
      if (!(await selectDestination(page, dest))) continue
      await setPageSize50(page)
      const total = await totalPages(page)
      const found: Array<{ code: string; name: string; destination: string }> = []
      for (let p = 1; p <= total; p++) {
        if (p > 1) await goToPage(page, p)
        else if ((await currentPage(page)) !== 1) await page.waitForTimeout(1000)
        for (const r of await rowsOnPage(page)) found.push({ ...r, destination: dest })
        if (p % 10 === 0 || p === total) process.stdout.write(`\r   ${dest}: página ${p}/${total} — ${found.length} hoteles`)
      }
      console.log()
      const rest = out.filter(o => o.destination !== dest)
      out.length = 0
      out.push(...rest, ...found)
      fs.writeFileSync(OUT, JSON.stringify(out))
      console.log(`💾 ${dest}: ${found.length} hoteles (total archivo ${out.length})`)
    }
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
