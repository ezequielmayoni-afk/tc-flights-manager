/**
 * Los frenos del beacon de la landing: de quién viene y cuántos manda.
 *
 * Es un módulo puro (sin `next/server`, sin red, sin `process.env`) para poder
 * testear lo que más fácil se rompe del endpoint: el limitador y la lectura de
 * la IP real detrás de nginx.
 */

export interface RateLimiterOptions {
  /** Pedidos permitidos por clave dentro de la ventana. */
  max: number
  windowMs: number
  /**
   * Techo DURO de claves. Al llegar, se evicta la más vieja (FIFO): el `Map`
   * conserva el orden de inserción, así que borrar la primera es O(1) y el
   * mapa nunca crece sin control aunque alguien rote la IP en cada pedido.
   */
  maxKeys: number
}

export interface RateLimiter {
  /** true si el pedido entra; false si la clave ya gastó su cupo en la ventana. */
  allow(key: string, now: number): boolean
  size(): number
}

/**
 * Limitador por clave con ventana fija, en memoria y sin barridos.
 *
 * Cada ventana nueva reinserta la clave al final del `Map`, así que el mapa
 * queda SIEMPRE ordenado por antigüedad: tanto la limpieza de vencidos como la
 * evicción por techo se resuelven borrando desde el frente, en O(1) amortizado
 * por pedido. Un barrido completo del mapa en cada request (que es lo que pasa
 * si se recorre buscando vencidos) le dejaría el event loop de Node a quien
 * mande beacons con IPs distintas.
 */
export function createRateLimiter({ max, windowMs, maxKeys }: RateLimiterOptions): RateLimiter {
  const ventanas = new Map<string, { count: number; windowStart: number }>()

  /** Borra desde el frente lo que ya venció; cada entrada se paga una sola vez. */
  function purgarVencidos(now: number): void {
    for (const [clave, ventana] of ventanas) {
      if (now - ventana.windowStart < windowMs) return
      ventanas.delete(clave)
    }
  }

  function evictarMasViejas(): void {
    while (ventanas.size >= maxKeys) {
      const masVieja = ventanas.keys().next()
      if (masVieja.done) return
      ventanas.delete(masVieja.value)
    }
  }

  return {
    allow(key: string, now: number): boolean {
      const actual = ventanas.get(key)
      if (actual && now - actual.windowStart < windowMs) {
        actual.count += 1
        return actual.count <= max
      }

      // Ventana nueva (o primera vez): la clave se reinserta al final para no
      // romper el orden por antigüedad del que depende la evicción.
      if (actual) ventanas.delete(key)
      purgarVencidos(now)
      evictarMasViejas()
      ventanas.set(key, { count: 1, windowStart: now })
      return max >= 1
    },
    size(): number {
      return ventanas.size
    },
  }
}

/**
 * La IP real del visitante detrás de nginx.
 *
 * `ops/nginx/vuelos.siviajo.com.conf` setea `X-Real-IP: $remote_addr` y usa
 * `$proxy_add_x_forwarded_for`, que AGREGA `$remote_addr` al final de lo que
 * mandó el cliente. O sea: el PRIMER valor de `x-forwarded-for` es un header
 * que escribe quien llama (y por lo tanto no sirve para limitar nada), y el
 * último es el único que puso nuestro proxy.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real

  const forwarded = headers.get('x-forwarded-for')
  if (!forwarded) return null
  const partes = forwarded
    .split(',')
    .map(parte => parte.trim())
    .filter(parte => parte !== '')
  return partes.length > 0 ? partes[partes.length - 1] : null
}

/**
 * Prueba de origen barata para un endpoint público.
 *
 * `Sec-Fetch-Site` lo pone el navegador y no se puede falsear desde JS, así
 * que si viene tiene que decir `same-origin` (el beacon de la landing) o
 * `none` (una navegación escrita a mano). Si no viene (navegador viejo, curl,
 * un script), se acepta sólo con un `Referer` del host público.
 *
 * No frena a un `curl` decidido —ningún endpoint de CAPI del lado del
 * navegador puede—, pero sí a que otra página del mundo escriba en el dataset.
 */
export function originAllowed(headers: Headers, publicHost: string): boolean {
  const fetchSite = headers.get('sec-fetch-site')?.trim().toLowerCase()
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none'

  const host = publicHost.trim().toLowerCase()
  if (host === '') return false
  const referer = headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).host.toLowerCase() === host
  } catch {
    return false
  }
}
