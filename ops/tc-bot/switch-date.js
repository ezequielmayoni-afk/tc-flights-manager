#!/usr/bin/env node
/**
 * Cupo agotado → fecha alternativa con aéreo de sistema, aplicado en siviajo.com.
 *
 * Corre en el VPS dentro de /root/tc-requote-bot (usa su Playwright y su .env:
 * TC_USERNAME/TC_PASSWORD para el backoffice, SIVIAJO_USERNAME/PASSWORD para
 * el sitio como agente). HUB lo lanza desde el job package.apply_alternative.
 *
 *   node switch-date.js --tc-id=52574571 --slug=combinado-... --date=2027-02-07 \
 *        --airline=Arajet --flight-out=DM6207 --flight-back=DM6260 \
 *        --expected-price=2049 --tolerance=8 --mode=plan|prepare|apply
 *
 *   plan     no escribe nada: sólo valida que puede entrar y muestra el paquete.
 *   prepare  abre la fecha en el backoffice, rehace la búsqueda con la fecha
 *            nueva, elige el aéreo, muestra el resumen y NO guarda; después
 *            vuelve a dejar las fechas del backoffice como estaban.
 *   apply    lo mismo y toca "Actualizar y guardar idea".
 *
 * Salida: una línea JSON al final (RESULT {...}) con lo que pasó.
 */
const path = require('path')
const fs = require('fs')
try { require('dotenv').config({ path: path.join(__dirname, '.env') }) } catch {}
const { chromium } = require('playwright')

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true] }))
const MODE = args.mode || 'plan'
const TC_ID = String(args['tc-id'] || '')
const SLUG = String(args.slug || '')
const DATE = String(args.date || '')
const FLIGHT_OUT = String(args['flight-out'] || '').replace(/\s+/g, '').toUpperCase()
const FLIGHT_BACK = String(args['flight-back'] || '').replace(/\s+/g, '').toUpperCase()
const AIRLINE = String(args.airline || '')
const EXPECTED = Number(args['expected-price'] || 0)
const TOLERANCE = Number(args.tolerance || 8)
const PREFER_DIRECT = args['prefer-direct'] !== 'false'
const SHOTS = String(args.shots || '/tmp/switch-date')
if (!TC_ID || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error('faltan --tc-id y --date=YYYY-MM-DD'); process.exit(2) }
fs.mkdirSync(SHOTS, { recursive: true })

const t0 = Date.now(); const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const log = (...a) => console.log(ts(), ...a)
const clean = s => (s || '').replace(/\s+/g, ' ').trim()
const dmy = d => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }
const notes = []
const result = { ok: false, mode: MODE, tcId: TC_ID, date: DATE, backoffice: null, search: null, flights: null, saved: false, notes }
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }).catch(() => {})

