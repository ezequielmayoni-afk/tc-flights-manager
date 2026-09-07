import { redirect } from 'next/navigation'

/**
 * Cotización manual pasó a ser una sección de Tareas pendientes.
 * La ruta se mantiene para no romper links guardados ni los botones que
 * apuntan acá desde los avisos de Slack.
 */
export default function RequoteRedirectPage() {
  redirect('/tareas')
}
