import { describe, expect, it } from 'vitest'
import { clientIp, createRateLimiter, originAllowed } from '../beacon-guard'

// Los dos frenos del beacon público. El limitador se prueba con un reloj
// pasado por parámetro (nada de timers) y la IP con `Headers` de verdad.

const VENTANA = 10 * 60_000

describe('createRateLimiter', () => {
  it('deja pasar hasta el tope y corta después', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: VENTANA, maxKeys: 100 })
    expect(limiter.allow('ip', 0)).toBe(true)
    expect(limiter.allow('ip', 1)).toBe(true)
    expect(limiter.allow('ip', 2)).toBe(true)
    expect(limiter.allow('ip', 3)).toBe(false)
    expect(limiter.allow('ip', 4)).toBe(false)
  })

  it('cada clave tiene su propio cupo', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: VENTANA, maxKeys: 100 })
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('b', 0)).toBe(true)
    expect(limiter.allow('a', 0)).toBe(false)
  })

  it('la ventana se reinicia cuando vence', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: VENTANA, maxKeys: 100 })
    expect(limiter.allow('ip', 0)).toBe(true)
    expect(limiter.allow('ip', 0)).toBe(true)
    expect(limiter.allow('ip', VENTANA - 1)).toBe(false)
    expect(limiter.allow('ip', VENTANA)).toBe(true)
  })

  it('las claves vencidas se van solas sin barrer el mapa', () => {
    const limiter = createRateLimiter({ max: 10, windowMs: VENTANA, maxKeys: 1000 })
    for (let i = 0; i < 50; i++) limiter.allow(`vieja-${i}`, 0)
    expect(limiter.size()).toBe(50)

    // Una clave nueva pasada la ventana limpia a las 50 de antes.
    limiter.allow('nueva', VENTANA)
    expect(limiter.size()).toBe(1)
  })

  it('nunca pasa el techo de claves: evicta la más vieja (FIFO)', () => {
    const limiter = createRateLimiter({ max: 10, windowMs: VENTANA, maxKeys: 5 })
    // Todas dentro de la misma ventana: acá no hay vencidas que limpiar, sólo
    // el techo duro (el caso de la IP rotada en cada pedido).
    for (let i = 0; i < 5_000; i++) limiter.allow(`ip-${i}`, 1)
    expect(limiter.size()).toBe(5)

    // La primera que entró ya no está; la última sí.
    expect(limiter.allow('ip-0', 1)).toBe(true)
    expect(limiter.size()).toBe(5)
  })

  it('con max en 0 no pasa nada', () => {
    const limiter = createRateLimiter({ max: 0, windowMs: VENTANA, maxKeys: 10 })
    expect(limiter.allow('ip', 0)).toBe(false)
  })
})

describe('clientIp', () => {
  it('prefiere x-real-ip, que lo pone nuestro nginx', () => {
    const headers = new Headers({ 'x-real-ip': '200.1.2.3', 'x-forwarded-for': '10.0.0.1, 200.1.2.3' })
    expect(clientIp(headers)).toBe('200.1.2.3')
  })

  it('sin x-real-ip usa el ÚLTIMO x-forwarded-for, no el primero', () => {
    // El primero es el que escribió el visitante: nginx agrega el suyo al final.
    const headers = new Headers({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8, 200.1.2.3' })
    expect(clientIp(headers)).toBe('200.1.2.3')
  })

  it('recorta espacios y descarta valores vacíos', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '  1.1.1.1 ,  200.1.2.3  ' }))).toBe('200.1.2.3')
    expect(clientIp(new Headers({ 'x-forwarded-for': '200.1.2.3, ,' }))).toBe('200.1.2.3')
    expect(clientIp(new Headers({ 'x-real-ip': '   ' , 'x-forwarded-for': '200.1.2.3' }))).toBe('200.1.2.3')
  })

  it('sin ninguno de los dos headers devuelve null', () => {
    expect(clientIp(new Headers())).toBeNull()
    expect(clientIp(new Headers({ 'x-forwarded-for': '  ,  ' }))).toBeNull()
  })
})

describe('originAllowed', () => {
  const HOST = 'vuelos.siviajo.com'

  it('acepta el beacon de la propia landing', () => {
    expect(originAllowed(new Headers({ 'sec-fetch-site': 'same-origin' }), HOST)).toBe(true)
    expect(originAllowed(new Headers({ 'sec-fetch-site': 'None' }), HOST)).toBe(true)
  })

  it('rechaza lo que venga de otra página', () => {
    expect(originAllowed(new Headers({ 'sec-fetch-site': 'cross-site' }), HOST)).toBe(false)
    expect(originAllowed(new Headers({ 'sec-fetch-site': 'same-site' }), HOST)).toBe(false)
  })

  it('sin sec-fetch-site cae al referer del host público', () => {
    expect(originAllowed(new Headers({ referer: 'https://vuelos.siviajo.com/vuelos-baratos/miami' }), HOST)).toBe(true)
    expect(originAllowed(new Headers({ referer: 'https://competidor.com/oferta' }), HOST)).toBe(false)
    expect(originAllowed(new Headers({ referer: 'no soy una url' }), HOST)).toBe(false)
  })

  it('sin sec-fetch-site ni referer (curl pelado) no pasa', () => {
    expect(originAllowed(new Headers(), HOST)).toBe(false)
  })

  it('sin host público configurado tampoco pasa por referer', () => {
    expect(originAllowed(new Headers({ referer: 'https://vuelos.siviajo.com/' }), '   ')).toBe(false)
  })
})
