import { describe, expect, it } from 'vitest'
import { formatDuration, frasesInsights, medianDurationMin } from '../insights'
import type { BestPair, MonthSummary } from '../types'

function pair(over: Partial<BestPair> = {}): BestPair {
  return {
    probeId: 1,
    routeId: 1,
    depart: '2026-11-10',
    return: '2026-11-24',
    nights: 14,
    pricePp: 665,
    currency: 'USD',
    airline: 'LATAM',
    airlineCode: 'LA',
    stopsOut: 0,
    stopsBack: 0,
    durationOutMin: 565,
    durationBackMin: 540,
    fareFamily: 'BASIC',
    checkedBag: false,
    carryOn: true,
    observedAt: '2026-09-10T03:00:00.000Z',
    ...over,
  }
}

function mes(month: string, label: string, minPrice: number | null): MonthSummary {
  return { month, label, minPrice, pairs: minPrice === null ? 0 : 1 }
}

const BASE = { destinationName: 'Miami', originName: 'Buenos Aires' }

describe('formatDuration', () => {
  it('parte las horas y los minutos', () => {
    expect(formatDuration(565)).toBe('9 h 25 m')
    expect(formatDuration(540)).toBe('9 h')
    expect(formatDuration(45)).toBe('45 m')
  })

  it('sin dato devuelve null', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(-30)).toBeNull()
  })
})

describe('medianDurationMin', () => {
  it('con cantidad impar devuelve el del medio', () => {
    expect(medianDurationMin([pair({ durationOutMin: 500 }), pair({ durationOutMin: 900 }), pair({ durationOutMin: 600 })])).toBe(600)
  })

  it('con cantidad par promedia los dos del medio', () => {
    expect(medianDurationMin([pair({ durationOutMin: 500 }), pair({ durationOutMin: 601 })])).toBe(551)
  })

  it('una escala larguísima no corre la mediana', () => {
    const pares = [pair({ durationOutMin: 560 }), pair({ durationOutMin: 570 }), pair({ durationOutMin: 2000 })]
    expect(medianDurationMin(pares)).toBe(570)
  })

  it('ignora las observaciones sin duración', () => {
    expect(medianDurationMin([pair({ durationOutMin: null }), pair({ durationOutMin: 600 })])).toBe(600)
    expect(medianDurationMin([pair({ durationOutMin: null })])).toBeNull()
    expect(medianDurationMin([])).toBeNull()
  })
})

