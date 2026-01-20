/**
 * Validación de variables de entorno al inicio
 *
 * Este módulo valida que todas las variables de entorno requeridas estén configuradas
 * antes de que la aplicación las use. Previene errores silenciosos por configuración faltante.
 */

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
  SLACK_WEBHOOK_URL?: string
}

const REQUIRED_VARS: (keyof RequiredEnvVars)[] = [
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

/**
 * Valida que todas las variables de entorno requeridas estén configuradas
 * Lanza error si faltan variables críticas
 */
function validateEnv(): RequiredEnvVars & OptionalEnvVars {
  const missing = REQUIRED_VARS.filter(key => !process.env[key])

  if (missing.length > 0) {
    const errorMessage =
      `[ENV] Variables de entorno faltantes: ${missing.join(', ')}\n` +
      `Revisar archivo .env.local o variables de entorno del servidor.`

    // En desarrollo, mostrar error claro
    if (process.env.NODE_ENV === 'development') {
      console.error('\n' + '='.repeat(60))
      console.error(errorMessage)
      console.error('='.repeat(60) + '\n')
    }

    throw new Error(errorMessage)
  }

  return process.env as unknown as RequiredEnvVars & OptionalEnvVars
}

/**
 * Obtiene una variable de entorno de forma segura
 * @param key - Nombre de la variable
 * @param defaultValue - Valor por defecto (opcional)
 * @returns El valor de la variable o el default
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key]

  if (!value && defaultValue === undefined) {
    throw new Error(`[ENV] Variable ${key} no configurada y no tiene valor por defecto`)
  }

  return value || defaultValue!
}

/**
 * Verifica si una variable de entorno opcional está configurada
 */
export function hasEnvVar(key: string): boolean {
  return !!process.env[key]
}

// Exportar variables validadas (se ejecuta al importar el módulo)
export const env = validateEnv()
