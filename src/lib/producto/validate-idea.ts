import type { DestinationProfile, IdeaDraft, IdeaValidation } from './types'

const REGIMEN_LABEL: Record<string, string> = {
  all_inclusive: 'all inclusive',
  media_pension: 'media pensión',
  desayuno: 'desayuno',
  sin_pension: 'sin pensión',
}

/**
 * Valida una idea contra los usos y costumbres del destino. Las reglas duras
 * bloquean ("Punta Cana sin all inclusive" no llega a siviajo.com); las
 * blandas la dejan en revisión.
 */
export function validateIdea(draft: IdeaDraft, profile: DestinationProfile, today: Date = new Date()): IdeaValidation {
  const hard: string[] = []
  const soft: string[] = []

  if (!profile.active) hard.push(`El destino ${profile.name} está desactivado en los perfiles`)

  if (profile.regimen_required && draft.regimen && draft.regimen !== profile.regimen_required) {
    hard.push(`${profile.name} se vende con ${REGIMEN_LABEL[profile.regimen_required]}, no con ${REGIMEN_LABEL[draft.regimen] ?? draft.regimen}`)
  }
  if (draft.regimen && profile.regimen_allowed.length > 0 && !profile.regimen_allowed.includes(draft.regimen)) {
    hard.push(`Régimen ${REGIMEN_LABEL[draft.regimen] ?? draft.regimen} no permitido en ${profile.name} (permitidos: ${profile.regimen_allowed.map(r => REGIMEN_LABEL[r]).join(', ')})`)
  }

  if (profile.nights_allowed.length > 0 && !profile.nights_allowed.includes(draft.nights)) {
    const msg = `${draft.nights} noches no es una duración habitual para ${profile.name} (habituales: ${profile.nights_allowed.join(', ')})`
    // Diferencia de una noche: aviso; más: bloqueo.
    const closest = Math.min(...profile.nights_allowed.map(n => Math.abs(n - draft.nights)))
    if (closest <= 1) soft.push(msg)
    else hard.push(msg)
  }

  if (draft.starsMin !== null && draft.starsMin < profile.stars_min) {
    hard.push(`${profile.name} se vende desde ${profile.stars_min} estrellas; la idea pide ${draft.starsMin}`)
  }

  if (profile.direct_required && draft.directFlight === false) {
    hard.push(`${profile.name} se vende sólo con vuelo directo`)
  }

  if (draft.adults < 1) hard.push('Hace falta al menos un adulto')
  if (draft.children > 0 && profile.family === 'medio_oriente_asia') soft.push('Viaje largo con menores: revisar escalas y pernoctes')

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(draft.month)
  if (!monthMatch) {
    hard.push(`Mes inválido: ${draft.month}`)
  } else {
    const firstDay = new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1))
    const daysAhead = Math.round((firstDay.getTime() - today.getTime()) / 86_400_000)
    if (daysAhead < 0 && daysAhead < -28) hard.push('El mes ya pasó')
    else if (daysAhead < profile.booking_window_days * 0.5) soft.push(`Sale en ${Math.max(daysAhead, 0)} días: menos de la mitad de la ventana de compra habitual (${profile.booking_window_days} días)`)
    if (profile.high_season_months.includes(Number(monthMatch[2]))) soft.push('Temporada alta: precios más volátiles y menos disponibilidad')
  }

  return { ok: hard.length === 0, hard, soft }
}
