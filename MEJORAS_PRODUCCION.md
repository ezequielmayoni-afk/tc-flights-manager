# Plan de Mejoras para Producción - HUB Sí, Viajo

> **IMPORTANTE**: Este documento es una guía paso a paso. Cada mejora está diseñada para ser independiente y no romper funcionalidad existente. Marcar con ✅ cuando esté completado.

---

## Resumen Ejecutivo

| Fase | Descripción | Riesgo | Tiempo Est. |
|------|-------------|--------|-------------|
| 1 | Seguridad Crítica | Bajo | 1 día |
| 2 | Integridad de Datos | Medio | 1-2 días |
| 3 | Optimización Meta Ads | Bajo | 2-3 días |
| 4 | Optimización Drive/Creatives | Bajo | 1 día |
| 5 | Manejo de Errores | Bajo | 1-2 días |
| 6 | Logging y Monitoreo | Bajo | 1 día |

---

# FASE 1: SEGURIDAD CRÍTICA

> **Objetivo**: Proteger endpoints expuestos sin cambiar lógica de negocio
> **Riesgo**: BAJO - Solo agrega validaciones, no modifica funcionalidad

## 1.1 Webhook TravelCompositor - Validación de Firma

**Archivo**: `src/app/api/webhooks/tc/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20

**Problema actual**:
```typescript
// Línea 353-360 - Cualquiera puede enviar POST
export async function POST(request: NextRequest) {
  const notification: TCWebhookNotification = await request.json()
  // Sin validación de origen
}
```

**Solución propuesta**:
```typescript
export async function POST(request: NextRequest) {
  // 1. Validar secret en header
  const webhookSecret = request.headers.get('x-tc-webhook-secret')
  const expectedSecret = process.env.TC_WEBHOOK_SECRET

  if (!expectedSecret) {
    console.error('[TC Webhook] TC_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (webhookSecret !== expectedSecret) {
    console.warn('[TC Webhook] Intento de acceso no autorizado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Continúa con lógica existente...
  const notification: TCWebhookNotification = await request.json()
}
```

**Variables de entorno a agregar**:
```env
TC_WEBHOOK_SECRET=<generar-secret-seguro>
```

**Test manual**:
1. Sin header → debe devolver 401
2. Con header incorrecto → debe devolver 401
3. Con header correcto → debe funcionar normal

---

## 1.2 Cron Jobs - Fix Auth Bypass

**Archivo**: `src/app/api/cron/refresh-packages/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20

**Problema actual** (Línea 271-279):
```typescript
// BUG: Si CRON_SECRET no está seteado, pasa el check
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Solución propuesta**:
```typescript
// CORREGIDO: Falla si no hay secret configurado
const authHeader = request.headers.get('authorization')
const cronSecret = process.env.CRON_SECRET

if (!cronSecret) {
  console.error('[Cron] CRON_SECRET no configurado')
  return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
}

if (authHeader !== `Bearer ${cronSecret}`) {
  console.warn('[Cron] Intento de acceso no autorizado')
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Archivos adicionales a revisar**:
- [ ] `src/app/api/cron/sync-flights/route.ts` (si existe)
- [ ] Cualquier otro archivo en `src/app/api/cron/`

---

## 1.3 Variables de Entorno - Validación al Inicio

**Archivo nuevo**: `src/lib/config/env.ts`

**Estado**: [x] COMPLETADO - 2025-01-20

**Crear archivo de validación**:
```typescript
// src/lib/config/env.ts

type RequiredEnvVars = {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string

  // Meta Ads
  META_ACCESS_TOKEN: string
  META_AD_ACCOUNT_ID: string
  META_PAGE_ID: string

  // Google
  GOOGLE_DRIVE_CREDENTIALS: string
  GOOGLE_DRIVE_FOLDER_ID: string

  // OpenAI
  OPENAI_API_KEY: string

  // TravelCompositor
  TC_API_BASE_URL: string
  TC_MICROSITE_ID: string
  TC_USERNAME: string
  TC_PASSWORD: string
}

type OptionalEnvVars = {
  META_INSTAGRAM_USER_ID?: string
  GOOGLE_CLOUD_PROJECT_ID?: string
  GOOGLE_CLOUD_LOCATION?: string
  TC_WEBHOOK_SECRET?: string
  CRON_SECRET?: string
}

function validateEnv(): RequiredEnvVars & OptionalEnvVars {
  const required: (keyof RequiredEnvVars)[] = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'META_ACCESS_TOKEN',
    'META_AD_ACCOUNT_ID',
    'META_PAGE_ID',
    'GOOGLE_DRIVE_CREDENTIALS',
    'GOOGLE_DRIVE_FOLDER_ID',
    'OPENAI_API_KEY',
    'TC_API_BASE_URL',
    'TC_MICROSITE_ID',
    'TC_USERNAME',
    'TC_PASSWORD',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno faltantes: ${missing.join(', ')}\n` +
      `Revisar archivo .env.local`
    )
  }

  return process.env as unknown as RequiredEnvVars & OptionalEnvVars
}

export const env = validateEnv()
```

**Uso** (reemplazar gradualmente):
```typescript
// Antes
const token = process.env.META_ACCESS_TOKEN!

// Después
import { env } from '@/lib/config/env'
const token = env.META_ACCESS_TOKEN
```

---

## 1.4 Eliminar Hardcoded Fallbacks Peligrosos

**Archivo**: `src/app/api/meta/ads/route.ts` y `src/app/api/meta/ads/update/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20

**Problema actual** (Línea 14):
```typescript
const INSTAGRAM_USER_ID = process.env.META_INSTAGRAM_USER_ID || '17841402151140160'
// Si no está configurado, usa una cuenta hardcodeada (posiblemente incorrecta)
```

**Solución propuesta**:
```typescript
const INSTAGRAM_USER_ID = process.env.META_INSTAGRAM_USER_ID

// Validar al usar, no silenciosamente fallback
function getInstagramUserId(): string {
  if (!INSTAGRAM_USER_ID) {
    throw new Error('META_INSTAGRAM_USER_ID no configurado')
  }
  return INSTAGRAM_USER_ID
}
```

---

# FASE 2: INTEGRIDAD DE DATOS

> **Objetivo**: Prevenir datos corruptos y race conditions
> **Riesgo**: MEDIO - Requiere testing cuidadoso

## 2.1 Race Condition en Inventario

**Archivo**: `src/app/api/webhooks/tc/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Función SQL atómica `update_inventory_atomic` con FOR UPDATE)

**Problema actual** (Líneas 55-154):
```typescript
// Dos requests simultáneas pueden leer el mismo valor
const { data: modalities } = await db
  .from('modalities')
  .select('id, modality_inventories(id, sold, quantity)')

const inventory = modality.modality_inventories?.[0]
const newSold = (inventory.sold || 0) + passengersDelta

// RACE: Entre read y update, otro request puede modificar
await db
  .from('modality_inventories')
  .update({ sold: newSold })
  .eq('id', inventory.id)
```

**Solución propuesta - Opción A (Supabase RPC)**:

1. Crear función SQL en Supabase:
```sql
-- Ejecutar en Supabase SQL Editor
CREATE OR REPLACE FUNCTION update_inventory_atomic(
  p_inventory_id bigint,
  p_delta integer
) RETURNS integer AS $$
DECLARE
  v_new_sold integer;
BEGIN
  UPDATE modality_inventories
  SET sold = GREATEST(0, sold + p_delta)
  WHERE id = p_inventory_id
  RETURNING sold INTO v_new_sold;

  RETURN v_new_sold;
END;
$$ LANGUAGE plpgsql;
```

2. Usar en código:
```typescript
// Reemplazar el update por:
const { data: newSold, error } = await db.rpc('update_inventory_atomic', {
  p_inventory_id: inventory.id,
  p_delta: passengersDelta
})
```

**Solución propuesta - Opción B (Más simple, menos robusta)**:
```typescript
// Usar .select() después del update para verificar
const { data: updated, error } = await db
  .from('modality_inventories')
  .update({ sold: db.raw(`GREATEST(0, sold + ${passengersDelta})`) })
  .eq('id', inventory.id)
  .select('sold')
  .single()
```

---

## 2.2 Transacciones en Creación de Vuelos

**Archivo**: `src/app/api/flights/import/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Función SQL `create_flight_with_relations` transaccional)

