import { siviajoBaseUrl } from '@/lib/vuelos-baratos/config'

/** Pie con el legal de la agencia y las salidas al sitio principal. */
export function PublicFooter() {
  const base = siviajoBaseUrl()
  const links = [
    { label: 'Inicio', href: base },
    { label: 'Buscar vuelos', href: `${base}/es/?tripType=ONLY_FLIGHT` },
    { label: 'Paquetes', href: `${base}/es/` },
  ]

  return (
    <footer className="mt-12 border-t border-[#E3E3E3] bg-[#F8F9FA]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:px-6">
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map(link => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#1A237E] hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <p className="text-xs text-[#6C757D]">Sí, viajo - Nuevos Emprendimientos Internacionales SRL | Legajo: 19159</p>
      </div>
    </footer>
  )
}
