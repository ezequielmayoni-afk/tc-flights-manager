import { getBudgetStatus, recordExternalCall } from '@/lib/jobs/budget'
import type { Db } from '@/lib/jobs/types'

/**
 * Cliente SOAP de Sabre para el estimador de vuelos.siviajo.com.
 *
 * Sabre entra como ESTIMADOR, no como fuente de precio publicado: una búsqueda
 * BargainFinderMax por par de fechas dice cuáles vale la pena confirmar contra
 * siviajo.com (cotizador-bot). Por eso el precio que devuelve nunca se muestra
 * como tarifa final.
 *
 * Cosas verificadas en vivo contra el PCC propio (2026-09-10) que explican por
 * qué el código es así y no de la forma "linda":
 * - El REST de Sabre está deshabilitado para estas credenciales (403). Solo
 *   SOAP contra https://webservices.platform.sabre.com.
 * - `SessionCreateRQ` autentica ÚNICAMENTE con el sobre de
 *   `buildSessionCreateEnvelope`: ClientId/ClientSecret van DENTRO del
 *   UsernameToken y el `SOAPAction` es "OTA". Sin eso: "Authorization failed".
 * - `BargainFinderMax_ADRQ` (fechas alternativas en una sola llamada) responde
 *   "No service / adapter": hay que pedir par de fechas por par de fechas.
 *
 * Las sesiones son un recurso escaso (Sabre limita cuántas hay abiertas a la
 * vez) y expiran a los 15 minutos: `createSabreShopper` abre una sola por
 * tanda, la renueva sola y la cierra al terminar.
 *
 * Sin dependencias nuevas: el parseo es por regex sobre bloques acotados
 * (`PricedItinerary` → `OriginDestinationOption` → `FlightSegment`), que para
 * una respuesta de esquema fijo alcanza y evita meter un parser XML al bundle.
 */

export const SABRE_PROVIDER = 'sabre'

/** Sabre cierra la sesión a los 15 min; se renueva antes para no perder una llamada. */
export const SESSION_TTL_MS = 13 * 60_000

const SOAP_URL_DEFAULT = 'https://webservices.platform.sabre.com'
const DOMAIN_DEFAULT = 'DEFAULT'
const BFM_TIMEOUT_MS = 60_000
const SESSION_TIMEOUT_MS = 30_000
const DEFAULT_ITINERARIES = 5
const IATA_RE = /^[A-Z]{3}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Aviso que Sabre manda en toda respuesta; no es un problema de la búsqueda. */
const IGNORED_ERROR_CODES = new Set(['DEPRECATEDRS'])

/** Textos que significan "no hay vuelos", no "se rompió algo". */
const SIN_DISPONIBILIDAD_RE = /no\s+availability|no\s+fares|no\s+combinable|no\s+flights|not\s+available|no\s+itinerar|sin\s+disponibilidad/i

/** Señales de que la sesión murió y hay que abrir otra. */
const SESION_PERDIDA_RE = /usg_invalid_session|session|token|expired/i

export class SabreBudgetExhausted extends Error {
  constructor(pct: number) {
    super(`Presupuesto de Sabre agotado (${pct}%)`)
    this.name = 'SabreBudgetExhausted'
  }
}

export class SabreAuthError extends Error {
  constructor(motivo: string) {
    super(`Sabre no abrió la sesión: ${motivo}`)
    this.name = 'SabreAuthError'
  }
}

export interface SabreConfig {
  username: string
  password: string
  pcc: string
  clientId: string
  clientSecret: string
  domain: string
  soapUrl: string
}

export interface SabreSession {
  token: string
  conversationId: string
  createdAt: number
}

export interface BfmInput {
  /** IATA del aeropuerto/ciudad de origen, `^[A-Z]{3}$` (EZE, BUE). */
  originIata: string
  destIata: string
  /** YYYY-MM-DD. */
  departDate: string
  returnDate: string
  adults?: number
  maxItineraries?: number
}