**Problema actual** (Líneas 216-286):
```typescript
// Si falla el vuelo de vuelta, queda el de ida huérfano
const outboundResult = await createSingleFlight(...)
const returnResult = await createSingleFlight(...)

if (!returnResult.success) {
  // Intenta rollback pero puede fallar también
  await db.from('flights').delete().eq('id', outboundResult.flight!.id)
}
```

**Solución propuesta**:
```typescript
// Usar transacción de Supabase
const { data, error } = await db.rpc('create_round_trip_flight', {
  p_outbound_data: outboundData,
  p_return_data: returnData
})

// O alternativamente, marcar como "pending" hasta confirmar ambos
const outboundResult = await createSingleFlight({
  ...outboundData,
  status: 'pending_confirmation'
})

const returnResult = await createSingleFlight({
  ...returnData,
  status: 'pending_confirmation'
})

if (outboundResult.success && returnResult.success) {
  // Confirmar ambos
  await db.from('flights')
    .update({ status: 'active' })
    .in('id', [outboundResult.flight.id, returnResult.flight.id])
} else {
  // Limpiar ambos si alguno falló
  const idsToDelete = [
    outboundResult.flight?.id,
    returnResult.flight?.id
  ].filter(Boolean)

  if (idsToDelete.length > 0) {
    await db.from('flights').delete().in('id', idsToDelete)
  }
}
```

