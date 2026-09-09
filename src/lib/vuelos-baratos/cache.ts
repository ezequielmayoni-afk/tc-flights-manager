/**
 * Memo con TTL para las lecturas públicas de vuelos.siviajo.com.
 *
 * PM2 corre una sola instancia del proceso, así que un `Map` en memoria
 * alcanza: la landing pega a la misma base 10 minutos seguidos con la misma
 * consulta. Se guarda la promesa, no el valor, para que dos requests
 * simultáneos hagan una sola query. Un fallo no se cachea.
 *
 * El `Map` va acotado: las claves salen (en parte) de la URL, así que un
 * crawler hostil pidiendo `/vuelos-baratos/<slug inventado>` no puede hacerlo
 * crecer sin techo.
 */

interface Entrada {
  expiraEn: number
  valor: Promise<unknown>
}

/** Techo del memo: son ~15 destinos × 4 orígenes, sobra de largo. */
const MAX_MEMO_ENTRIES = 500

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
  podar(ahora)
  return valor as Promise<T>
}

/**
 * Primero se tiran las entradas vencidas (lo normal); si aun así sigue por
 * encima del techo, salen las más viejas: `Map` itera por orden de inserción,
 * así que la recién puesta es la última en irse.
 */
function podar(ahora: number): void {
  if (memo.size <= MAX_MEMO_ENTRIES) return
  for (const [key, entrada] of memo) {
    if (entrada.expiraEn <= ahora) memo.delete(key)
  }
  for (const key of memo.keys()) {
    if (memo.size <= MAX_MEMO_ENTRIES) break
    memo.delete(key)
  }
}

/** El barrido acaba de escribir: lo cacheado quedó viejo. */
export function invalidatePublicCache(): void {
  memo.clear()
}