export interface BfmItinerary {
  /** Total por pasajero en la moneda de `currency` (se pide USD). */
  totalUsd: number
  currency: string
  /** Código de la aerolínea comercializadora del primer tramo de ida. */
  airlineCode: string | null
  airlineCodes: string[]
  stopsOut: number
  stopsBack: number
  durationOutMin: number | null
  durationBackMin: number | null
  flightNumbersOut: string[]
  flightNumbersBack: string[]
  departOut: string
  arriveBack: string
}

export type BfmResult =
  | { status: 'ok'; itineraries: BfmItinerary[]; cheapest: BfmItinerary; elapsedMs: number }
  | { status: 'empty'; itineraries: []; elapsedMs: number; message?: string }
  | { status: 'error'; itineraries: []; elapsedMs: number; error: string; retryable: boolean; sessionLost: boolean }

export interface BfmError {
  code: string
  text: string
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const REQUIRED_ENV = ['SABRE_USERNAME', 'SABRE_PASSWORD', 'SABRE_PCC', 'SABRE_CLIENT_ID', 'SABRE_CLIENT_SECRET'] as const

export function isSabreConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]))
}

/** Config de Sabre desde el entorno. Lanza si falta algo: es un error de despliegue. */
export function sabreConfig(): SabreConfig {
  const faltan = REQUIRED_ENV.filter((key) => !process.env[key])
  if (faltan.length > 0) throw new Error(`Sabre no está configurado: falta ${faltan.join(', ')}`)
  return {
    username: process.env.SABRE_USERNAME!,
    password: process.env.SABRE_PASSWORD!,
    pcc: process.env.SABRE_PCC!,
    clientId: process.env.SABRE_CLIENT_ID!,
    clientSecret: process.env.SABRE_CLIENT_SECRET!,
    domain: process.env.SABRE_DOMAIN || DOMAIN_DEFAULT,
    soapUrl: (process.env.SABRE_SOAP_URL || SOAP_URL_DEFAULT).replace(/\/+$/, ''),
  }
}

// ---------------------------------------------------------------------------
// Sobres SOAP
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/**
 * El `MessageHeader` de ebXML que Sabre exige en todos los pedidos. Cambia solo
 * la acción; el resto es fijo por PCC y conversación.
 */
function messageHeader(cfg: SabreConfig, action: string, conversationId: string): string {
  return `<ns4:MessageHeader xmlns:ns4="http://www.ebxml.org/namespaces/messageHeader">` +
    `<ns4:From><ns4:PartyId ns4:type="urn:x12.org.IO5:01">agency</ns4:PartyId></ns4:From>` +
    `<ns4:To><ns4:PartyId ns4:type="urn:x12.org.IO5:01">sabre</ns4:PartyId></ns4:To>` +
    `<ns4:CPAId>${escapeXml(cfg.pcc)}</ns4:CPAId>` +
    `<ns4:ConversationId>${escapeXml(conversationId)}</ns4:ConversationId>` +
    `<ns4:Service ns4:type="Sabre xml">action</ns4:Service>` +
    `<ns4:Action>${action}</ns4:Action>` +
    `</ns4:MessageHeader>`
}

/**
 * `SessionCreateRQ`: el único sobre que autentica. ClientId/ClientSecret van
 * dentro del UsernameToken (sin ellos Sabre responde "Authorization failed") y
 * el `Domain` es DEFAULT salvo que Sabre haya indicado otro.
 */