async function loginBackoffice(page) {
  await page.goto('https://www.siviajo.com/admin/holidays/List.xhtml', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.locator('[id*="login-content:login:Email"]').first().fill(process.env.TC_USERNAME)
  await page.locator('[id*="login-content:login:j_password"]').first().fill(process.env.TC_PASSWORD)
  await page.getByRole('button', { name: 'Siguiente' }).first().click()
  await page.waitForTimeout(5000)
  const body = clean(await page.evaluate(() => document.body.innerText))
  if (/Verifica tu identidad/.test(body) || !/Paquetes vacacionales/.test(await page.title())) throw new Error('backoffice: login no confirmado (¿verificación por email?)')
  log('backoffice: logueado')
}

async function openPackageEditor(page) {
  const headers = await page.evaluate(() => [...document.querySelectorAll('th')].map((th, i) => ({ i, text: th.innerText.trim(), hasInput: !!th.querySelector('input') })))
  const idx = headers.find(h => /^Id$/i.test(h.text) && h.hasInput)
  if (!idx) throw new Error('backoffice: no encuentro la columna Id')
  const input = page.locator('th').nth(idx.i).locator('input').first()
  await input.click(); await page.keyboard.type(TC_ID, { delay: 40 }); await page.waitForTimeout(800); await page.keyboard.press('Enter')
  // La tabla filtrada deja la fila del paquete primera (las demás "filas" son el paginador).
  await page.waitForFunction(id => { const rows = [...document.querySelectorAll('tbody tr')].filter(tr => tr.innerText.trim()); return rows.length > 0 && rows[0].innerText.includes(id) }, TC_ID, { timeout: 30000 })
  await page.waitForTimeout(1200)
  const first = await page.evaluate(() => (document.querySelector('tbody tr')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120))
  if (!first.includes(TC_ID)) throw new Error(`backoffice: la primera fila no es ${TC_ID}: ${first}`)
  await page.locator('span.ui-button-text:has-text("Opciones")').first().click(); await page.waitForTimeout(1500)
  const clicked = await page.evaluate(() => { for (const menu of document.querySelectorAll('.ui-menu')) { const st = getComputedStyle(menu); if (st.display !== 'none' && st.visibility !== 'hidden') { const r = menu.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { const ed = menu.querySelector('a[title="Editar"]'); if (ed) { ed.click(); return true } } } } return false })
  if (!clicked) throw new Error('backoffice: no encuentro Editar en el menú Opciones')
  await page.waitForTimeout(4000); await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('[id="HolidayPackageEditForm:tabView"] > ul li').filter({ hasText: 'Fechas' }).first().click(); await page.waitForTimeout(2000)
}

const WEEKDAY_INPUT = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

async function readDates(page) {
  const start = await page.locator('[id="HolidayPackageEditForm:tabView:startDate_input"]').inputValue()
  const end = await page.locator('[id="HolidayPackageEditForm:tabView:endDate_input"]').inputValue()
  const days = {}
  for (const d of WEEKDAY_INPUT) days[d] = await page.evaluate(id => { const i = document.getElementById(id); return i ? i.checked : null }, `HolidayPackageEditForm:tabView:${d}_input`)
  return { start, end, days }
}

/** Escribe Desde/Hasta y tilda el día de la semana de la fecha nueva; guarda el modal. */
async function setDatesAndSave(page, start, end, ensureWeekday) {
  for (const [id, value] of [['startDate_input', start], ['endDate_input', end]]) {
    const loc = page.locator(`[id="HolidayPackageEditForm:tabView:${id}"]`)
    await loc.click(); await loc.press('Control+A'); await loc.fill(value); await loc.press('Tab'); await page.waitForTimeout(600)
  }
  if (ensureWeekday !== null) {
    const name = WEEKDAY_INPUT[ensureWeekday]
    const checked = await page.evaluate(id => document.getElementById(id)?.checked, `HolidayPackageEditForm:tabView:${name}_input`)
    if (!checked) {
      // El checkbox real está oculto; se clickea la caja de PrimeFaces que lo envuelve.
      const box = page.locator(`[id="HolidayPackageEditForm:tabView:${name}"] .ui-chkbox-box`).first()
      if (await box.count()) await box.click(); else await page.evaluate(id => document.getElementById(id)?.click(), `HolidayPackageEditForm:tabView:${name}_input`)
      await page.waitForTimeout(500)
      notes.push(`backoffice: se tildó ${name} como día de operación`)
    }
  }
  await shot(page, 'bo-fechas-antes-de-guardar')
  await page.locator('[id="HolidayPackageEditForm:saveHolidayPackage"]').click()
  await page.waitForTimeout(5000); await page.waitForLoadState('networkidle').catch(() => {})
  const msgs = await page.evaluate(() => [...document.querySelectorAll('.ui-messages-error, .ui-message-error, .ui-growl-message')].map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))
  const modalOpen = await page.locator('[id="HolidayPackageEditForm:saveHolidayPackage"]').isVisible().catch(() => false)
  if (msgs.some(m => /error/i.test(m))) throw new Error(`backoffice: al guardar fechas: ${msgs.join(' | ')}`)
  log('backoffice: fechas guardadas', start, '→', end, modalOpen ? '(el modal sigue abierto)' : '')
}