---

## 2.3 Validación de Precios TC

**Archivo**: `src/lib/travelcompositor/client.ts` y `src/app/api/webhooks/tc/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Función `validateTransportPrice` con tolerancia configurable)

**Problema actual**:
```typescript
const newPrice = tcPackage.pricePerPerson.amount  // Puede ser null/NaN
const varianceAmount = newPrice - oldPrice        // NaN si newPrice es NaN
```

**Solución propuesta**:
```typescript
function validatePrice(price: unknown): number | null {
  if (price === null || price === undefined) return null
  const numPrice = Number(price)
  if (isNaN(numPrice) || !isFinite(numPrice) || numPrice < 0) return null
  return numPrice
}

const newPrice = validatePrice(tcPackage.pricePerPerson?.amount)

if (newPrice === null) {
  console.warn(`[Refresh] Precio inválido para paquete ${tcPackage.id}`)
  // Decidir: saltar este paquete o usar precio anterior
  continue
}

const varianceAmount = newPrice - oldPrice
const variancePct = oldPrice > 0 ? (varianceAmount / oldPrice) * 100 : 0
```

---

# FASE 3: OPTIMIZACIÓN META ADS API

> **Objetivo**: Reducir llamadas a API y mejorar performance
> **Riesgo**: BAJO - Optimizaciones que no cambian comportamiento

## 3.1 Cache para Campañas y AdSets

**Archivo nuevo**: `src/lib/cache/meta-cache.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (SimpleCache con TTL configurable)

**Implementación**:
```typescript
// src/lib/cache/meta-cache.ts

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>()

  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}

export const metaCache = new SimpleCache()

// Keys
export const CACHE_KEYS = {
  campaigns: 'meta:campaigns',
  adsets: 'meta:adsets',
  adsetsByCampaign: (id: string) => `meta:adsets:${id}`,
}
```

