import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePublicCache, ttlMemo } from '../cache'

/**
 * El memo de la landing: cachea 10 minutos, no cachea errores y está acotado
 * (las claves salen de la URL, así que un crawler no lo puede hacer crecer sin
 * techo). El `Map` es de módulo: cada test arranca limpio.
 */

const TTL = 10 * 60_000
/** Igual que `MAX_MEMO_ENTRIES` en `cache.ts`. */
const TOPE = 500

beforeEach(() => {
  invalidatePublicCache()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-09T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  invalidatePublicCache()
})

describe('ttlMemo', () => {
  it('llama una sola vez mientras la entrada está vigente', async () => {
    const fn = vi.fn().mockResolvedValue('miami')

    expect(await ttlMemo('dest:miami:BUE', TTL, fn)).toBe('miami')
    expect(await ttlMemo('dest:miami:BUE', TTL, fn)).toBe('miami')
    vi.setSystemTime(new Date('2026-09-09T12:09:00Z'))
    expect(await ttlMemo('dest:miami:BUE', TTL, fn)).toBe('miami')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('dos requests simultáneos comparten la misma consulta', async () => {
    const fn = vi.fn().mockResolvedValue('miami')

    const [a, b] = await Promise.all([ttlMemo('k', TTL, fn), ttlMemo('k', TTL, fn)])

    expect([a, b]).toEqual(['miami', 'miami'])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('vuelve a consultar cuando venció el TTL', async () => {
    const fn = vi.fn().mockResolvedValueOnce('viejo').mockResolvedValueOnce('nuevo')

    expect(await ttlMemo('k', TTL, fn)).toBe('viejo')
    vi.setSystemTime(new Date('2026-09-09T12:10:01Z'))
    expect(await ttlMemo('k', TTL, fn)).toBe('nuevo')

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('no cachea un error: el próximo request reintenta', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('Supabase caído')).mockResolvedValueOnce('ok')

    await expect(ttlMemo('k', TTL, fn)).rejects.toThrow('Supabase caído')
    expect(await ttlMemo('k', TTL, fn)).toBe('ok')

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('no crece sin techo: al pasar el tope se van las entradas más viejas', async () => {
    for (let i = 0; i < TOPE + 120; i++) {
      await ttlMemo(`inventado:${i}`, TTL, async () => i)
    }

    // La 0 fue de las primeras en entrar: ya no está (se recalcula).
    const primera = vi.fn().mockResolvedValue(0)
    await ttlMemo('inventado:0', TTL, primera)
    expect(primera).toHaveBeenCalledTimes(1)

    // La última sigue vigente: se desalojan las viejas, no la recién puesta.
    const ultima = vi.fn().mockResolvedValue(-1)
    expect(await ttlMemo(`inventado:${TOPE + 119}`, TTL, ultima)).toBe(TOPE + 119)
    expect(ultima).not.toHaveBeenCalled()
  })

  it('las vencidas se tiran antes que las vigentes', async () => {
    // Un TTL cortito para las primeras: al pasar el tope ya están vencidas.
    for (let i = 0; i < TOPE; i++) await ttlMemo(`viejo:${i}`, 1_000, async () => i)
    vi.setSystemTime(new Date('2026-09-09T12:05:00Z'))
    for (let i = 0; i < 10; i++) await ttlMemo(`fresco:${i}`, TTL, async () => i)

    const fresco = vi.fn().mockResolvedValue(-1)
    expect(await ttlMemo('fresco:0', TTL, fresco)).toBe(0)
    expect(fresco).not.toHaveBeenCalled()
  })
})

describe('invalidatePublicCache', () => {
  it('el barrido escribió: lo cacheado se descarta', async () => {
    const fn = vi.fn().mockResolvedValueOnce('antes').mockResolvedValueOnce('después')

    expect(await ttlMemo('k', TTL, fn)).toBe('antes')
    invalidatePublicCache()
    expect(await ttlMemo('k', TTL, fn)).toBe('después')

    expect(fn).toHaveBeenCalledTimes(2)
  })
})
