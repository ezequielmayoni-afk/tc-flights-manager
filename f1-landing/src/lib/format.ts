// Formato en español (es-AR) para precios y fechas.

const CURRENCY_LOCALE: Record<string, string> = {
  EUR: 'es-ES',
  USD: 'en-US',
  ARS: 'es-AR',
}

export function formatPrice(amount: number | null, currency = 'EUR'): string {
  if (amount == null) return 'Consultar'
  const locale = CURRENCY_LOCALE[currency] ?? 'es-AR'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('es-AR')}`
  }
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "17–19 jul 2026" o "17 jul 2026" a partir de fechas ISO. */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return 'Fecha a confirmar'
  const s = new Date(start)
  const e = end ? new Date(end) : null
  const mS = MONTHS[s.getUTCMonth()]?.slice(0, 3)
  const yS = s.getUTCFullYear()
  if (!e || (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth() && s.getUTCDate() === e.getUTCDate())) {
    return `${s.getUTCDate()} ${mS} ${yS}`
  }
  const mE = MONTHS[e.getUTCMonth()]?.slice(0, 3)
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${mE} ${yS}`
  }
  return `${s.getUTCDate()} ${mS} – ${e.getUTCDate()} ${mE} ${e.getUTCFullYear()}`
}

const COUNTRY_ES: Record<string, string> = {
  BE: 'Bélgica', GB: 'Reino Unido', IT: 'Italia', NL: 'Países Bajos',
  ES: 'España', HU: 'Hungría', AT: 'Austria', US: 'Estados Unidos',
  MC: 'Mónaco', CA: 'Canadá', AU: 'Australia', SG: 'Singapur',
  JP: 'Japón', MX: 'México', BR: 'Brasil', AE: 'Emiratos Árabes Unidos',
  SA: 'Arabia Saudita', BH: 'Baréin', QA: 'Catar', AZ: 'Azerbaiyán',
  FR: 'Francia', DE: 'Alemania',
}

export function countryName(code: string | null): string {
  if (!code) return ''
  return COUNTRY_ES[code.toUpperCase()] ?? code
}
