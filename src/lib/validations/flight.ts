import { z } from 'zod'

export const flightSegmentSchema = z.object({
  departure_location_code: z.string().min(2).max(4),
  arrival_location_code: z.string().min(2).max(4),
  departure_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  arrival_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  plus_days: z.number().int().min(0).default(0),
  duration_time: z.string().optional(),
  model: z.string().optional(),
  num_service: z.string().optional(),
  sort_order: z.number().int().default(0),
  leg_type: z.enum(['outbound', 'return']).default('outbound'), // Ida o Vuelta
})

export const flightDatasheetSchema = z.object({
  language: z.string().min(2).max(5),
  name: z.string().optional(),
  description: z.string().optional(),
})

export const flightCancellationSchema = z.object({
  days: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
})

export const modalitySchema = z.object({
  code: z.string().min(1, 'Código de modalidad requerido'),
  active: z.boolean().default(true),
  cabin_class_type: z.string().min(1, 'Tipo de cabina requerido'),
  includes_backpack: z.boolean().default(false),
  carryon_weight: z.number().int().min(0).default(0),
  checked_bag_weight: z.number().int().min(0).default(0),
  checked_bags_quantity: z.number().int().min(0).default(1),
  min_passengers: z.number().int().min(1).default(1),
  max_passengers: z.number().int().min(1).default(10),
  on_request: z.boolean().default(false),
  quantity: z.number().int().min(0).default(0),
})

export const flightFormSchema = z.object({
  supplier_id: z.number().int().min(1, 'Proveedor es requerido'),
  base_id: z.string().min(1, 'ID base es requerido'),
  name: z.string().min(1, 'Nombre es requerido'),
  airline_code: z.string().min(2).max(3, 'Código de aerolínea inválido'),
  transport_type: z.string().default('PLANE'),
  active: z.boolean().default(true),
  price_per_pax: z.boolean().default(true),
  currency: z.string().default('USD'),

  // Precios OW
  base_adult_price: z.number().min(0).default(0),
  base_children_price: z.number().min(0).default(0),
  base_infant_price: z.number().min(0).default(0),

  // Precios RT
  base_adult_rt_price: z.number().min(0).default(0),
  base_children_rt_price: z.number().min(0).default(0),
  base_infant_rt_price: z.number().min(0).default(0),

  // Impuestos OW
  adult_taxes_amount: z.number().min(0).default(0),
  children_taxes_amount: z.number().min(0).default(0),
  infant_taxes_amount: z.number().min(0).default(0),

  // Impuestos RT
  adult_rt_taxes_amount: z.number().min(0).default(0),
  children_rt_taxes_amount: z.number().min(0).default(0),
  infant_rt_taxes_amount: z.number().min(0).default(0),

  // Fechas por tramo (una fecha fija por cada leg)
  outbound_date: z.string().min(1, 'Fecha de ida es requerida'),
  return_date: z.string().min(1, 'Fecha de vuelta es requerida'),
  release_contract: z.number().int().min(0).default(0),

  // Configuración - días operacionales por tramo
  outbound_operational_days: z.array(z.string()).default([]),
  return_operational_days: z.array(z.string()).default([]),
  option_codes: z.array(z.string()).default([]),
  only_holiday_package: z.boolean().default(true),
  show_in_transport_quotas_landing: z.boolean().default(true),

  // Edades
  min_child_age: z.number().int().min(0).default(2),
  max_child_age: z.number().int().min(0).default(11),
  min_infant_age: z.number().int().min(0).default(0),
  max_infant_age: z.number().int().min(0).default(2),

  // Permisos (siempre RT, nunca OW)
  allow_ow_price: z.boolean().default(false),
  allow_rt_price: z.boolean().default(true),

  // Tipos de producto
  product_types: z.array(z.string()).default(['ONLY_FLIGHT', 'FLIGHT_HOTEL', 'MULTI', 'MAGIC_BOX', 'ROUTING']),

  // Contratos combinables
  combinable_rt_contracts: z.array(z.string()).default([]),

  // Relaciones
  segments: z.array(flightSegmentSchema).min(1, 'Al menos un segmento es requerido'),
  datasheets: z.array(flightDatasheetSchema).default([]),
  cancellations: z.array(flightCancellationSchema).default([]),

  // Modalidad (opcional - si no se provee, se crea una por defecto al sincronizar)
  modality: modalitySchema.optional(),
})

// Input types (for forms - fields with defaults are optional)
export type FlightFormData = z.input<typeof flightFormSchema>
export type FlightSegmentData = z.input<typeof flightSegmentSchema>
export type FlightDatasheetData = z.input<typeof flightDatasheetSchema>
export type FlightCancellationData = z.input<typeof flightCancellationSchema>
export type ModalityData = z.input<typeof modalitySchema>

// Output types (for API - all fields are required after parsing)
export type FlightFormOutput = z.output<typeof flightFormSchema>
export type FlightSegmentOutput = z.output<typeof flightSegmentSchema>
export type ModalityOutput = z.output<typeof modalitySchema>
