/**
 * Qué tipo de página de siviajo.com es una URL, para agrupar Search Console
 * por plantilla en vez de por URL: la home, las fichas de paquete (`/es/idea/`),
 * las temáticas (`…/moreideas`), los destinos, las landings, el blog y
 * vuelos.siviajo.com. Cada plantilla se optimiza distinto, así que se mide
 * distinto.
 */
export type PageType = 'home' | 'idea' | 'theme' | 'destination' | 'landing' | 'blog' | 'vuelos' | 'institucional' | 'other'

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  home: 'Home',
  idea: 'Paquetes (fichas)',
  theme: 'Temáticas',
  destination: 'Destinos',
  landing: 'Landings',
  blog: 'Blog',
  vuelos: 'Vuelos baratos',
  institucional: 'Institucional',
  other: 'Otras',
}

export function classifyPage(url: string): PageType {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'other'
  }
  const host = u.hostname.toLowerCase()
  const path = u.pathname.replace(/\/+$/, '') || '/'

  if (host === 'blog.siviajo.com' || host === 'www.blog.siviajo.com') return 'blog'
  if (host === 'vuelos.siviajo.com' || path.startsWith('/vuelos-baratos')) return 'vuelos'
  if (host === 'institucional.siviajo.com') return 'institucional'
  if (host !== 'siviajo.com' && host !== 'www.siviajo.com') return 'other'

  if (path === '/' || path === '/es' || path === '/home') return 'home'
  if (/^\/[a-z]{2}\/idea\/\d+/.test(path)) return 'idea'
  if (/\/moreideas$/.test(path) || /^\/[a-z]{2}\/theme\/\d+/.test(path)) return 'theme'
  if (/^\/[a-z]{2}\/destination\//.test(path)) return 'destination'
  if (/^\/[a-z]{2}\/landing\//.test(path)) return 'landing'
  return 'other'
}

/** Id de TC de una ficha de paquete (`/es/idea/44495922/slug`), o null. */
export function ideaIdFromUrl(url: string): number | null {
  const m = url.match(/\/[a-z]{2}\/idea\/(\d+)/)
  return m ? Number(m[1]) : null
}
