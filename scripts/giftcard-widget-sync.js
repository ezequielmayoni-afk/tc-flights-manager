// Copia scripts/giftcard-widget.js dentro de src/lib/giftcard/widget.ts (template string) y sube WIDGET_VERSION si se pasa --bump.
const fs = require('fs'); const path = require('path')
const root = path.join(__dirname, '..'); const js = fs.readFileSync(path.join(root, 'scripts/giftcard-widget.js'), 'utf8')
if (js.includes('`') || js.includes('${')) { console.error('El widget no puede tener backticks ni ${'); process.exit(1) }
const tsPath = path.join(root, 'src/lib/giftcard/widget.ts'); const cur = fs.existsSync(tsPath) ? fs.readFileSync(tsPath, 'utf8') : ''
const m = cur.match(/WIDGET_VERSION = '(\d+)'/); let v = m ? parseInt(m[1], 10) : 1; if (process.argv.includes('--bump')) v++
fs.writeFileSync(tsPath, '/** JS del widget de gift cards (se sirve en GET /api/giftcard/widget y lo carga un tag de GTM en la landing de TC). Fuente: scripts/giftcard-widget.js (copiar con scripts/giftcard-widget-sync.js) */\nexport const WIDGET_VERSION = \'' + v + '\'\nexport const WIDGET_JS = `' + js + '`\n')
console.log('widget.ts regenerado, versión', v)
