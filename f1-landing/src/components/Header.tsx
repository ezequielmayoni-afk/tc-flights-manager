'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart'

export function Header() {
  const { count } = useCart()
  return (
    <header className="sticky top-0 z-40 bg-brand text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="rounded-lg bg-accent px-2 py-1 text-sm font-black text-brand-900">
            Sí, Viajo
          </span>
          <span className="text-sm font-semibold tracking-wide text-white/80">
            Fórmula 1
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="hidden text-white/80 hover:text-white sm:block">
            Grandes Premios
          </Link>
          <Link
            href="/checkout"
            className="relative flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"
          >
            🛒 Carrito
            {count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-brand-900">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  )
}