**Uso en client.ts**:
```typescript
// En getCampaigns()
async getCampaigns(): Promise<MetaAPICampaign[]> {
  const cached = metaCache.get<MetaAPICampaign[]>(CACHE_KEYS.campaigns)
  if (cached) return cached

  const result = await this.request<{data: MetaAPICampaign[]}>(`/${this.adAccountId}/campaigns?...`)

  metaCache.set(CACHE_KEYS.campaigns, result.data, 5 * 60 * 1000) // 5 min TTL
  return result.data
}
```

---

## 3.2 Timeouts en Llamadas Externas

**Archivo**: `src/lib/meta-ads/client.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (AbortController con timeout configurable)

**Problema actual** (Línea 54-82):
```typescript
private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(fullUrl, {
    ...options,
    headers: {...},
    // SIN TIMEOUT
  })
}
```

**Solución propuesta**:
```typescript
private async request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {...},
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      // manejo de error existente...
    }

    return await response.json()
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Meta API timeout después de ${timeoutMs}ms: ${endpoint}`)
    }

    throw error
  }
}
```

---

## 3.3 Batch Video Thumbnails

**Archivo**: `src/lib/meta-ads/client.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Procesamiento paralelo con Promise.all y cache)

**Problema actual** (Líneas 343-371):
```typescript
// Una llamada por cada video
for (const videoId of videoIds) {
  const response = await this.request<{...}>(`/${videoId}?fields=thumbnails`)
}
```

**Solución propuesta**:
```typescript
async getVideoThumbnails(videoIds: string[]): Promise<Record<string, string>> {
  if (videoIds.length === 0) return {}

  const result: Record<string, string> = {}

  // Procesar en batches de 50 (límite de Meta)
  const batchSize = 50
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)

    // Usar batch endpoint de Meta
    const batchRequests = batch.map(id => ({
      method: 'GET',
      relative_url: `${id}?fields=thumbnails`
    }))

    try {
      const responses = await this.request<any[]>('/', {
        method: 'POST',
        body: JSON.stringify({ batch: batchRequests })
      })

      for (const resp of responses) {
        if (resp.code === 200) {
          const body = JSON.parse(resp.body)
          if (body.thumbnails?.data?.[0]?.uri) {
            result[body.id] = body.thumbnails.data[0].uri
          }
        }
      }
    } catch (error) {
      console.warn('[Meta] Error en batch thumbnails:', error)
    }
  }

  return result
}
```

---

## 3.4 Deduplicación de Creatives en Request

**Archivo**: `src/lib/meta-ads/creative-uploader.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Cache en memoria con TTL en getPackageCreatives)

**Problema actual** (Líneas 86-189):
```typescript
// Por cada paquete, re-checkea Drive
for (const pkgConfig of packages) {
  const driveCreatives = await getPackageCreatives(pkg.tc_package_id)
  // ... upload si cambió
}
```

**Solución propuesta**:
```typescript
// Cachear creatives de Drive por request
const driveCreativesCache = new Map<number, DriveCreativeInfo[]>()

async function getCachedDriveCreatives(tcPackageId: number): Promise<DriveCreativeInfo[]> {
  if (driveCreativesCache.has(tcPackageId)) {
    return driveCreativesCache.get(tcPackageId)!
  }

  const creatives = await getPackageCreatives(tcPackageId)
  driveCreativesCache.set(tcPackageId, creatives)
  return creatives
}

// Usar en el loop
for (const pkgConfig of packages) {
  const driveCreatives = await getCachedDriveCreatives(pkg.tc_package_id)
}
```

---

## 3.5 Reducir Over-fetching en Lista de Paquetes

**Archivo**: `src/app/api/packages/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Parámetro `?include=full` para relaciones)

**Problema actual** (Líneas 45-53):
```typescript
// Trae TODAS las relaciones aunque solo muestre lista
.select(`
  *,
  package_destinations (*),
  package_transports (*),
  package_hotels (*)
`)
```

**Solución propuesta**:
```typescript
// Parámetro para controlar nivel de detalle
const includeRelations = searchParams.get('include') === 'full'