export function buildSessionCreateEnvelope(cfg: SabreConfig, conversationId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Header>` +
    messageHeader(cfg, 'SessionCreateRQ', conversationId) +
    `<ns6:Security xmlns:ns6="http://schemas.xmlsoap.org/ws/2002/12/secext">` +
    `<ns6:UsernameToken>` +
    `<ns6:Username>${escapeXml(cfg.username)}</ns6:Username>` +
    `<ns6:Password>${escapeXml(cfg.password)}</ns6:Password>` +
    `<Organization>${escapeXml(cfg.pcc)}</Organization>` +
    `<Domain>${escapeXml(cfg.domain)}</Domain>` +
    `<ClientId>${escapeXml(cfg.clientId)}</ClientId>` +
    `<ClientSecret>${escapeXml(cfg.clientSecret)}</ClientSecret>` +
    `</ns6:UsernameToken>` +
    `</ns6:Security>` +
    `</soap:Header>` +
    `<soap:Body>` +
    `<ns19:SessionCreateRQ xmlns:ns19="http://www.opentravel.org/OTA/2002/11" xmlns:ns4="http://schemas.xmlsoap.org/ws/2002/12/secext">` +
    `<ns4:POS><ns4:Source PseudoCityCode="${escapeXml(cfg.pcc)}"/></ns4:POS>` +
    `</ns19:SessionCreateRQ>` +
    `</soap:Body>` +
    `</soap:Envelope>`
}

/** Cabecera de una llamada con sesión abierta: el token va en el wsse:Security. */
function sessionEnvelope(cfg: SabreConfig, session: SabreSession, action: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Header>` +
    messageHeader(cfg, action, session.conversationId) +
    `<wsse:Security xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext">` +
    `<wsse:BinarySecurityToken>${escapeXml(session.token)}</wsse:BinarySecurityToken>` +
    `</wsse:Security>` +
    `</soap:Header>` +
    `<soap:Body>${body}</soap:Body>` +
    `</soap:Envelope>`
}

function buildSessionCloseEnvelope(cfg: SabreConfig, session: SabreSession): string {
  return sessionEnvelope(
    cfg,
    session,
    'SessionCloseRQ',
    `<SessionCloseRQ xmlns="http://www.opentravel.org/OTA/2002/11" xmlns:ns4="http://schemas.xmlsoap.org/ws/2002/12/secext">` +
      `<ns4:POS><ns4:Source PseudoCityCode="${escapeXml(cfg.pcc)}"/></ns4:POS>` +
      `</SessionCloseRQ>`
  )
}

function normalizeIata(value: string, campo: string): string {
  const code = (value ?? '').trim().toUpperCase()
  if (!IATA_RE.test(code)) throw new Error(`Sabre: ${campo} no es un IATA válido (${value})`)
  return code
}

function assertDate(value: string, campo: string): string {
  const fecha = (value ?? '').trim()
  if (!DATE_RE.test(fecha)) throw new Error(`Sabre: ${campo} tiene que ser una fecha YYYY-MM-DD (${value})`)
  // `2026-13-40` pasa el regex pero no es un día: el round-trip lo caza.
  const d = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
    throw new Error(`Sabre: ${campo} no es una fecha real (${value})`)
  }
  return fecha
}

/**
 * `BargainFinderMaxRQ` ida y vuelta. Dos `OriginDestinationInformation` con el
 * origen y el destino invertidos en la vuelta; `NumTrips` acota cuántos
 * itinerarios devuelve (menos payload, misma transacción).
 */
