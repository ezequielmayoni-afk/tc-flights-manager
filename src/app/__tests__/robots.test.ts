import { describe, expect, it } from 'vitest'
import robots from '../robots'

describe('robots.txt del HUB', () => {
  it('deja rastrear la raíz, la landing, el sitemap declarado y los íconos; el resto queda bloqueado', () => {
    const { rules, sitemap } = robots()
    const regla = Array.isArray(rules) ? rules[0] : rules
    expect(regla.disallow).toEqual(['/'])
    for (const ruta of ['/$', '/vuelos-baratos', '/sitemap.xml', '/sitemaps/', '/favicon.ico', '/icon.png', '/apple-icon.png']) {
      expect(regla.allow).toContain(ruta)
    }
    // El sitemap declarado tiene que estar entre lo permitido.
    expect(String(sitemap)).toMatch(/\/sitemap\.xml$/)
  })
})