let selectQuery = `
  id, tc_package_id, title, current_price_per_pax, currency,
  departure_date, date_range_start, date_range_end,
  nights_count, adults_count, status, marketing_status,
  ads_created_count, image_url, created_at
`

if (includeRelations) {
  selectQuery = `
    *,
    package_destinations (*),
    package_transports (*),
    package_hotels (*)
  `
}

query = query.select(selectQuery, { count: 'exact' })
```

---

# FASE 4: OPTIMIZACIÓN DRIVE/CREATIVES

> **Objetivo**: Mejorar manejo de archivos y uploads
> **Riesgo**: BAJO

## 4.1 Retry con Backoff para Uploads

**Archivo**: `src/lib/meta-ads/creative-uploader.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Función `withRetry` con backoff exponencial)

**Implementación**:
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`[Retry] Intento ${attempt + 1} falló, reintentando en ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// Uso en uploadCreativeToMeta
export async function uploadCreativeToMeta(creative: DriveCreativeInfo): Promise<MetaUploadResult | null> {
  return withRetry(async () => {
    const fileBuffer = await downloadFromDrive(creative.driveFileId)

    if (creative.type === 'image') {
      const hash = await metaClient.uploadImage(fileBuffer, creative.filename)
      return { type: 'image', hash, videoId: null }
    } else {
      const videoId = await metaClient.uploadVideo(fileBuffer, creative.filename)
      return { type: 'video', hash: null, videoId }
    }
  }, 3, 2000)
}
```

---

## 4.2 Validación de Archivos Antes de Upload

**Archivo**: `src/lib/meta-ads/creative-uploader.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Función `validateCreativeFile` con magic bytes)

**Implementación**:
```typescript
interface FileValidation {
  valid: boolean
  error?: string
}

function validateCreativeFile(
  buffer: Buffer,
  filename: string,
  type: 'image' | 'video'
): FileValidation {
  // Tamaño máximo
  const maxImageSize = 30 * 1024 * 1024  // 30MB
  const maxVideoSize = 4 * 1024 * 1024 * 1024  // 4GB
  const maxSize = type === 'image' ? maxImageSize : maxVideoSize

  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `Archivo muy grande: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (máx: ${maxSize / 1024 / 1024}MB)`
    }
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'Archivo vacío' }
  }

  // Validar magic bytes para tipo
  if (type === 'image') {
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45

    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return { valid: false, error: 'Formato de imagen no soportado' }
    }
  }

  return { valid: true }
}
```

---

# FASE 5: MANEJO DE ERRORES

> **Objetivo**: Errores claros y recuperación graceful
> **Riesgo**: BAJO

## 5.1 Error Boundaries en React

**Archivo nuevo**: `src/components/error-boundary.tsx`

**Estado**: [x] COMPLETADO - 2025-01-20 (Componente `ErrorBoundary` + wrapper en dashboard layout)

**Implementación**:
```typescript
'use client'

import { Component, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-lg font-semibold mb-2">Algo salió mal</h2>
          <p className="text-muted-foreground mb-4">
            {this.state.error?.message || 'Error inesperado'}
          </p>
          <Button onClick={() => this.setState({ hasError: false })}>
            Reintentar
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
```

**Uso en layout**:
```typescript
// src/app/(dashboard)/layout.tsx
import { ErrorBoundary } from '@/components/error-boundary'

export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  )
}
```

---

## 5.2 Sanitizar Errores en Responses

**Archivo nuevo**: `src/lib/api/errors.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Clase `ApiError`, `handleApiError`, `errorResponse`)