export function buildBfmEnvelope(cfg: SabreConfig, session: SabreSession, input: BfmInput): string {
  const origen = normalizeIata(input.originIata, 'originIata')
  const destino = normalizeIata(input.destIata, 'destIata')
  if (origen === destino) throw new Error(`Sabre: origen y destino iguales (${origen})`)

  const ida = assertDate(input.departDate, 'departDate')
  const vuelta = assertDate(input.returnDate, 'returnDate')
  if (vuelta < ida) throw new Error(`Sabre: la fecha de vuelta (${vuelta}) es anterior a la de ida (${ida})`)

  const adultos = Math.min(Math.max(Math.trunc(input.adults ?? 1), 1), 9)
  const itinerarios = Math.min(Math.max(Math.trunc(input.maxItineraries ?? DEFAULT_ITINERARIES), 1), 50)

  const body =
    `<OTA_AirLowFareSearchRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="5.1.0" AvailableFlightsOnly="true" ResponseType="OTA" ResponseVersion="3.7.0">` +
    `<POS><Source PseudoCityCode="${escapeXml(cfg.pcc)}"><RequestorID Type="1" ID="1"><CompanyName Code="TN"/></RequestorID></Source></POS>` +
    `<OriginDestinationInformation RPH="1"><DepartureDateTime>${ida}T00:00:00</DepartureDateTime><OriginLocation LocationCode="${origen}"/><DestinationLocation LocationCode="${destino}"/></OriginDestinationInformation>` +
    `<OriginDestinationInformation RPH="2"><DepartureDateTime>${vuelta}T00:00:00</DepartureDateTime><OriginLocation LocationCode="${destino}"/><DestinationLocation LocationCode="${origen}"/></OriginDestinationInformation>` +
    `<TravelPreferences><TPA_Extensions><NumTrips Number="${itinerarios}"/><DataSources ATPCO="Enable" LCC="Enable" NDC="Disable"/></TPA_Extensions></TravelPreferences>` +
    `<TravelerInfoSummary><SeatsRequested>${adultos}</SeatsRequested><AirTravelerAvail><PassengerTypeQuantity Code="ADT" Quantity="${adultos}"/></AirTravelerAvail><PriceRequestInformation CurrencyCode="USD"/></TravelerInfoSummary>` +
    `<TPA_Extensions><IntelliSellTransaction><RequestType Name="50ITINS"/></IntelliSellTransaction></TPA_Extensions>` +
    `</OTA_AirLowFareSearchRQ>`

  return sessionEnvelope(cfg, session, 'BargainFinderMaxRQ', body)
}

// ---------------------------------------------------------------------------
// Parseo de la respuesta
// ---------------------------------------------------------------------------

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs)
  return m ? unescapeXml(m[1]) : null
}

/**
 * Bloques `<Tag ...>…</Tag>` (o `<Tag .../>`) de primer nivel dentro de `xml`,
 * con o sin prefijo de espacio de nombres (`<stl:Error>`).
 *
 * Se hace a mano y no con una sola regex por dos razones: las etiquetas
 * autocontenidas harían que un `</Tag>` posterior cierre el bloque equivocado,
 * y el `\b` del nombre evita confundir `<Errors>` con `<Error>` o
 * `<PricedItineraries>` con `<PricedItinerary>`.
 */
function blocks(xml: string, tag: string): Array<{ attrs: string; inner: string }> {
  const out: Array<{ attrs: string; inner: string }> = []
  const open = new RegExp(`<((?:[\\w.-]+:)?${tag})\\b([^>]*)>`, 'g')
  let m: RegExpExecArray | null
  while ((m = open.exec(xml)) !== null) {
    const attrs = m[2]
    if (attrs.trimEnd().endsWith('/')) {
      out.push({ attrs: attrs.trimEnd().slice(0, -1), inner: '' })
      continue
    }
    // El cierre se arma con el nombre que realmente vino, prefijo incluido.
    const cierre = `</${m[1]}>`
    const fin = xml.indexOf(cierre, open.lastIndex)
    if (fin === -1) {
      out.push({ attrs, inner: '' })
      continue
    }
    out.push({ attrs, inner: xml.slice(open.lastIndex, fin) })
    open.lastIndex = fin + cierre.length
  }
  return out
}

function firstBlock(xml: string, tag: string): { attrs: string; inner: string } | null {
  return blocks(xml, tag)[0] ?? null
}

/** `ElapsedTime` viene en minutos ("595"); algunos esquemas lo mandan "09:55". */
function parseElapsed(value: string | null): number | null {
  if (!value) return null
  const hhmm = /^(\d+):(\d{1,2})$/.exec(value.trim())
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2])
  const n = Number(value.trim())
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

interface Segmento {
  departure: string
  arrival: string
  stops: number
  airline: string | null
  flightNumber: string
}

function parseSegments(optionXml: string): Segmento[] {
  return blocks(optionXml, 'FlightSegment').map(({ attrs, inner }) => {
    // El código de vuelo comercial es el de MarketingAirline; OperatingAirline
    // puede ser otra (codeshare) y no es la que se muestra.
    const marketing = attr(firstBlock(inner, 'MarketingAirline')?.attrs ?? '', 'Code')
    const operating = attr(firstBlock(inner, 'OperatingAirline')?.attrs ?? '', 'Code')
    const stops = Number(attr(attrs, 'StopQuantity') ?? '0')
    return {
      departure: attr(attrs, 'DepartureDateTime') ?? '',
      arrival: attr(attrs, 'ArrivalDateTime') ?? '',
      stops: Number.isFinite(stops) && stops > 0 ? Math.trunc(stops) : 0,
      airline: marketing || operating,
      flightNumber: attr(attrs, 'FlightNumber') ?? '',
    }
  })
}

