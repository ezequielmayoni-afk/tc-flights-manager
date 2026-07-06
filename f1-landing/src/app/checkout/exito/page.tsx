import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ExitoPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; pendiente?: string }>
}) {
  const { order, pendiente } = await searchParams
  const isPending = pendiente === '1'

  return (
    <div className="mx-auto max-w-lg rounded-[var(--radius-card)] bg-surface p-10 text-center ring-1 ring-black/5">
      <p className="text-5xl">{isPending ? '⏳' : '✅'}</p>
      <h1 className="mt-4 text-2xl font-black">
        {isPending ? 'Reserva registrada' : '¡Compra confirmada!'}
      </h1>
      <p className="mt-2 text-muted">
        {isPending
          ? 'Tu reserva quedó registrada y estamos esperando la confirmación del pago. Te contactaremos por email con los próximos pasos.'
          : 'Recibimos tu pago. Te enviamos un email con el detalle de tu compra y las instrucciones para tus entradas.'}
      </p>
      {order && (
        <p className="mt-4 text-xs text-muted">
          N° de orden: <span className="font-mono font-semibold text-ink">{order}</span>
        </p>
      )}
      <Link
        href="/"
        className="mt-8 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