**Implementación**:
```typescript
// src/lib/api/errors.ts

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleApiError(error: unknown): {
  message: string
  status: number
  code?: string
} {
  // Errores conocidos
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.statusCode,
      code: error.code
    }
  }

  // Errores de Supabase
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as { code: string; message: string }

    // No exponer detalles de DB
    if (dbError.code === '23505') {
      return { message: 'El registro ya existe', status: 409, code: 'DUPLICATE' }
    }
    if (dbError.code === '23503') {
      return { message: 'Referencia inválida', status: 400, code: 'INVALID_REF' }
    }
  }

  // Error genérico - loguear internamente pero no exponer
  console.error('[API Error]', error)

  return {
    message: 'Error interno del servidor',
    status: 500,
    code: 'INTERNAL_ERROR'
  }
}

// Helper para responses
export function errorResponse(error: unknown) {
  const { message, status, code } = handleApiError(error)
  return NextResponse.json({ error: message, code }, { status })
}
```

**Uso en rutas**:
```typescript
import { errorResponse, ApiError } from '@/lib/api/errors'

export async function POST(request: NextRequest) {
  try {
    // ... lógica

    if (!data) {
      throw new ApiError('Paquete no encontrado', 404, 'NOT_FOUND')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
```

---

## 5.3 Timeout Handler para Procesos Spawn

**Archivo**: `src/app/api/requote/run/route.ts`

**Estado**: [x] COMPLETADO - Ya implementado (líneas 203-208, timeout de 10 minutos con kill)

**Implementación existente** (líneas 203-208):
```typescript
// Timeout after 10 minutes
setTimeout(async () => {
  child.kill()
  await sendEvent('error', { message: 'Timeout: el bot tardó más de 10 minutos' })
  resolve()
}, 10 * 60 * 1000)
```

**Solución propuesta**:
```typescript
function spawnWithTimeout(
  command: string,
  args: string[],
  options: SpawnOptions,
  timeoutMs: number = 5 * 60 * 1000  // 5 minutos default
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options)

    let stdout = ''
    let stderr = ''
    let killed = false

    const timeout = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
      reject(new Error(`Proceso excedió timeout de ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (!killed) {
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      }
    })
  })
}
```

---

# FASE 6: LOGGING Y MONITOREO

> **Objetivo**: Visibilidad de operaciones y debugging
> **Riesgo**: BAJO

## 6.1 Reemplazar console.log con Logger Estructurado

**Archivo**: `src/lib/logger.ts` (actualizar existente)

**Estado**: [x] COMPLETADO - 2025-01-20 (Clase `Logger` con `createLogger()`, JSON en prod)

**Implementación mejorada**:
```typescript
// src/lib/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: string
  data?: Record<string, any>
  timestamp: string
}

class Logger {
  private context: string

  constructor(context: string) {
    this.context = context
  }

  private log(level: LogLevel, message: string, data?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      data,
      timestamp: new Date().toISOString()
    }

    // En desarrollo: formato legible
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${entry.context}]`
      const dataStr = data ? ` ${JSON.stringify(data)}` : ''

      switch (level) {
        case 'debug': console.debug(prefix, message, dataStr); break
        case 'info': console.info(prefix, message, dataStr); break
        case 'warn': console.warn(prefix, message, dataStr); break
        case 'error': console.error(prefix, message, dataStr); break
      }
    } else {
      // En producción: JSON estructurado
      console.log(JSON.stringify(entry))
    }
  }

  debug(message: string, data?: Record<string, any>) {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, any>) {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, any>) {
    this.log('warn', message, data)
  }

  error(message: string, data?: Record<string, any>) {
    this.log('error', message, data)
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context)
}

// Uso:
// const log = createLogger('MetaAds')
// log.info('Creando ad', { packageId: 123, variant: 1 })
```

---

## 6.2 Health Check Endpoint

**Archivo nuevo**: `src/app/api/health/route.ts`

**Estado**: [x] COMPLETADO - 2025-01-20 (Endpoint `/api/health` con checks de DB, config, memoria)