/** Escalas del tramo: los trasbordos (segmentos - 1) más las escalas técnicas. */
function escalas(segmentos: Segmento[]): number {
  if (segmentos.length === 0) return 0
  return segmentos.length - 1 + segmentos.reduce((acc, s) => acc + s.stops, 0)
}

function numerosDeVuelo(segmentos: Segmento[]): string[] {
  return segmentos.filter((s) => s.flightNumber).map((s) => `${s.airline ?? ''}${s.flightNumber}`)
}

function parseItinerary(itinXml: string): BfmItinerary | null {
  const air = firstBlock(itinXml, 'AirItinerary')
  if (!air) return null

  const opciones = blocks(air.inner, 'OriginDestinationOption')
  if (opciones.length === 0) return null

  const ida = parseSegments(opciones[0].inner)
  const vuelta = opciones[1] ? parseSegments(opciones[1].inner) : []
  if (ida.length === 0) return null

  // El total del itinerario está en ItinTotalFare; el TotalFare de
  // PTC_FareBreakdown es el del pasajero y con 1 ADT coincide, pero no siempre.
  const totalBlock = firstBlock(itinXml, 'ItinTotalFare')
  const totalAttrs = totalBlock ? firstBlock(totalBlock.inner, 'TotalFare')?.attrs : null
  const fallback = firstBlock(firstBlock(itinXml, 'PassengerFare')?.inner ?? '', 'TotalFare')?.attrs
  const attrs = totalAttrs ?? fallback ?? ''
  const monto = Number(attr(attrs, 'Amount') ?? '')
  if (!Number.isFinite(monto)) return null

  const codigos: string[] = []
  for (const s of [...ida, ...vuelta]) {
    if (s.airline && !codigos.includes(s.airline)) codigos.push(s.airline)
  }

  return {
    totalUsd: monto,
    currency: attr(attrs, 'CurrencyCode') || 'USD',
    airlineCode: ida[0].airline ?? null,
    airlineCodes: codigos,
    stopsOut: escalas(ida),
    stopsBack: escalas(vuelta),
    durationOutMin: parseElapsed(attr(opciones[0].attrs, 'ElapsedTime')),
    durationBackMin: opciones[1] ? parseElapsed(attr(opciones[1].attrs, 'ElapsedTime')) : null,
    flightNumbersOut: numerosDeVuelo(ida),
    flightNumbersBack: numerosDeVuelo(vuelta),
    departOut: ida[0].departure,
    arriveBack: vuelta.length > 0 ? vuelta[vuelta.length - 1].arrival : '',
  }
}

