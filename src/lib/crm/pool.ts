import { Pool, type PoolClient } from 'pg'

/**
 * Conexión de sólo lectura a la base productiva del CRM (RDS). Reglas que no se
 * negocian (docs/CRM-DB-READONLY.md): siempre tenant_id, siempre rango de
 * fechas en las tablas grandes, transacción READ ONLY, pool chico, timeout.
 */

let pool: Pool | null = null

export function isCrmConfigured(): boolean {
  return Boolean(process.env.CRM_PG_HOST && process.env.CRM_PG_USER && process.env.CRM_PG_PASSWORD && process.env.CRM_TENANT_ID)
}

export function crmTenantId(): string {
  const t = process.env.CRM_TENANT_ID
  if (!t) throw new Error('CRM_TENANT_ID no configurado')
  return t
}

function getPool(): Pool {
  if (!pool) {
    if (!isCrmConfigured()) throw new Error('CRM no configurado (CRM_PG_HOST, CRM_PG_USER, CRM_PG_PASSWORD, CRM_PG_DATABASE, CRM_TENANT_ID)')
    pool = new Pool({
      host: process.env.CRM_PG_HOST, port: Number(process.env.CRM_PG_PORT || 5432), user: process.env.CRM_PG_USER, password: process.env.CRM_PG_PASSWORD, database: process.env.CRM_PG_DATABASE || 'crm_db',
      ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000, statement_timeout: 60_000,
    })
  }
  return pool
}

/** Corre `fn` dentro de una transacción READ ONLY con una conexión del pool. */
export async function withCrm<T>(fn: (client: PoolClient, tenantId: string) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query("SET LOCAL statement_timeout = '60s'")
    const out = await fn(client, crmTenantId())
    await client.query('ROLLBACK')
    return out
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ya cerrada */ }
    throw err
  } finally {
    client.release()
  }
}