**Implementación**:
```typescript
// src/app/api/health/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {}

  // Check Supabase
  const dbStart = Date.now()
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.from('packages').select('id').limit(1)
    checks.database = { status: 'ok', latency: Date.now() - dbStart }
  } catch (error) {
    checks.database = {
      status: 'error',
      latency: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'Unknown'
    }
  }

  // Check env vars
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'META_ACCESS_TOKEN',
    'OPENAI_API_KEY',
  ]

  const missingEnvVars = requiredEnvVars.filter(v => !process.env[v])
  checks.config = {
    status: missingEnvVars.length === 0 ? 'ok' : 'error',
    error: missingEnvVars.length > 0 ? `Missing: ${missingEnvVars.join(', ')}` : undefined
  }

  // Overall status
  const allOk = Object.values(checks).every(c => c.status === 'ok')

  return NextResponse.json({
    status: allOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  }, { status: allOk ? 200 : 503 })
}
```

---

# CHECKLIST DE DESPLIEGUE

Antes de ir a producción, verificar:

## Variables de Entorno
- [ ] `NEXT_PUBLIC_SUPABASE_URL` configurado
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` configurado
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurado (secreto)
- [ ] `META_ACCESS_TOKEN` configurado y válido
- [ ] `META_AD_ACCOUNT_ID` configurado
- [ ] `META_PAGE_ID` configurado
- [ ] `META_INSTAGRAM_USER_ID` configurado
- [ ] `GOOGLE_DRIVE_CREDENTIALS` configurado (JSON)
- [ ] `GOOGLE_DRIVE_FOLDER_ID` configurado
- [ ] `OPENAI_API_KEY` configurado
- [ ] `TC_WEBHOOK_SECRET` configurado
- [ ] `CRON_SECRET` configurado

## Base de Datos
- [ ] Migración `20260120_add_atomic_functions.sql` ejecutada (contiene):
  - Función `update_inventory_atomic` (race condition fix)
  - Función `create_flight_with_relations` (transacciones)
  - Función `validate_price_range` (validación precios)
- [ ] Índices en tablas frecuentemente consultadas
- [ ] RLS policies actualizadas si es necesario

## Testing
- [ ] Webhook TC rechaza requests sin secret
- [ ] Cron jobs rechazan requests sin auth
- [ ] Health check responde correctamente
- [ ] Crear ad funciona end-to-end
- [ ] Sync de insights funciona

---

# NOTAS Y DECISIONES

## Decisiones Tomadas
1. **Cache**: Usar cache en memoria simple (no Redis) para simplicidad inicial
2. **Timeouts**: 30 segundos default para APIs externas
3. **Retries**: 3 intentos con backoff exponencial
4. **Logging**: JSON estructurado en producción, legible en desarrollo

## Deuda Técnica Conocida
1. Rate limiting no implementado (bajo riesgo para uso interno)
2. Circuit breaker no implementado (se puede agregar si hay problemas)
3. Audit logging parcial (sync_logs existe, faltan acciones de usuario)

## Contactos
- TravelCompositor API: [contacto]
- Meta Business Support: [contacto]
- Google Cloud Support: [contacto]

---

*Última actualización: 2025-01-20*
*Versión del documento: 1.2*

---

## RESUMEN DE IMPLEMENTACIÓN

### Fases Completadas

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Seguridad Crítica | ✅ COMPLETADO |
| 2 | Integridad de Datos | ✅ COMPLETADO |
| 3 | Optimización Meta Ads | ✅ COMPLETADO |
| 4 | Optimización Drive/Creatives | ✅ COMPLETADO |
| 5 | Manejo de Errores | ✅ COMPLETADO |
| 6 | Logging y Monitoreo | ✅ COMPLETADO |

### Archivos Creados/Modificados

**Fase 4:**
- `src/lib/meta-ads/creative-uploader.ts` - Retry con backoff + validación de archivos

**Fase 5:**
- `src/components/error-boundary.tsx` - Componente ErrorBoundary
- `src/lib/api/errors.ts` - Utilidades de manejo de errores
- `src/app/(dashboard)/layout.tsx` - Integración de ErrorBoundary

**Fase 6:**
- `src/lib/logger.ts` - Logger estructurado con createLogger()
- `src/app/api/health/route.ts` - Endpoint de health check
