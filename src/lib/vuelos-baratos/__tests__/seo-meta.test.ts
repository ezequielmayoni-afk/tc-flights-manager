import { describe, expect, it } from 'vitest'
import { DESC_MAX, TITLE_MAX, buildDestinationMeta, buildHomeMeta, seoYear, truncate } from '../seo-meta'

const HOY = new Date('2026-09-10T12:00:00.000Z')

describe('seoYear', () => {
  it('devuelve el año en curso', () => {
    expect(seoYear(HOY)).toBe(2026)
  })

  it('mira el año en UTC, no el local', () => {
    // 31/12 a las 23:30 ART ya es 1/1 en UTC: el título tiene que decir el año nuevo.
    expect(seoYear(new Date('2027-01-01T02:30:00.000Z'))).toBe(2027)
  })
})

describe('truncate', () => {
  it('deja el texto igual si entra', () => {
    expect(truncate('Vuelos baratos a Miami', 60)).toBe('Vuelos baratos a Miami')
  })

  it('no agrega puntos suspensivos cuando mide justo el máximo', () => {
    const texto = 'Vuelos baratos'
    expect(truncate(texto, texto.length)).toBe(texto)
  })

  it('corta en límite de palabra y agrega el puntito', () => {
    expect(truncate('Precios de vuelos baratos a Miami', 20)).toBe('Precios de vuelos…')
  })

  it('nunca devuelve más de max caracteres', () => {
    const largo = 'Pasajes a Miami ida y vuelta desde Buenos Aires desde US$ 665 por persona.'
    for (const max of [1, 5, 12, 30, 73]) {
      expect(truncate(largo, max).length).toBeLessThanOrEqual(max)
    }
  })

  it('se come la puntuación que queda colgando antes del puntito', () => {
    expect(truncate('Miami, Madrid y Río de Janeiro', 8)).toBe('Miami…')
  })

  it('corta duro una palabra sola más larga que el máximo', () => {
    expect(truncate('Supercalifragilisticoespialidoso', 10)).toBe('Supercali…')
  })

  it('un máximo de cero devuelve vacío', () => {
    expect(truncate('Vuelos', 0)).toBe('')
  })
})

