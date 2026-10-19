import { describe, expect, it } from 'vitest'
import { isValidSitemapFile, renderSitemapIndex, renderUrlset } from '../sitemaps'

describe('sitemaps', () => {
  it('arma el índice sólo con archivos que tienen URLs y escapa el XML', () => {
    const xml = renderSitemapIndex(
      [
        { file: 'hoteles-cancun', urls: 3000, lastmod: '2026-10-19' },
        { file: 'vacio', urls: 0, lastmod: null },
      ],
      'https://hub.siviajo.com'
    )
    expect(xml).toContain('<loc>https://hub.siviajo.com/sitemaps/hoteles-cancun.xml</loc>')
    expect(xml).toContain('<lastmod>2026-10-19</lastmod>')
    expect(xml).not.toContain('vacio')
  })
  it('arma el urlset con lastmod opcional y escapa &', () => {
    const xml = renderUrlset([
      { url: 'https://www.siviajo.com/es/accommodation/48862/marupiara-all-inclusive-resort-by-wish', lastmod: '2026-10-19' },
      { url: 'https://www.siviajo.com/es/x?a=1&b=2', lastmod: null },
    ])
    expect(xml).toContain('<loc>https://www.siviajo.com/es/x?a=1&amp;b=2</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml.match(/<lastmod>/g)).toHaveLength(1)
  })
  it('valida el nombre del archivo', () => {
    expect(isValidSitemapFile('hoteles-punta-cana')).toBe(true)
    expect(isValidSitemapFile('../etc')).toBe(false)
    expect(isValidSitemapFile('Index')).toBe(false)
  })
})
