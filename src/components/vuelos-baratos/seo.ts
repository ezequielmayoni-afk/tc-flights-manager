/**
 * Open Graph compartido por la landing.
 *
 * Next mergea la metadata por clave de primer nivel: si una página exporta su
 * propio `openGraph`, reemplaza entero al del layout y `locale`/`siteName` se
 * pierden. Por eso cada página esparce estas claves además de las suyas.
 */
export const OG_BASE = { locale: 'es_AR', siteName: 'Sí, Viajo' } as const
