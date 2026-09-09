/**
 * Memo con TTL para las lecturas públicas de vuelos.siviajo.com.
 *
 * PM2 corre una sola instancia del proceso, así que un `Map` en memoria
 * alcanza: la landing pega a la misma base 10 minutos seguidos con la misma
 * consulta. Se guarda la promesa, no el valor, para que dos requests
 * simultáneos hagan una sola query. Un fallo no se cachea.
 */

interface Entrada {
  expiraEn: number
  valor: Promise<unknown>
}

const memo = new Map<string, Entrada>()

export async function ttlMemo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const ahora = Date.now()
  const vigente = memo.get(key)
  if (vigente && vigente.expiraEn > ahora) return vigente.valor as Promise<T>

  const valor = fn().catch((err: unknown) => {
    // Un error no se cachea: el próximo request vuelve a intentar.
    if (memo.get(key)?.valor === valor) memo.delete(key)
    throw err
  })
  memo.set(key, { expiraEn: ahora + ttlMs, valor })
  return valor as Promise<T>
}

/** El barrido acaba de escribir: lo cacheado quedó viejo. */
export function invalidatePublicCache(): void {
  memo.clear()
}
