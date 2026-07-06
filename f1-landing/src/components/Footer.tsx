export function Footer() {
  const year = 2026
  return (
    <footer className="mt-16 bg-brand-900 text-white/70">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="max-w-sm">
            <div className="mb-2 text-base font-bold text-white">Sí, Viajo · Fórmula 1</div>
            <p>
              Entradas oficiales para los Grandes Premios de Fórmula 1. Reservá tu
              sector y viví la carrera en vivo.
            </p>
          </div>
          <div className="text-xs leading-relaxed">
            <p>Atención al cliente</p>
            <p className="text-white">ventas@siviajo.com</p>
            <p className="mt-3">Medios de pago: MercadoPago</p>
          </div>
        </div>
        <div className="mt-8 border-t border-white/10 pt-4 text-xs">
          © {year} Sí, Viajo. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  )
}