async function loginAgent(page) {
  await page.goto('https://www.siviajo.com', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000)
  try { await page.locator('button:has-text("aceptar todo"), button:has-text("Aceptar todo"), button:has-text("Aceptar")').first().click({ timeout: 4000 }); await page.waitForTimeout(1500) } catch {}
  // La sesión del backoffice ya vale como agente en el sitio (misma cookie): si no hay "Entrar", ya estamos.
  const entrar = page.locator('header a:has-text("Entrar"), header button:has-text("Entrar"), a:has-text("Entrar"), button:has-text("Entrar")').first()
  if (!(await entrar.count()) || !(await entrar.isVisible().catch(() => false))) { log('sitio: ya logueado (sesión del backoffice)'); return }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.locator('a:has-text("Entrar"), button:has-text("Entrar")').first().click({ timeout: 20000, noWaitAfter: true })
      await page.waitForSelector('input.login-email-input', { state: 'visible', timeout: 20000 })
      break
    } catch (e) {
      if (attempt === 3) throw new Error(`sitio: no aparece el formulario de login (${String(e.message || e).slice(0, 80)})`)
      await page.waitForTimeout(4000)
    }
  }
  await page.locator('input.login-email-input').fill(process.env.SIVIAJO_USERNAME); await page.locator('input.login-password-input').fill(process.env.SIVIAJO_PASSWORD)
  await page.locator('button.signin-button, button:has-text("Siguiente")').first().click()
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(3000)
  const body = clean(await page.evaluate(() => document.body.innerText))
  if (/Verifica tu identidad/.test(body)) throw new Error('sitio: login pide verificación por email')
  log('sitio: logueado como agente')
}

async function readSummary(page) {
  const text = clean(await page.evaluate(() => document.body.innerText))
  const price = clean(await page.locator('.dev-side-summary-priceShown').first().textContent().catch(() => ''))
  const priceNum = Number((price.match(/[\d.,]+/) || [''])[0].replace(/,/g, '')) || null
  const dates = (text.match(/\d{1,2} \w{3}\.? \d{4} - \d{1,2} \w{3}\.? \d{4}/) || [])[0] || null
  const transports = await page.evaluate(() => [...document.querySelectorAll('div, li')].filter(e => { const t = e.innerText || ''; return /\b[A-Z0-9]{2} ?\d{3,4}\b/.test(t) && /(Directo|Escala)/.test(t) && /\d{1,2}:\d{2}/.test(t) && t.length < 400 }).filter((e, _, all) => !all.some(o => o !== e && e.contains(o))).map(e => e.innerText.replace(/\s+/g, ' ').trim()).slice(0, 4))
  const hotels = (text.match(/Alojamiento[s]? ?[^.]{0,120}/g) || []).slice(0, 4)
  return { url: page.url(), price, priceNum, dates, transports, contract: /Contract Transport/.test(text), hasSave: (await page.locator('[id="formSaveConfirm:refreshIdea"]').count()) > 0, text }
}

