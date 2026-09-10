import type { GscTotals, PageStatRow, PageTotals } from './types'

/**
 * Agregación de `gsc_page_stats` para la card del admin.
 *
 * Pura y aparte de `queries.ts` para poder testearla sin base. Dos cuentas que
 * no se pueden promediar a ojo:
 * - **CTR**: es clicks/impresiones del total, no el promedio de los CTR
 *   diarios (un día con 1 impresión y 1 click daría 100 %).
 * - **Posición media**: ponderada por impresiones, que es como la calcula
 *   Search Console; el promedio simple hace que un día con 3 impresiones en la
 *   posición 1 pese igual que uno con 3.000 en la 40.
 */
export function aggregatePageStats(rows: PageStatRow[]): GscTotals {
  let clicks = 0
  let impressions = 0
  let posicionPorImpresion = 0

  const porPagina = new Map<string, { clicks: number; impressions: number; posicionPorImpresion: number }>()

  for (const row of rows) {
    clicks += row.clicks
    impressions += row.impressions
    posicionPorImpresion += row.position * row.impressions

    const actual = porPagina.get(row.page)
    if (actual) {
      actual.clicks += row.clicks
      actual.impressions += row.impressions
      actual.posicionPorImpresion += row.position * row.impressions
    } else {
      porPagina.set(row.page, {
        clicks: row.clicks,
        impressions: row.impressions,
        posicionPorImpresion: row.position * row.impressions,
      })
    }
  }

  const pages: PageTotals[] = [...porPagina.entries()]
    .map(([page, t]) => ({
      page,
      clicks: t.clicks,
      impressions: t.impressions,
      position: t.impressions > 0 ? t.posicionPorImpresion / t.impressions : 0,
    }))
    // Por clicks y después por impresiones: entre dos páginas con los mismos
    // clicks (o con cero), la que más se mostró es la que interesa mirar.
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.page.localeCompare(b.page))

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posicionPorImpresion / impressions : 0,
    pages,
  }
}
