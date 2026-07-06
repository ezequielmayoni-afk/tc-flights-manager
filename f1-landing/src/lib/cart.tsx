'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { CartItem } from './types'

const KEY = 'siviajo_f1_cart_v1'

interface CartCtx {
  items: CartItem[]
  count: number
  total: number
  currency: string
  add: (item: CartItem) => void
  setQty: (categoryId: string, qty: number) => void
  remove: (categoryId: string) => void
  clear: () => void
  ready: boolean
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [ready, setReady] = useState(false)

  // Cargar del localStorage al montar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setItems(JSON.parse(raw) as CartItem[])
    } catch {
      /* ignore */
    }
    setReady(true)
  }, [])

  // Persistir en cada cambio (después de la carga inicial).
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items, ready])

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.categoryId === item.categoryId)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], qty: next[i].qty + item.qty }
        return next
      }
      return [...prev, item]
    })
  }, [])

  const setQty = useCallback((categoryId: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((x) => (x.categoryId === categoryId ? { ...x, qty: Math.max(0, qty) } : x))
        .filter((x) => x.qty > 0)
    )
  }, [])

  const remove = useCallback((categoryId: string) => {
    setItems((prev) => prev.filter((x) => x.categoryId !== categoryId))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartCtx>(() => {
    const count = items.reduce((n, x) => n + x.qty, 0)
    const total = items.reduce((n, x) => n + x.qty * x.unitPrice, 0)
    const currency = items[0]?.currency ?? 'EUR'
    return { items, count, total, currency, add, setQty, remove, clear, ready }
  }, [items, add, setQty, remove, clear, ready])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart fuera de CartProvider')
  return ctx
}
