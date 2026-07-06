import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order } = await searchParams
  return (
    <div className="mx-auto max-w-lg rounded-[var(--radius-card)] bg-surface p-10 text-center ring-1 ring-black/5">
      <p className="text-5xl">⚠️</p>
      <h1 className="mt-4 text-2xl font-black">No pudimos procesar el pago</h1>
      <p className="mt-2 text-muted">
        Tu pago no se completó. No se realizó ningún cargo. Podés volver a
        intentarlo o escribirnos a ventas@siviajo.com.
      </p>
      {order && (
        <p className="mt-4 text-xs text-muted">
          N° de orden: <span className="font-mono font-semibold text-ink">{order}</span>
        </p>
      )}
      <Link
        href="/checkout"
        className="mt-8 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Volver al carrito
      </Link>
    </div>
  )
}
