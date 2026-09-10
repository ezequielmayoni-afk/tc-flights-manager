import { describe, expect, it } from 'vitest'
import {
  DESC_MAX,
  SEO_TITLE_MAX,
  TITLE_BRAND,
  TITLE_BUDGET,
  TITLE_MAX,
  buildDestinationMeta,
  buildHomeMeta,
  seoYear,
  truncate,
} from '../seo-meta'

const HOY = new Date('2026-09-10T12:00:00.000Z')

/** Lo que termina viendo Google: el layout le pega la marca a todo título. */
function conMarca(title: string): string {
  return `${title}${TITLE_BRAND}`
}

describe('seoYear', () => {
  it('hasta octubre devuelve el año en curso', () => {
    expect(seoYear(HOY)).toBe(2026)
    expect(seoYear(new Date('2026-10-31T12:00:00.000Z'))).toBe(2026)
  })

  it('desde noviembre devuelve el que viene', () => {
    // El que busca en noviembre o diciembre está planeando el año nuevo.
    expect(seoYear(new Date('2026-11-01T12:00:00.000Z'))).toBe(2027)
    expect(seoYear(new Date('2026-12-20T12:00:00.000Z'))).toBe(2027)
  })

  it('mira el mes y el año en UTC, no el local', () => {
    // 31/10 a las 23:30 ART ya es 1/11 en UTC.
    expect(seoYear(new Date('2026-11-01T02:30:00.000Z'))).toBe(2027)
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
    { name: 'Río de Janeiro', minPrice: 304 },
    { name: 'Punta Cana', minPrice: 561 },
    { name: 'Miami', minPrice: 665 },
  ]

  it('arma el título con el origen y el año, y entra en 60 con la marca', () => {
    const { title } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(title).toBe('Vuelos baratos desde Buenos Aires · Pasajes 2026')
    expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('el título NO trae la marca: se la pone el template del layout', () => {
    const { title } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(title).not.toContain('Sí, Viajo')
  })

  it('con un origen largo suelta el año antes que pasarse con la marca', () => {
    const originName = 'San Miguel de Tucumán'
    const { title } = buildHomeMeta({ originName, top, now: HOY })
    expect(title).toBe('Vuelos baratos desde San Miguel de Tucumán')
    expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('la descripción cierra con el llamado a la acción y no se corta', () => {
    const { description } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(description.endsWith('Compará por mes y fecha y comprá en siviajo.com.')).toBe(true)
    expect(description).not.toContain('…')
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('mete todos los destinos que entren enteros, nunca una lista cortada', () => {
    const { description } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(description).toContain('Río de Janeiro desde US$ 304 y Punta Cana desde US$ 561.')
    // El tercero no entraba: se saltea entero, no queda 'y Miami desde…'.
    expect(description).not.toContain('Miami')
  })

  it('con un solo destino no mete ni coma ni "y"', () => {
    const { description } = buildHomeMeta({ originName: 'Córdoba', top: [{ name: 'Miami', minPrice: 665 }], now: HOY })
    expect(description).toContain('desde Córdoba: Miami desde US$ 665.')
    expect(description.endsWith('siviajo.com.')).toBe(true)
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('no repite siviajo.com: la home son dos frases, la lista y el cierre', () => {
    const { description } = buildHomeMeta({ originName: 'Buenos Aires', top, now: HOY })
    expect(description.split('siviajo.com').length - 1).toBe(1)
    expect(description.split('. ').length).toBe(2)
  })

  it('formatea los miles con punto', () => {
    const { description } = buildHomeMeta({ originName: 'Mendoza', top: [{ name: 'Madrid', minPrice: 1234.6 }], now: HOY })
    expect(description).toContain('Madrid desde US$ 1.235')
  })

  it('sin destinos con precio cae en el texto genérico, que también cierra en siviajo.com', () => {
    const { description } = buildHomeMeta({ originName: 'Buenos Aires', top: [], now: HOY })
    expect(description).toBe(
      'Los vuelos más baratos saliendo de Buenos Aires, por persona e ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.'
    )
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('sin destinos y con un origen largo también entra en 160', () => {
    const { description } = buildHomeMeta({ originName: 'Cataratas del Iguazú y alrededores', top: [], now: HOY })
    expect(description.startsWith('Los vuelos más baratos, por persona')).toBe(true)
    expect(description.endsWith('Elegí fecha y comprá en siviajo.com.')).toBe(true)
    expect(description).not.toContain('…')
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('con un origen imposible suelta la parte del origen antes que recortar', () => {
    const { description } = buildHomeMeta({
      originName: 'San Miguel de Tucumán y alrededores del norte argentino',
      top,
      now: HOY,
    })
    expect(description.startsWith('Ofertas de pasajes ida y vuelta: ')).toBe(true)
    expect(description.endsWith('siviajo.com.')).toBe(true)
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
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

  it('con precio suelta el año: no queda lugar para la marca', () => {
    // 'Vuelos baratos a X desde US$ NNN · Pasajes AAAA' + ' | Sí, Viajo' se
    // pasa de 60 con cualquier nombre real, así que el año cae y queda el
    // precio, que es el dato que hace que te clickeen.
    const { title } = buildDestinationMeta(base)
    expect(title).toBe('Vuelos baratos a Miami desde US$ 665')
    expect(conMarca(title)).toBe('Vuelos baratos a Miami desde US$ 665 | Sí, Viajo')
    expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('el año sí entra cuando no hay precio que poner', () => {
    const { title } = buildDestinationMeta({ ...base, name: 'Río', minPrice: null, pairs: 0 })
    expect(title).toBe('Vuelos baratos a Río · Pasajes 2026')
    expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('Rio de Janeiro entra sin el año', () => {
    const { title } = buildDestinationMeta({ ...base, name: 'Rio de Janeiro', minPrice: 304 })
    expect(title).toBe('Vuelos baratos a Rio de Janeiro desde US$ 304')
    expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('con un nombre imposible se queda con el precio aunque se pase', () => {
    const { title } = buildDestinationMeta({ ...base, name: 'Islas Malvinas del Sur Profundo y Alrededores Lejanos' })
    // Se pasa de 60, pero el precio es lo que hace que te clickeen: no se recorta.
    expect(title).toBe('Vuelos baratos a Islas Malvinas del Sur Profundo y Alrededores Lejanos desde US$ 665')
    expect(title).not.toContain('…')
  })

  it('el título de un nombre corto deja lugar para la marca', () => {
    const { title } = buildDestinationMeta({ ...base, name: 'Río', minPrice: 304 })
    expect(title.length).toBeLessThanOrEqual(TITLE_BUDGET)
  })

  it('sin precio no inventa un "desde"', () => {
    const { title, description } = buildDestinationMeta({ ...base, minPrice: null, pairs: 0 })
    expect(title).toBe('Vuelos baratos a Miami · Pasajes 2026')
    expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
    expect(description).toBe(
      'Vuelos a Miami desde Buenos Aires: precios por persona, ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.'
    )
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('sin precio y con un nombre largo suelta el origen antes que recortar', () => {
    const { description } = buildDestinationMeta({
      ...base,
      name: 'Cataratas del Iguazú y alrededores',
      minPrice: null,
      pairs: 0,
    })
    expect(description).toBe(
      'Vuelos a Cataratas del Iguazú y alrededores: precios por persona, ida y vuelta, actualizados todos los días. Elegí fecha y comprá en siviajo.com.'
    )
    expect(description).not.toContain('…')
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('la descripción abre con el precio y cierra con el llamado a la acción', () => {
    const { description } = buildDestinationMeta({ ...base, name: 'Río', originName: 'BUE', minPrice: 300, pairs: 12 })
    expect(description).toBe(
      'Pasajes a Río ida y vuelta desde BUE desde US$ 300 por persona. Compará 12 fechas. Elegí tu fecha y comprá en siviajo.com.'
    )
  })

  it('suma el mes más barato cuando entra', () => {
    const { description } = buildDestinationMeta({
      ...base,
      name: 'Río',
      originName: 'BUE',
      minPrice: 300,
      pairs: 12,
      cheapestMonth: { label: 'Marzo 2026', minPrice: 300 },
    })
    expect(description).toContain('El mes más barato es Marzo 2026 desde US$ 300.')
    expect(description.endsWith('Elegí tu fecha y comprá en siviajo.com.')).toBe(true)
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
    expect(description).toContain('Compará 1 fecha.')
  })

  it('la frase que no entra se saltea entera y el cierre queda igual', () => {
    const { description } = buildDestinationMeta({
      ...base,
      cheapestMonth: { label: 'Noviembre 2026', minPrice: 665 },
      directAvailable: true,
    })
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
    expect(description.startsWith('Pasajes a Miami ida y vuelta desde Buenos Aires desde US$ 665 por persona.')).toBe(true)
    expect(description.endsWith('Elegí tu fecha y comprá en siviajo.com.')).toBe(true)
    // La del mes no entraba; las cortas que venían atrás sí.
    expect(description).not.toContain('El mes más barato')
    expect(description).toContain('Hay vuelos directos.')
    expect(description).toContain('Compará 36 fechas.')
  })

  it('con un nombre larguísimo suelta la parte del origen antes que recortar', () => {
    const { description } = buildDestinationMeta({
      ...base,
      name: 'Islas Malvinas del Sur Profundo y Alrededores Lejanos',
      directAvailable: true,
      cheapestMonth: { label: 'Noviembre 2026', minPrice: 665 },
    })
    expect(description.startsWith('Pasajes a Islas Malvinas del Sur Profundo y Alrededores Lejanos ida y vuelta desde US$ 665')).toBe(true)
    expect(description.endsWith('siviajo.com.')).toBe(true)
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('le pone un techo a lo que viene cargado en la ficha', () => {
    const { title, description } = buildDestinationMeta({
      ...base,
      seoTitle: 'Vuelos baratos a Miami desde Buenos Aires en oferta todo el año con las mejores aerolíneas',
      seoDescription: 'Miami barato '.repeat(20),
    })
    expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('usa el seoTitle y la seoDescription de la ficha tal cual vienen', () => {
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
    expect(title).toBe('Vuelos baratos a Miami desde US$ 665')
    expect(description).toContain('Pasajes a Miami ida y vuelta desde Buenos Aires')
  })
})

describe('las descripciones reales de la landing', () => {
  const casos = [
    { name: 'Miami', minPrice: 665, pairs: 97, directAvailable: true, cheapestMonth: { label: 'Noviembre 2026', minPrice: 665 } },
    { name: 'Rio de Janeiro', minPrice: 304, pairs: 62, directAvailable: true, cheapestMonth: { label: 'Diciembre 2026', minPrice: 304 } },
    { name: 'Punta Cana', minPrice: 561, pairs: 48, directAvailable: false, cheapestMonth: { label: 'Marzo 2027', minPrice: 561 } },
    { name: 'Cancún', minPrice: 658, pairs: 51, directAvailable: true, cheapestMonth: null },
    { name: 'Madrid', minPrice: 904, pairs: 40, directAvailable: true, cheapestMonth: { label: 'Mayo 2027', minPrice: 904 } },
    {
      name: 'San Carlos de Bariloche y alrededores del sur',
      minPrice: 1234,
      pairs: 8,
      directAvailable: true,
      cheapestMonth: { label: 'Septiembre 2027', minPrice: 1234 },
    },
  ]

  it.each(casos)('$name cierra en siviajo.com y no pasa de 160', caso => {
    const { description } = buildDestinationMeta({ ...caso, originName: 'Buenos Aires', now: HOY })
    expect(description.endsWith('siviajo.com.')).toBe(true)
    expect(description).not.toContain('…')
    expect(description.length).toBeLessThanOrEqual(DESC_MAX)
  })

  it('la home cierra en siviajo.com desde cualquier ciudad', () => {
    const top = casos.slice(0, 3).map(c => ({ name: c.name, minPrice: c.minPrice }))
    for (const originName of ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza']) {
      const { title, description } = buildHomeMeta({ originName, top, now: HOY })
      expect(description.endsWith('siviajo.com.')).toBe(true)
      expect(description).not.toContain('…')
      expect(description.length).toBeLessThanOrEqual(DESC_MAX)
      expect(conMarca(title).length).toBeLessThanOrEqual(TITLE_MAX)
    }
  })
})
