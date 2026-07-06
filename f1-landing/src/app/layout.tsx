import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '@/lib/cart'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Entradas Fórmula 1 | Sí, Viajo',
  description:
    'Comprá entradas oficiales para los Grandes Premios de Fórmula 1. Elegí tu sector y viví la carrera en vivo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        <CartProvider>
          <Header />
          <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-8">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  )
}
