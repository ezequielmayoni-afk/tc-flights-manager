/**
 * Salud del token y de la cuenta publicitaria de Meta.
 *
 * El token es de usuario de sistema y no vence, pero puede ser revocado, y
 * la cuenta puede quedar deshabilitada por pagos o políticas. Sin esto, la
 * primera noticia era un anuncio que no se pausaba.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'
const TIMEOUT_MS = 20_000

export interface MetaHealth {
  ok: boolean
  status: 'ok' | 'degraded' | 'down'
  tokenValid: boolean
  tokenType: string | null
  expiresAt: string | null
  dataAccessExpiresAt: string | null
  scopes: string[]
  missingScopes: string[]
  account: { id: string; name: string | null; status: number | null; disableReason: number | null; currency: string | null } | null
  error: string | null
}

const REQUIRED_SCOPES = ['ads_management', 'ads_read', 'business_management']

/** Códigos de account_status de Meta. 1 = activa. */
const ACCOUNT_STATUS: Record<number, string> = {
  1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW', 8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD',
  100: 'PENDING_CLOSURE', 101: 'CLOSED', 201: 'ANY_ACTIVE', 202: 'ANY_CLOSED',
}

function tsToIso(ts: number | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null
}

async function graphGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok || body.error) {
    const err = body.error as { message?: string; code?: number } | undefined
    throw new Error(`Meta ${res.status}${err?.code ? ` (${err.code})` : ''}: ${err?.message ?? 'error'}`)
  }
  return body
}

export async function checkMetaHealth(): Promise<MetaHealth> {
  const token = process.env.META_ACCESS_TOKEN
  const rawAccount = process.env.META_AD_ACCOUNT_ID
  const base: MetaHealth = { ok: false, status: 'down', tokenValid: false, tokenType: null, expiresAt: null, dataAccessExpiresAt: null, scopes: [], missingScopes: [], account: null, error: null }
  if (!token || !rawAccount) return { ...base, error: 'META_ACCESS_TOKEN o META_AD_ACCOUNT_ID no configurados' }

  try {
    const debug = (await graphGet('debug_token', { input_token: token, access_token: token })).data as {
      is_valid?: boolean; type?: string; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; error?: { message?: string }
    }
    const scopes = debug.scopes ?? []
    const missingScopes = REQUIRED_SCOPES.filter(s => !scopes.includes(s))
    const tokenValid = debug.is_valid === true
    if (!tokenValid) return { ...base, tokenValid: false, tokenType: debug.type ?? null, scopes, missingScopes, error: `Token inválido: ${debug.error?.message ?? 'sin detalle'}` }

    const accountId = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`
    const acct = await graphGet(accountId, { fields: 'account_status,disable_reason,name,currency', access_token: token }) as {
      id?: string; name?: string; account_status?: number; disable_reason?: number; currency?: string
    }
    const accountStatus = acct.account_status ?? null
    const accountOk = accountStatus === 1
    const expiresAt = tsToIso(debug.expires_at)
    const expiresSoon = expiresAt ? new Date(expiresAt).getTime() - Date.now() < 7 * 86_400_000 : false

    const status: MetaHealth['status'] = !accountOk ? 'down' : missingScopes.length > 0 || expiresSoon ? 'degraded' : 'ok'
    return {
      ok: status === 'ok',
      status,
      tokenValid,
      tokenType: debug.type ?? null,
      expiresAt,
      dataAccessExpiresAt: tsToIso(debug.data_access_expires_at),
      scopes,
      missingScopes,
      account: { id: acct.id ?? accountId, name: acct.name ?? null, status: accountStatus, disableReason: acct.disable_reason ?? null, currency: acct.currency ?? null },
      error: accountOk ? null : `Cuenta ${ACCOUNT_STATUS[accountStatus ?? 0] ?? accountStatus} (disable_reason ${acct.disable_reason ?? '-'})`,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}

export function describeAccountStatus(code: number | null): string {
  return code === null ? 'desconocido' : ACCOUNT_STATUS[code] ?? String(code)
}
