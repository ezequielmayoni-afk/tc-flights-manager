/**
 * Normalización de texto compartida por el autocomplete de ciudades y la
 * resolución de aerolíneas por nombre.
 *
 * Vive en su propio módulo para que `airlines.ts` no tenga que importar
 * `cities.ts` (que arrastra las 2.044 filas del dataset de Travel Compositor).
 */

/**
 * Minúsculas sin acentos: en los datos conviven 'Cordoba' y 'Florianópolis',
 * y el que escribe nunca sabe cuál de las dos formas guardó el proveedor.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