/** En la lista de vuelos: tilda la aerolínea si hay filtro, busca la card con el número pedido y toca "Seleccionar tarifa". */
async function selectFlight(page, wanted, airline, preferDirect) {
  const tryFilter = async label => { const ok = await page.evaluate(l => { const el = [...document.querySelectorAll('label, span, li')].find(e => (e.innerText || '').trim().startsWith(l)); if (!el) return false; const box = el.closest('li, div')?.querySelector('.ui-chkbox-box, input[type=checkbox]'); if (box) { box.click(); return true } el.click(); return true }, label); if (ok) await page.waitForTimeout(4000); return ok }
  if (airline) await tryFilter(airline)
  const pick = await page.evaluate(({ wanted, preferDirect }) => {
    const cards = [...document.querySelectorAll('.c-transport__main')].map(c => c.closest('[class*="c-transport"]')?.parentElement || c)
    const info = cards.map(c => { const t = (c.innerText || '').replace(/\s+/g, ' '); const num = (t.match(/\b([A-Z0-9]{2}) ?(\d{3,4})\b/) || []); const btn = [...c.querySelectorAll('a, button')].find(b => /Seleccionar/i.test(b.innerText || '')); return { t: t.slice(0, 160), num: num.length ? (num[1] + num[2]).toUpperCase() : '', direct: /Directo/.test(t), contract: /Contract Transport/.test(t), delta: Number(((t.match(/\+US\$\s?([\d.,]+)/) || [])[1] || '').replace(/,/g, '')) || 0, btn } }).filter(x => x.btn && !x.contract)
    let chosen = wanted ? info.find(x => x.num === wanted) : null
    let how = chosen ? 'número de vuelo' : ''
    if (!chosen && preferDirect) { chosen = info.filter(x => x.direct).sort((a, b) => a.delta - b.delta)[0]; if (chosen) how = 'directo más barato' }
    if (!chosen) { chosen = [...info].sort((a, b) => a.delta - b.delta)[0]; if (chosen) how = 'más barato' }
    if (!chosen) return { ok: false, count: info.length }
    chosen.btn.click()
    return { ok: true, how, num: chosen.num, direct: chosen.direct, text: chosen.t, count: info.length }
  }, { wanted, preferDirect })
  return pick
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ locale: 'es-AR', viewport: { width: 1400, height: 1000 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' })
  const bo = await ctx.newPage()
  let originalDates = null
  try {
    // ── 1. Backoffice: fechas del paquete ──────────────────────────────────
    await loginBackoffice(bo)
    await openPackageEditor(bo)
    originalDates = await readDates(bo)
    result.backoffice = { before: originalDates }
    log('backoffice: fechas actuales', JSON.stringify(originalDates))
    const weekday = new Date(`${DATE}T00:00:00Z`).getUTCDay()
    if (MODE === 'plan') {
      notes.push(`plan: se pondría Desde/Hasta = ${dmy(DATE)} y día ${WEEKDAY_INPUT[weekday]}`)
      await bo.locator('[id="HolidayPackageEditForm:cancelCloseModal"]').click().catch(() => {})
    } else {
      await setDatesAndSave(bo, dmy(DATE), dmy(DATE), weekday)
      result.backoffice.after = { start: dmy(DATE), end: dmy(DATE), weekday: WEEKDAY_INPUT[weekday] }
    }

    // ── 2. Sitio como agente: rehacer la búsqueda con la fecha nueva ───────
    const site = await ctx.newPage()
    await loginAgent(site)
    await site.goto(`https://www.siviajo.com/es/idea/${TC_ID}${SLUG ? '/' + SLUG : ''}`, { waitUntil: 'networkidle', timeout: 60000 }); await site.waitForTimeout(3000)
    await site.mouse.wheel(0, 500); await site.waitForTimeout(800)
    await site.locator('[id="idea-info-form:select-options:directBook"]').click(); await site.waitForTimeout(4000)
    const dateInput = site.locator('input.sb-calendar.departure-date').first()
    const currentDate = await dateInput.inputValue()
    if (MODE === 'plan') {
      notes.push(`plan: la idea pide fecha ${currentDate}; se pondría ${dmy(DATE)} y se buscaría`)
      result.ok = true
      console.log('RESULT', JSON.stringify(result)); await browser.close(); return
    }
    await dateInput.click(); await dateInput.press('Control+A'); await dateInput.fill(dmy(DATE)); await dateInput.press('Tab'); await site.waitForTimeout(1500)
    const err = await site.evaluate(() => [...document.querySelectorAll('.ui-message, .ui-messages, [class*="error"]:not(script)')].map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(t => t && /fecha/i.test(t)).slice(0, 3))
    if (err.length) throw new Error(`sitio: la fecha ${dmy(DATE)} no se acepta: ${err.join(' | ')}`)
    await site.locator('a.dev-button-startTrip').first().click()
    let summary = null
    for (let i = 0; i < 20; i++) { await site.waitForTimeout(5000); const p = await site.locator('.dev-side-summary-priceShown').first().textContent({ timeout: 1500 }).catch(() => null); if (p && /\d/.test(p) && /summary/.test(site.url())) break }
    summary = await readSummary(site)
    await shot(site, 'site-resumen-1')
    log('sitio: resumen', summary.dates, summary.price, '| contrato?', summary.contract, '|', JSON.stringify(summary.transports))
    if (!summary.priceNum) throw new Error(`sitio: la búsqueda con fecha ${dmy(DATE)} no llegó al resumen (${summary.url})`)

    // ── 3. Aéreo: el pedido, o el mejor según la regla ──────────────────────
    const hasWanted = FLIGHT_OUT && summary.transports.some(t => t.replace(/\s+/g, '').toUpperCase().includes(FLIGHT_OUT))
    result.flights = { requested: { out: FLIGHT_OUT, back: FLIGHT_BACK, airline: AIRLINE }, before: summary.transports }
    if (!hasWanted || summary.contract) {
      const clickedEdit = await site.evaluate(() => { const cands = [...document.querySelectorAll('a, button, span')].filter(e => e.innerText && e.innerText.trim() === 'Edita'); for (const e of cands) { let box = e; for (let k = 0; k < 6 && box; k++) { box = box.parentElement; if (box && /\b[A-Z0-9]{2} ?\d{3,4}\b/.test(box.innerText) && /(Directo|Escala)/.test(box.innerText)) { e.click(); return true } } } return false })
      if (!clickedEdit) throw new Error('sitio: no encuentro "Edita" del transporte en el resumen')
      for (let i = 0; i < 16; i++) { await site.waitForTimeout(5000); if (/flightCityAvail/.test(site.url())) break }
      await site.waitForTimeout(4000)
      const pickOut = await selectFlight(site, FLIGHT_OUT, AIRLINE, PREFER_DIRECT)
      log('sitio: ida elegida', JSON.stringify(pickOut))
      if (!pickOut.ok) throw new Error('sitio: no pude elegir el vuelo de ida')
      notes.push(`ida: ${pickOut.num || '?'} (${pickOut.how})`)
      // Tramo de vuelta si el sitio lo pide; si no, vuelve al resumen solo.
      for (let i = 0; i < 16; i++) { await site.waitForTimeout(5000); const u = site.url(); if (/summary/.test(u) || /flightPosition=1/.test(u)) break }
      if (/flightPosition=1/.test(site.url())) {
        await site.waitForTimeout(4000)
        const pickBack = await selectFlight(site, FLIGHT_BACK, AIRLINE, PREFER_DIRECT)
        log('sitio: vuelta elegida', JSON.stringify(pickBack))
        if (!pickBack.ok) throw new Error('sitio: no pude elegir el vuelo de vuelta')
        notes.push(`vuelta: ${pickBack.num || '?'} (${pickBack.how})`)
        for (let i = 0; i < 16; i++) { await site.waitForTimeout(5000); if (/summary/.test(site.url())) break }
      }
      await site.waitForTimeout(3000)
      summary = await readSummary(site)
      await shot(site, 'site-resumen-2')
      log('sitio: resumen con aéreo nuevo', summary.dates, summary.price, '| contrato?', summary.contract, '|', JSON.stringify(summary.transports))
    }
    result.search = { dates: summary.dates, price: summary.priceNum, transports: summary.transports, hotels: summary.hotels, contract: summary.contract }
    if (summary.contract) throw new Error('sitio: el resumen sigue con el transporte de contrato (cupo)')
    if (EXPECTED > 0 && Math.abs(summary.priceNum - EXPECTED) / EXPECTED * 100 > TOLERANCE) throw new Error(`sitio: el precio del resumen USD ${summary.priceNum} se aleja más de ${TOLERANCE}% del esperado USD ${EXPECTED}`)
    if (!summary.hasSave) throw new Error('sitio: no aparece "Actualizar y guardar idea" en el resumen')

    // ── 4. Guardar (sólo apply) ─────────────────────────────────────────────
    if (MODE === 'apply') {
      await site.locator('[id="formSaveConfirm:refreshIdea"]').click()
      await site.waitForTimeout(8000); await site.waitForLoadState('networkidle').catch(() => {})
      await shot(site, 'site-guardado')
      const after = clean(await site.evaluate(() => document.body.innerText))
      result.saved = true
      result.savedText = after.slice(0, 300)
      log('sitio: "Actualizar y guardar idea" tocado')
    } else {
      notes.push('prepare: no se guardó la idea')
    }
    result.ok = true
  } catch (err) {
    result.error = String(err && err.message ? err.message : err).slice(0, 500)
    log('ERROR', result.error)
  } finally {
    // prepare (o fallo antes de guardar): las fechas del backoffice vuelven a como estaban.
    if (originalDates && MODE !== 'plan' && !(MODE === 'apply' && result.saved)) {
      try {
        const bo2 = await ctx.newPage(); await loginBackoffice(bo2); await openPackageEditor(bo2)
        const wd = null
        await setDatesAndSave(bo2, originalDates.start, originalDates.end, wd)
        notes.push(`backoffice: fechas restauradas a ${originalDates.start} → ${originalDates.end}`)
      } catch (e) { notes.push(`backoffice: NO se pudieron restaurar las fechas (${String(e.message || e).slice(0, 120)}); revisar Desde/Hasta a mano`) }
    }
    console.log('RESULT', JSON.stringify(result))
    await browser.close()
  }
})()
