/**
 * Vencimientos del sistema, en un solo lugar.
 *
 * Los relojes los arrancan triggers de la base (ver
 * supabase/migrations/20260908_deadlines.sql); acá vive solo el cálculo de
 * cuánto falta y cómo se muestra, que es lo que comparten la pantalla de
 * cotización manual, la de diseño, los paneles de creativos y el cron de avisos.
 */

export const REQUOTE_SLA_HOURS = 48
export const DESIGN_SLA_HOURS = 48

/** Cuántas horas antes del vencimiento se considera "por vencer". */
export const SOON_THRESHOLD_HOURS = 12

export type DeadlineState = 'ok' | 'soon' | 'overdue' | 'none'

/** Suma el SLA al momento en que arrancó el reloj. */
export function deadlineFrom(startedAt: string | Date | null | undefined, slaHours: number): Date | null {
  if (!startedAt) return null
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + slaHours * 60 * 60 * 1000)
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Horas que faltan (negativo si ya venció). */
export function hoursRemaining(deadline: Date | null, now: Date = new Date()): number | null {
  if (!deadline) return null
  return (deadline.getTime() - now.getTime()) / (60 * 60 * 1000)
}

/**
 * Estado del vencimiento.
 *
 * Una tarea completada NUNCA figura vencida, por más que la fecha haya pasado:
 * el vencimiento es para lo que falta hacer, no un reproche sobre lo hecho.
 */
export function deadlineState(
  deadline: Date | null,
  completed: boolean,
  now: Date = new Date()
): DeadlineState {
  if (completed) return 'ok'
  if (!deadline) return 'none'

  const remaining = hoursRemaining(deadline, now)
  if (remaining === null) return 'none'
  if (remaining < 0) return 'overdue'
  if (remaining <= SOON_THRESHOLD_HOURS) return 'soon'
  return 'ok'
}

/** Texto corto para el badge: "Vence en 5 h", "Vencido hace 2 d". */
export function formatDeadlineLabel(deadline: Date | null, completed: boolean, now: Date = new Date()): string {
  if (!deadline) return '—'
  if (completed) return formatDateTime(deadline)

  const remaining = hoursRemaining(deadline, now)
  if (remaining === null) return '—'

  const abs = Math.abs(remaining)
  const amount = abs < 1
    ? `${Math.max(1, Math.round(abs * 60))} min`
    : abs < 48
      ? `${Math.round(abs)} h`
      : `${Math.round(abs / 24)} d`

  return remaining < 0 ? `Vencido hace ${amount}` : `Vence en ${amount}`
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Clases de Tailwind por estado, para que los badges se vean igual en todas las pantallas. */
export const DEADLINE_BADGE_STYLES: Record<DeadlineState, string> = {
  overdue: 'bg-red-100 text-red-700 border-red-200',
  soon: 'bg-amber-100 text-amber-800 border-amber-200',
  ok: 'bg-slate-100 text-slate-600 border-slate-200',
  none: 'bg-slate-50 text-slate-400 border-slate-200',
}

/**
 * Valor para un <input type="datetime-local">: espera 'YYYY-MM-DDTHH:mm' en
 * hora local, mientras que en la base guardamos UTC.
 */
export function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** El inverso: de lo que escribe el usuario a ISO para guardar. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