function parseErrors(xml: string): BfmError[] {
  const out: BfmError[] = []

  for (const { attrs, inner } of blocks(xml, 'Error')) {
    const code = attr(attrs, 'Code') ?? attr(attrs, 'Type') ?? 'ERROR'
    const text = attr(attrs, 'ShortText') ?? unescapeXml(inner.replace(/<[^>]*>/g, ' ')).trim()
    if (IGNORED_ERROR_CODES.has(code)) continue
    out.push({ code, text })
  }

  const fault = /<(?:[\w.-]+:)?faultstring[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?faultstring>/i.exec(xml)
  if (fault) {
    const text = unescapeXml(fault[1]).trim()
    if (text) out.push({ code: 'SOAP_FAULT', text })
  }

  return out
}

/**
 * Lee una respuesta de BargainFinderMax. Nunca lanza: una respuesta ilegible
 * es "cero itinerarios" y el que llama decide qué hacer.
 *
 * `errors` junta los `<Error>` de la respuesta y el `faultstring` del SOAP
 * fault (el aviso DEPRECATEDRS que Sabre manda siempre se descarta).
 * `sessionLost` avisa que hay que abrir otra sesión y reintentar.
 */
export function parseBfmResponse(xml: string): { itineraries: BfmItinerary[]; errors: BfmError[]; sessionLost: boolean } {
  const texto = typeof xml === 'string' ? xml : ''
  const errors = parseErrors(texto)

  const itineraries = blocks(texto, 'PricedItinerary')
    .map(({ inner }) => parseItinerary(inner))
    .filter((it): it is BfmItinerary => it !== null)
    .sort((a, b) => a.totalUsd - b.totalUsd)

  const diagnostico = errors.map((e) => `${e.code} ${e.text}`).join(' | ')
  const sessionLost = SESION_PERDIDA_RE.test(diagnostico)

  return { itineraries, errors, sessionLost }
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

async function postSoap(
  cfg: SabreConfig,
  soapAction: string,
  body: string,
  timeoutMs: number,
  fetchImpl?: typeof fetch
): Promise<Response> {
  const doFetch = fetchImpl ?? fetch
  return doFetch(cfg.soapUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', SOAPAction: `"${soapAction}"` },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
}

function faultstring(xml: string): string {
  return parseErrors(xml).find((e) => e.code === 'SOAP_FAULT')?.text ?? ''
}

/**
 * Abre una sesión de Sabre. No se registra en `external_calls`: lo facturable
 * es la búsqueda, no la sesión (y una sesión sirve para muchas búsquedas).
 */
export async function createSabreSession(fetchImpl?: typeof fetch): Promise<SabreSession> {
  const cfg = sabreConfig()
  const conversationId = `hub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  let xml = ''
  try {
    const res = await postSoap(cfg, 'OTA', buildSessionCreateEnvelope(cfg, conversationId), SESSION_TIMEOUT_MS, fetchImpl)
    xml = await res.text().catch(() => '')
  } catch (err) {
    throw new SabreAuthError(err instanceof Error ? err.message : String(err))
  }

  const token = /<(?:[\w.-]+:)?BinarySecurityToken[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?BinarySecurityToken>/.exec(xml)?.[1]?.trim()
  if (!token) throw new SabreAuthError(faultstring(xml) || 'sin token')

  return { token, conversationId, createdAt: Date.now() }
}

/**
 * Cierra la sesión. Nunca lanza: si Sabre no contesta, la sesión expira sola a
 * los 15 minutos y no hay nada que hacer al respecto.
 */
export async function closeSabreSession(session: SabreSession, fetchImpl?: typeof fetch): Promise<void> {
  try {
    const cfg = sabreConfig()
    const res = await postSoap(cfg, 'SessionCloseRQ', buildSessionCloseEnvelope(cfg, session), SESSION_TIMEOUT_MS, fetchImpl)
    await res.text().catch(() => '')
  } catch (err) {
    console.warn('[sabre] No se pudo cerrar la sesión:', err instanceof Error ? err.message : String(err))
  }
}

// ---------------------------------------------------------------------------
// BargainFinderMax
// ---------------------------------------------------------------------------

/**
 * Una búsqueda ida y vuelta. Devuelve siempre un `BfmResult`: solo lanza si el
 * presupuesto de `sabre` está agotado (`SabreBudgetExhausted`), si falta
 * configuración o si el input está mal (errores de programación, no de Sabre).
 *
 * Cada llamada queda en `external_calls` aunque falle: Sabre la contó igual.
 */
export async function bargainFinderMax(
  db: Db,
  session: SabreSession,
  input: BfmInput,
  opts: { jobId?: number | null; enforceBudget?: boolean; fetchImpl?: typeof fetch } = {}
): Promise<BfmResult> {
  const { jobId = null, enforceBudget = true, fetchImpl } = opts

  if (enforceBudget !== false) {
    const budget = await getBudgetStatus(db, SABRE_PROVIDER)
    if (budget.exhausted) throw new SabreBudgetExhausted(budget.pct)
  }

  // Se arma antes del try: un input inválido no debe gastar (ni registrar) nada.
  const cfg = sabreConfig()
  const envelope = buildBfmEnvelope(cfg, session, input)

  const started = Date.now()
  let registro: 'ok' | 'error' | 'timeout' = 'ok'

  try {
    const res = await postSoap(cfg, 'BargainFinderMaxRQ', envelope, BFM_TIMEOUT_MS, fetchImpl)
    const xml = await res.text().catch(() => '')
    const elapsedMs = Date.now() - started
    const parsed = parseBfmResponse(xml)
    const diagnostico = parsed.errors.map((e) => (e.text ? `${e.code}: ${e.text}` : e.code)).join(' | ')

    if (parsed.sessionLost) {
      registro = 'error'
      return { status: 'error', itineraries: [], elapsedMs, error: diagnostico || 'Sabre perdió la sesión', retryable: true, sessionLost: true }
    }

    if (parsed.itineraries.length > 0) {
      return { status: 'ok', itineraries: parsed.itineraries, cheapest: parsed.itineraries[0], elapsedMs }
    }

    // Sin vuelos para ese par de fechas: Sabre trabajó igual, se registra ok.
    if (parsed.errors.length === 0) {
      if (!res.ok) {
        registro = 'error'
        return { status: 'error', itineraries: [], elapsedMs, error: `Sabre HTTP ${res.status}`, retryable: true, sessionLost: false }
      }
      return { status: 'empty', itineraries: [], elapsedMs }
    }
    if (SIN_DISPONIBILIDAD_RE.test(diagnostico)) {
      return { status: 'empty', itineraries: [], elapsedMs, message: diagnostico }
    }

    // Fault o error de esquema: reintentar con el mismo pedido no cambia nada.
    registro = 'error'
    return { status: 'error', itineraries: [], elapsedMs, error: diagnostico, retryable: false, sessionLost: false }
  } catch (err) {
    const elapsedMs = Date.now() - started
    const esTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    registro = esTimeout ? 'timeout' : 'error'
    return {
      status: 'error',
      itineraries: [],
      elapsedMs,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
      sessionLost: false,
    }
  } finally {
    await recordExternalCall(db, {
      provider: SABRE_PROVIDER,
      endpoint: 'vuelos-baratos:bfm',
      units: 1,
      status: registro,
      durationMs: Date.now() - started,
      jobId,
    })
  }
}

export interface SabreShopper {
  shop(input: BfmInput): Promise<BfmResult>
  close(): Promise<void>
  readonly callsMade: number
}

/**
 * Una tanda de búsquedas sobre una sola sesión.
 *
 * Abre la sesión en la primera búsqueda (si el job no llega a buscar nada, no
 * gasta una), la renueva cuando se pasa el TTL o cuando Sabre avisa que la
 * perdió (un reintento, uno solo) y la cierra con `close()`. La sesión vencida
 * no se cierra: ya no existe del lado de Sabre.
 */
export function createSabreShopper(
  db: Db,
  opts: { jobId?: number | null; fetchImpl?: typeof fetch } = {}
): SabreShopper {
  const { jobId = null, fetchImpl } = opts
  let session: SabreSession | null = null
  let callsMade = 0

  async function sesionVigente(): Promise<SabreSession> {
    if (session && Date.now() - session.createdAt <= SESSION_TTL_MS) return session
    session = await createSabreSession(fetchImpl)
    return session
  }

  async function buscar(input: BfmInput): Promise<BfmResult> {
    const actual = await sesionVigente()
    callsMade++
    return bargainFinderMax(db, actual, input, { jobId, fetchImpl })
  }

  return {
    async shop(input: BfmInput): Promise<BfmResult> {
      const res = await buscar(input)
      if (res.status !== 'error' || !res.sessionLost) return res
      session = null
      return buscar(input)
    },
    async close(): Promise<void> {
      if (!session) return
      const abierta = session
      session = null
      await closeSabreSession(abierta, fetchImpl)
    },
    get callsMade(): number {
      return callsMade
    },
  }
}