describe('buildHomeMeta', () => {
  const top = [
    { name: 'Miami', minPrice: 665 },
    { name: 'Madrid', minPrice: 904 },
    { name: 'Río', minPrice: 304 },
  ]

  it('arma el título con el origen y el año', () => {
    const { title } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(title).toBe('Vuelos baratos desde Buenos Aires · Pasajes 2026')
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('lista los destinos con "y" antes del último', () => {
    const { description } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(description.startsWith('Ofertas de pasajes ida y vuelta desde Buenos Aires: Miami desde US$ 665, Madrid desde US$ 904 y Río desde US$ 304.')).toBe(
      true
    )
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('con un solo destino no mete ni coma ni "y"', () => {
    const { description } = buildHomeMeta({ originName: 'Córdoba', top: [{ name: 'Miami', minPrice: 665 }], now: HOY })
    expect(description).toContain('desde Córdoba: Miami desde US$ 665. Precios por persona encontrados hoy en siviajo.com.')
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('con dos destinos usa sólo la "y"', () => {
    const { description } = buildHomeMeta({
      originName: 'Rosario',
      top: [
        { name: 'Miami', minPrice: 665 },
        { name: 'Madrid', minPrice: 904 },
      ],
      now: HOY,
    })
    expect(description).toContain('Miami desde US$ 665 y Madrid desde US$ 904.')
  })

  it('formatea los miles con punto', () => {
    const { description } = buildHomeMeta({ originName: 'Mendoza', top: [{ name: 'Madrid', minPrice: 1234.6 }], now: HOY })
    expect(description).toContain('Madrid desde US$ 1.235')
  })

  it('sin destinos con precio cae en el texto genérico', () => {
    const { description } = buildHomeMeta({ originName: 'Buenos Aires', top: [], now: HOY })
    expect(description).toBe(
      'Los vuelos más baratos saliendo de Buenos Aires, por persona e ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.'
    )
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('con un origen larguísimo suelta el año antes que pasarse de 60', () => {
    const originName = 'San Miguel de Tucumán y alrededores del norte argentino'
    const { title } = buildHomeMeta({ originName, top, now: HOY })
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(title).not.toContain('Pasajes 2026')
  })
})

describe('buildDestinationMeta', () => {
  const base = {
    name: 'Miami',
    originName: 'Buenos Aires',
    minPrice: 665,
    cheapestMonth: null,
    pairs: 36,
    directAvailable: false,
    now: HOY,
  }

  it('arma el título con precio y año', () => {
    const { title } = buildDestinationMeta(base)
    expect(title).toBe('Vuelos baratos a Miami desde US$ 665 · Pasajes 2026')
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('suelta el año cuando el nombre y el precio no dejan lugar', () => {
    const { title } = buildDestinationMeta({ ...base, name: 'Rio de Janeiro', minPrice: 1234 })
    expect(title).toBe('Vuelos baratos a Rio de Janeiro desde US$ 1.234')
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('recorta el título incluso con un nombre imposible', () => {
    const { title } = buildDestinationMeta({ ...base, name: 'Islas Malvinas del Sur Profundo y Alrededores Lejanos' })
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
  })

  it('sin precio no inventa un "desde"', () => {
    const { title, description } = buildDestinationMeta({ ...base, minPrice: null, pairs: 0 })
    expect(title).toBe('Vuelos baratos a Miami · Pasajes 2026')
    expect(description).toBe(
      'Vuelos a Miami desde Buenos Aires: precios por persona, ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.'
    )
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('la descripción abre con el precio y cierra con el llamado a la acción', () => {
    const { description } = buildDestinationMeta({ ...base, name: 'Río', originName: 'BUE', minPrice: 300, pairs: 12 })
    expect(description).toBe(
      'Pasajes a Río ida y vuelta desde BUE desde US$ 300 por persona. Compará 12 fechas y comprá en siviajo.com.'
    )
  })

  it('suma el mes más barato cuando lo hay', () => {
    const { description } = buildDestinationMeta({
      ...base,
      name: 'Río',
      originName: 'BUE',
      minPrice: 300,
      pairs: 12,
      cheapestMonth: { label: 'Marzo 2026', minPrice: 300 },
    })
    expect(description).toContain('El mes más barato es Marzo 2026 desde US$ 300.')
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('avisa los directos sólo si los hay', () => {
    const conDirectos = buildDestinationMeta({
      ...base,
      name: 'Río',
      originName: 'BUE',
      minPrice: 300,
      pairs: 12,
      directAvailable: true,
    })
    expect(conDirectos.description).toContain('Hay vuelos directos.')
    expect(buildDestinationMeta({ ...base, name: 'Río', originName: 'BUE', minPrice: 300, pairs: 12 }).description).not.toContain(
      'directos'
    )
  })

  it('una sola fecha se dice en singular', () => {
    const { description } = buildDestinationMeta({ ...base, name: 'Río', originName: 'BUE', minPrice: 300, pairs: 1 })
    expect(description).toContain('Compará 1 fecha y comprá en siviajo.com.')
  })

  it('la descripción nunca pasa de 160 aunque estén todas las frases', () => {
    const { description } = buildDestinationMeta({
      ...base,
      cheapestMonth: { label: 'Noviembre 2026', minPrice: 665 },
      directAvailable: true,
    })
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
    expect(description.startsWith('Pasajes a Miami ida y vuelta desde Buenos Aires desde US$ 665 por persona.')).toBe(true)
  })

  it('usa el seoTitle y la seoDescription de la ficha cuando están cargados', () => {
    const { title, description } = buildDestinationMeta({
      ...base,
      seoTitle: 'Vuelos a Miami en oferta',
      seoDescription: 'Los mejores pasajes a Miami, elegidos a mano.',
    })
    expect(title).toBe('Vuelos a Miami en oferta')
    expect(description).toBe('Los mejores pasajes a Miami, elegidos a mano.')
  })

  it('un seoTitle vacío no pisa al calculado', () => {
    const { title, description } = buildDestinationMeta({ ...base, seoTitle: '   ', seoDescription: '' })
    expect(title).toBe('Vuelos baratos a Miami desde US$ 665 · Pasajes 2026')
    expect(description).toContain('Pasajes a Miami ida y vuelta desde Buenos Aires')
  })

  it('recorta también lo que viene de la ficha', () => {
    const { title, description } = buildDestinationMeta({
      ...base,
      seoTitle: 'Vuelos baratos a Miami desde Buenos Aires en oferta todo el año con las mejores aerolíneas',
      seoDescription: 'Miami '.repeat(40),
    })
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })
})