describe('frasesInsights', () => {
  it('sin pares no dice nada', () => {
    expect(frasesInsights({ ...BASE, pairs: [], months: [] })).toEqual([])
  })

  it('con un solo par habla en singular y no inventa un rango', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair()],
      months: [mes('2026-11', 'Noviembre 2026', 665)],
    })
    expect(frases[0]).toBe(
      'La única combinación de fechas que sondeamos para volar a Miami desde Buenos Aires cuesta US$ 665 por persona, ida y vuelta.'
    )
    expect(frases.join(' ')).not.toContain('van de')
    expect(frases.join(' ')).not.toContain('Entre las')
  })

  it('con un solo par la última frase no repite el precio', () => {
    const frases = frasesInsights({ ...BASE, pairs: [pair()], months: [mes('2026-11', 'Noviembre 2026', 665)] })
    expect(frases[frases.length - 1]).toBe('Sale el 10/11/2026 y son 14 noches.')
  })

  it('con todos los pares al mismo precio no dice "van de X a X"', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair(), pair({ depart: '2026-11-17', return: '2026-12-01' }), pair({ depart: '2026-12-01', return: '2026-12-15' })],
      months: [mes('2026-11', 'Noviembre 2026', 665), mes('2026-12', 'Diciembre 2026', 665)],
    })
    expect(frases[0]).toBe(
      'Entre las 3 combinaciones de fechas que sondeamos, todos los pasajes a Miami desde Buenos Aires cuestan US$ 665 por persona, ida y vuelta.'
    )
  })

  it('con precios distintos arma el rango', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair({ pricePp: 665 }), pair({ depart: '2026-12-01', pricePp: 1376 })],
      months: [mes('2026-11', 'Noviembre 2026', 665), mes('2026-12', 'Diciembre 2026', 1376)],
    })
    expect(frases[0]).toBe(
      'Entre las 2 combinaciones de fechas que sondeamos, los pasajes a Miami desde Buenos Aires van de US$ 665 a US$ 1.376 por persona, ida y vuelta.'
    )
  })

  it('con un solo mes con precio lo dice, y con varios NO', () => {
    const uno = frasesInsights({ ...BASE, pairs: [pair()], months: [mes('2026-11', 'Noviembre 2026', 665), mes('2026-12', 'Diciembre 2026', null)] })
    expect(uno.join(' ')).toContain('Por ahora el único mes con precio confirmado es Noviembre 2026, desde US$ 665.')

    const varios = frasesInsights({
      ...BASE,
      pairs: [pair(), pair({ depart: '2026-12-01' })],
      months: [mes('2026-11', 'Noviembre 2026', 665), mes('2026-12', 'Diciembre 2026', 665)],
    })
    expect(varios.join(' ')).not.toContain('único mes')
  })

  it('con los meses empatados no inventa un mes más barato ni uno más caro', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair(), pair({ depart: '2026-12-01' }), pair({ depart: '2027-01-05' })],
      months: [
        mes('2026-11', 'Noviembre 2026', 665),
        mes('2026-12', 'Diciembre 2026', 665),
        mes('2027-01', 'Enero 2027', 665),
      ],
    })
    const texto = frases.join(' ')
    expect(texto).toContain('Los 3 meses con precio confirmado arrancan todos en US$ 665.')
    expect(texto).not.toContain('más barato')
    expect(texto).not.toContain('más caro')
    expect(texto).not.toContain('único mes')
  })

  it('con meses distintos nombra el más barato y el más caro', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair({ pricePp: 665 }), pair({ depart: '2027-01-05', pricePp: 1081 })],
      months: [mes('2026-11', 'Noviembre 2026', 665), mes('2027-01', 'Enero 2027', 1081)],
    })
    expect(frases.join(' ')).toContain(
      'El mes más barato para volar es Noviembre 2026, desde US$ 665; el más caro es Enero 2027, donde la tarifa más baja arranca en US$ 1.081.'
    )
  })

  it('nombra las aerolíneas que hacen los directos, no todas', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [
        pair({ airline: 'LATAM', stopsOut: 0, pricePp: 665 }),
        pair({ depart: '2026-11-17', airline: 'Copa Airlines', stopsOut: 1, pricePp: 700 }),
      ],
      months: [mes('2026-11', 'Noviembre 2026', 665)],
    })
    const directos = frases.find(f => f.startsWith('Hay vuelos directos'))
    expect(directos).toBe('Hay vuelos directos desde Buenos Aires con LATAM, desde US$ 665 por persona.')
    expect(directos).not.toContain('Copa')
  })

  it('sin directos lo dice sin prometer nada', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair({ stopsOut: 1 }), pair({ depart: '2026-11-17', stopsOut: 2 })],
      months: [mes('2026-11', 'Noviembre 2026', 665)],
    })
    expect(frases.join(' ')).toContain(
      'En las fechas que sondeamos no aparecen vuelos directos desde Buenos Aires: las opciones más baratas hacen al menos una escala.'
    )
  })

  it('sin duraciones se saltea la frase de la duración', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair({ durationOutMin: null }), pair({ depart: '2026-11-17', durationOutMin: null })],
      months: [mes('2026-11', 'Noviembre 2026', 665)],
    })
    expect(frases.join(' ')).not.toContain('La ida típica dura')
  })

  it('devuelve entre 3 y 5 frases, todas terminadas en punto', () => {
    const frases = frasesInsights({
      ...BASE,
      pairs: [pair({ pricePp: 665 }), pair({ depart: '2027-01-05', pricePp: 1081 })],
      months: [mes('2026-11', 'Noviembre 2026', 665), mes('2027-01', 'Enero 2027', 1081)],
    })
    expect(frases.length).toBeGreaterThanOrEqual(3)
    expect(frases.length).toBeLessThanOrEqual(5)
    for (const frase of frases) expect(frase.endsWith('.')).toBe(true)
  })
})
