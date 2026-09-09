'use client'

import { BOTON_PRIMARIO } from '@/components/vuelos-baratos/ui'

/**
 * Error boundary de vuelos.siviajo.com.
 *
 * Si Supabase (o el barrido) se cae, la landing no puede mostrar la pantalla
 * de error por defecto de Next: es una página pública que llega de Google. Se
 * mantiene la identidad de siviajo.com y siempre queda una salida al motor.
 * El header y el footer los sigue poniendo el layout del grupo.
 */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-[#1A237E] sm:text-3xl">No pudimos cargar los precios</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#495057]">
        No pudimos cargar los precios. Probá de nuevo en unos minutos.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className={BOTON_PRIMARIO}>
          Reintentar
        </button>
        {/* Literal a propósito: `siviajoBaseUrl()` lee una env de servidor y esto es un client component. */}
        <a
          href="https://www.siviajo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[#1A237E] hover:underline"
        >
          Ir a siviajo.com
        </a>
      </div>
    </div>
  )
}
