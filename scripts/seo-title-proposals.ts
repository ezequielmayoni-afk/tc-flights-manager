/**
 * seo-title-proposals.ts — Propuesta de títulos SEO para los paquetes propios de siviajo.com (Sí, Viajo)
 *
 * Qué hace (NO escribe nada en Travel Compositor ni en ninguna base de datos):
 *   1. Lee la lista de paquetes de Travel Compositor (JSON local con --packages, o la baja de la API).
 *   2. Filtra los paquetes propios: active == true y themes no vacío (los circuitos mayoristas quedan fuera).
 *   3. Baja y cachea el detalle (GET /package/siviajo/{id}) y el calendario de salidas (GET /package/calendar/siviajo/{id}).
 *   4. Arma un resumen con datos reales por paquete: destinos, noches, hotel, estrellas, régimen, aerolínea, directo,
 *      origen, fechas/temporada, precio, temáticas actuales.
 *   5. Pide a Claude (claude-sonnet-5-5; fallback claude-haiku-5-5) title / large_title / meta_title /
 *      meta_description / image_alt / temáticas nuevas, en lotes de 10 paquetes, JSON estricto.
 *   6. Valida límites de caracteres y reglas (palabras prohibidas, taxonomía, marca) y reintenta sólo lo que falla.
 *   7. Escribe el CSV para revisión humana (UTF-8 sin BOM, coma, todos los campos entre comillas).
 *
 * Cómo correrlo (desde la raíz de hub; Node >= 22.6 con type stripping — con Node 24 corre directo):
 *   set -a; source .env.local; set +a        # TC_USERNAME, TC_PASSWORD, ANTHROPIC_API_KEY (si no, los lee de .env.local)
 *   node scripts/seo-title-proposals.ts                           # baja la lista de TC y procesa todo → docs/seo/titulos-propuestos-<hoy>.csv
 *   node scripts/seo-title-proposals.ts --packages lista.json     # usa una lista ya bajada (formato: array de paquetes de /package/siviajo)
 *   node scripts/seo-title-proposals.ts --ids 59160593,38742558   # sólo esos paquetes
 *   node scripts/seo-title-proposals.ts --dry-run                 # muestra los resúmenes de datos sin llamar a Anthropic
 *   node scripts/seo-title-proposals.ts --only-fetch              # sólo baja/cachea detalles y calendarios
 * Opciones: --out <csv>  --details-dir <dir caché>  --model <id>  --batch <n=10>  --concurrency <n=3>  --refresh (ignora la caché de detalles)
 *           --proposals-json <ruta> (dump de las propuestas crudas)  --reuse-proposals <ruta> (reusa ese dump y sólo pide al modelo lo que falta o falla)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

// ----------------------------------------------------------------------------
// CLI + entorno
// ----------------------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function opt(name: string, def?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : def;
}
const flag = (name: string) => args.includes(`--${name}`);

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return false;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return true;
}
if (!process.env.TC_USERNAME || !process.env.ANTHROPIC_API_KEY) {
  loadEnvFile(path.resolve(here, "..", ".env.local")) || loadEnvFile(path.resolve(process.cwd(), ".env.local"));
}
for (const k of ["TC_USERNAME", "TC_PASSWORD"]) {
  if (!process.env[k]) { console.error(`Falta ${k} (cargá .env.local)`); process.exit(1); }
}

const TODAY = new Date().toISOString().slice(0, 10);
const HUB_ROOT = fs.existsSync(path.resolve(here, "..", "package.json")) ? path.resolve(here, "..") : "/Users/ezequielmayoni/hub";
const OUT_CSV = opt("out", path.join(HUB_ROOT, "docs", "seo", `titulos-propuestos-${TODAY}.csv`))!;
const DETAILS_DIR = opt("details-dir", path.join(os.tmpdir(), "tc_own_details"))!;
const MODEL = opt("model", "claude-sonnet-5-5")!;
const FALLBACK_MODEL = "claude-haiku-5-5";
const BATCH = Number(opt("batch", "10"));
const CONCURRENCY = Number(opt("concurrency", "3"));
const ONLY_IDS = opt("ids") ? new Set(opt("ids")!.split(",").map((s) => Number(s.trim()))) : null;
const DRY_RUN = flag("dry-run");
const ONLY_FETCH = flag("only-fetch");
const REFRESH = flag("refresh");
const PROPOSALS_JSON = opt("proposals-json");
const REUSE_PROPOSALS = opt("reuse-proposals");

// ----------------------------------------------------------------------------
// Travel Compositor (sólo lectura)
// ----------------------------------------------------------------------------
const TC = "https://online.travelcompositor.com/resources";
const MICROSITE = "siviajo";
let tcToken: string | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tcAuth(): Promise<string> {
  const r = await fetch(`${TC}/authentication/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: process.env.TC_USERNAME, password: process.env.TC_PASSWORD, micrositeId: MICROSITE }),
  });
  if (!r.ok) throw new Error(`TC auth ${r.status}`);
  const j = (await r.json()) as { token: string };
  tcToken = j.token;
  return tcToken;
}
async function tcGet<T>(p: string, attempt = 0): Promise<T> {
  if (!tcToken) await tcAuth();
  const r = await fetch(`${TC}${p}`, { headers: { "auth-token": tcToken!, Accept: "application/json" } });
  if ((r.status === 401 || r.status === 403) && attempt < 1) { tcToken = null; return tcGet<T>(p, attempt + 1); }
  if (r.status >= 500 && attempt < 3) { await sleep(1500 * (attempt + 1)); return tcGet<T>(p, attempt + 1); }
  if (!r.ok) throw new Error(`TC GET ${p} → ${r.status}`);
  return (await r.json()) as T;
}

type TcPackage = {
  id: number; active: boolean; title?: string; largeTitle?: string; metaTitle?: string; metaDescription?: string;
  description?: string; themes?: string[]; themeDetails?: { id: number; name: string; type: string }[];
  destinations?: { code?: string; name: string }[]; pricePerPerson?: { amount: number; currency: string };
  departureDate?: string; travelers?: any; origin?: { location?: { code?: string; name?: string; iata?: string } };
  ribbonText?: string; tripType?: string; counters?: Record<string, number>; ideaUrl?: string; imageUrl?: string;
};
type TcDetail = {
  destinations?: { code?: string; name?: string; country?: string }[];
  hotels?: { nights?: number; mealPlan?: string; roomTypes?: string; checkInDate?: string; checkOutDate?: string;
    hotelData?: { name?: string; category?: string; chain?: string; destination?: { name?: string } } }[];
  transports?: { company?: string; originCode?: string; targetCode?: string; numberOfSegments?: number; departureDate?: string;
    arrivalDate?: string; baggageInfo?: string; transportType?: string; transportNumber?: string;
    segment?: { departureAirportName?: string; arrivalAirportName?: string }[] }[];
  transfers?: { type?: string; transferServiceType?: string; vehicleType?: string }[];
  tickets?: { name?: string; modality?: string; eventDate?: string; duration?: string }[];
  closedTours?: { name?: string; dayFrom?: number; dayTo?: number; endDate?: string; description?: string; includedServices?: string }[];
  cruises?: { name?: string; shipName?: string; company?: string; nights?: number; [k: string]: any }[];
  insurances?: any[]; cars?: any[];
};
type TcCalendar = { currency?: string; holidayPackagesDates?: { date: string; price: number }[] };

async function pullPackages(): Promise<TcPackage[]> {
  const all: TcPackage[] = []; const seen = new Set<number>(); let first = 0;
  for (;;) {
    const page = await tcGet<{ package?: TcPackage[] }>(`/package/${MICROSITE}?first=${first}&limit=200`);
    const items = page.package ?? [];
    const fresh = items.filter((p) => !seen.has(p.id));
    fresh.forEach((p) => seen.add(p.id)); all.push(...fresh);
    if (!items.length || !fresh.length) break;
    first += items.length; await sleep(300);
  }
  return all;
}
async function cached<T>(file: string, fetcher: () => Promise<T>): Promise<T> {
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  const data = await fetcher();
  fs.writeFileSync(file, JSON.stringify(data));
  await sleep(300);
  return data;
}

// ----------------------------------------------------------------------------
// Normalización de datos
// ----------------------------------------------------------------------------
const DEST_ES: Record<string, string> = {
  "Maceio": "Maceió", "Cancun": "Cancún", "Florianopolis": "Florianópolis", "Curaçao": "Curazao", "Curacao": "Curazao",
  "Montego Bay": "Montego Bay (Jamaica)", "Sao Paulo": "San Pablo", "Cayman Islands": "Islas Caimán", "Nassau": "Nassau (Bahamas)",
  "Walt Disney World  Resort FL": "Orlando (Walt Disney World)", "Walt Disney World Resort FL": "Orlando (Walt Disney World)",
  "Orlando FL": "Orlando", "Austin TX": "Austin", "Las Vegas NV": "Las Vegas", "Cartagena de Indias": "Cartagena",
  "Panama City": "Ciudad de Panamá", "Istanbul": "Estambul", "Beijing": "Pekín", "Shanghai": "Shanghái", "Athens": "Atenas",
  "Santorini Island": "Santorini", "Cappadocia": "Capadocia", "Mykonos": "Miconos", "Brussels": "Bruselas", "Bruges": "Brujas",
  "Amsterdam": "Ámsterdam", "Berlin": "Berlín", "Prague": "Praga", "Vienna": "Viena", "Bordeaux": "Burdeos", "Paris": "París",
  "Munich": "Múnich", "Venice": "Venecia", "Florence": "Florencia", "Rome": "Roma", "Cote d'Azur": "Costa Azul", "London": "Londres",
  "Dubai": "Dubái", "Sacred Valley": "Valle Sagrado", "Copenhagen": "Copenhague", "Tromso": "Tromsø", "Stockholm": "Estocolmo",
  "Cairo": "El Cairo", "Lisbon": "Lisboa", "Ilha do Sal": "Isla de Sal (Cabo Verde)", "Genova": "Génova", "Dublin": "Dublín",
  "Milan": "Milán", "Naples": "Nápoles", "Cape Town": "Ciudad del Cabo", "Sydney": "Sídney", "Adelaide": "Adelaida",
  "San Carlos de Bariloche": "Bariloche", "Costa Mujeres": "Costa Mujeres (Cancún)", "Rio de Janeiro": "Río de Janeiro",
  "Zurich": "Zúrich", "Samana (Province)": "Samaná", "Virgin Gorda": "Virgin Gorda (Islas Vírgenes)", "Bayahíbe": "Bayahibe",
};
const ORIGIN_BY_CODE: Record<string, string> = {
  BUE: "Buenos Aires", EZE: "Buenos Aires", AEP: "Buenos Aires", COR: "Córdoba", CRD: "Córdoba", ROS: "Rosario", MDZ: "Mendoza",
  MEZ: "Mendoza", SLA: "Salta", SLT: "Salta", USH: "Ushuaia", LUQ: "San Luis", BRC: "Bariloche", BCH: "Bariloche", CTC: "Catamarca",
  CTC1: "Catamarca", FTE: "El Calafate", "CFE-1": "El Calafate", TUC: "Tucumán", NQN: "Neuquén", IGR: "Puerto Iguazú", REL: "Trelew",
  CNQ: "Corrientes", RES: "Resistencia", SFN: "Santa Fe", BHI: "Bahía Blanca", MDQ: "Mar del Plata", JUJ: "Jujuy", PSS: "Posadas",
  RGL: "Río Gallegos", SDE: "Santiago del Estero", CRR: "Villa Dolores",
};
const MEAL_ES: Record<string, string> = {
  "ALL INCLUSIVE": "All Inclusive", "ALL_INCLUSIVE": "All Inclusive", "ALLINCLUSIVE": "All Inclusive",
  "BREAKFAST": "con desayuno", "BUFFET BREAKFAST": "con desayuno", "WITH BREAKFAST": "con desayuno", "BREAKFAST INCLUDED": "con desayuno", "DESAYUNO": "con desayuno", "CONTINENTAL BREAKFAST": "con desayuno",
  "AMERICAN BREAKFAST": "con desayuno", "BED AND BREAKFAST": "con desayuno", "HALF BOARD": "con media pensión",
  "FULL BOARD": "con pensión completa", "ROOM ONLY": "sólo alojamiento", "ACCOMMODATION ONLY": "sólo alojamiento",
};
const stripHtml = (s?: string, max = 600) =>
  (s ?? "").replace(/<li[^>]*>/gi, " • ").replace(/<\/(p|li|ul|div|br)>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, max);
const destEs = (n?: string) => (n ? DEST_ES[n.trim()] ?? n.trim() : "");
const isNavigation = (n?: string) => /^in navigation/i.test(n ?? "");
function stars(cat?: string): string | undefined {
  if (!cat) return;
  const m = /^S?(\d)(S?)$/i.exec(cat.trim());
  if (m) return `${m[1]} estrellas${m[2] ? " superior" : ""}`;
  return;
}
function slugFromIdeaUrl(u?: string): string {
  if (!u) return "";
  try { return new URL(u).searchParams.get("title") ?? ""; } catch { return ""; }
}

type Summary = ReturnType<typeof buildSummary>;
function buildSummary(p: TcPackage, d: TcDetail, cal: TcCalendar) {
  const destNames = (p.destinations ?? []).map((x) => x.name).filter((n) => n && !isNavigation(n));
  const uniq = <T,>(a: T[]) => [...new Set(a)];
  const countries = uniq((d.destinations ?? []).map((x) => x.country).filter(Boolean) as string[]);
  const hotels = (d.hotels ?? []).map((h) => ({
    nombre: h.hotelData?.name ?? null, estrellas: stars(h.hotelData?.category) ?? null, cadena: h.hotelData?.chain ?? null,
    regimen: h.mealPlan ? MEAL_ES[h.mealPlan.toUpperCase()] ?? h.mealPlan : null, noches: h.nights ?? null,
    habitacion: h.roomTypes ?? null, ciudad: destEs(h.hotelData?.destination?.name) || null,
  }));
  const transports = (d.transports ?? []).map((t) => ({
    aerolinea: t.company ?? null, tipo: t.transportType ?? null, de: t.originCode ?? null, a: t.targetCode ?? null,
    de_nombre: t.segment?.[0]?.departureAirportName ?? null, a_nombre: t.segment?.at(-1)?.arrivalAirportName ?? null,
    directo: t.numberOfSegments != null ? t.numberOfSegments === 1 : null, fecha: t.departureDate ?? null, equipaje: t.baggageInfo ?? null,
  }));
  const ida = transports[0];
  const originCode = p.origin?.location?.code ?? p.origin?.location?.iata ?? null;
  const vueloIncluido = transports.some((t) => t.tipo === "FLIGHT" || t.tipo === "PLANE" || t.tipo == null);
  const origenNombre = (originCode && ORIGIN_BY_CODE[originCode]) || (ida?.de && ORIGIN_BY_CODE[ida.de]) || (vueloIncluido ? p.origin?.location?.name ?? null : null);
  const closedTours = (d.closedTours ?? []).map((c) => ({
    nombre: c.name ?? null, dias: c.dayFrom != null && c.dayTo != null ? c.dayTo - c.dayFrom + 1 : null,
    noches: c.dayFrom != null && c.dayTo != null ? c.dayTo - c.dayFrom : null, fin: c.endDate?.slice(0, 10) ?? null,
    descripcion: stripHtml(c.description, 500) || null, incluye: stripHtml(c.includedServices, 700) || null,
  }));
  const cruises = (d.cruises ?? []).map((c) => ({ nombre: c.name ?? c.shipName ?? null, compania: c.company ?? null, noches: c.nights ?? null }));
  const hotelNights = hotels.reduce((a, h) => a + (h.noches ?? 0), 0);
  const nochesTotal = p.counters?.hotelNights || hotelNights || closedTours.reduce((a, c) => a + (c.noches ?? 0), 0) || cruises.reduce((a, c) => a + (c.noches ?? 0), 0) || null;
  const fechas = (cal.holidayPackagesDates ?? []).map((x) => x.date).sort();
  const futuras = fechas.filter((f) => f >= TODAY);
  const textoCuotas = `${p.ribbonText ?? ""} ${p.description ?? ""} ${closedTours.map((c) => c.incluye ?? "").join(" ")}`;
  const cuotas = /cuota/i.test(textoCuotas);
  const regimenes = uniq(hotels.map((h) => h.regimen).filter(Boolean) as string[]);
  return {
    tc_id: p.id,
    title_actual: (p.title ?? "").trim(),
    large_title_actual: (p.largeTitle ?? "").trim(),
    meta_title_actual: (p.metaTitle ?? "").trim(),
    meta_description_actual: (p.metaDescription ?? "").trim(),
    slug_actual: slugFromIdeaUrl(p.ideaUrl),
    destinos: uniq(destNames.map(destEs)),
    destinos_original: uniq(destNames),
    paises: countries,
    noches_total: nochesTotal,
    regimen: regimenes.length === 1 ? regimenes[0] : regimenes.length ? regimenes : null,
    hoteles: hotels,
    vuelos: transports,
    vuelo_ida_directo: ida?.directo ?? null,
    aerolinea: uniq(transports.map((t) => t.aerolinea).filter(Boolean) as string[]),
    vuelo_incluido: vueloIncluido,
    origen: origenNombre,
    origen_codigo: origenNombre ? originCode ?? ida?.de ?? null : null,
    origen_es_buenos_aires: origenNombre ? origenNombre === "Buenos Aires" : null,
    traslados: (d.transfers ?? []).length,
    excursiones_tickets: (d.tickets ?? []).map((t) => t.name ?? t.modality).filter(Boolean),
    circuitos_cerrados: closedTours,
    cruceros: cruises,
    seguro_incluido: (d.insurances ?? []).length > 0,
    auto_incluido: (d.cars ?? []).length > 0,
    fecha_salida: p.departureDate ?? null,
    salidas_calendario: fechas.length,
    salidas_futuras: futuras.slice(0, 12),
    ultima_salida_futura: futuras.at(-1) ?? null,
    salidas_pasadas: fechas.length - futuras.length,
    todas_las_salidas_pasadas: fechas.length > 0 && futuras.length === 0,
    precio_por_persona: p.pricePerPerson ? `${p.pricePerPerson.currency} ${Math.round(p.pricePerPerson.amount)}` : null,
    pasajeros: p.counters ? `${p.counters.adults ?? 0} adultos${p.counters.children ? `, ${p.counters.children} menores` : ""}` : null,
    cuotas,
    ribbon: p.ribbonText ?? null,
    tipo_viaje: p.tripType ?? null,
    temas_actuales: (p.themes ?? []).map((t) => t.trim()),
    descripcion: stripHtml(p.description, 700) || null,
    hoy: TODAY,
  };
}

// ----------------------------------------------------------------------------
// Prompt
// ----------------------------------------------------------------------------
const TAX_DESTINO = ["Punta Cana", "Bayahibe", "Cancún", "Riviera Maya", "Aruba", "Curazao", "Jamaica", "Cuba", "San Andrés", "Cartagena",
  "Puerto Plata", "Islas Caimán", "Bahamas", "Panamá", "Búzios", "Río de Janeiro", "Florianópolis", "Maceió", "Porto Seguro", "Natal",
  "Porto de Galinhas", "Maragogi", "Praia do Forte", "Costa do Sauípe", "Arraial d'Ajuda", "Pipa", "Europa", "España", "Italia", "Turquía",
  "Grecia", "Dubái", "Egipto", "Perú", "Argentina", "EEUU", "Orlando", "Nueva York", "Las Vegas", "México", "Sudáfrica", "Kenia", "Tailandia",
  "China", "Escandinavia"];
const TAX_REGION = ["Caribe", "Brasil", "Europa", "Exóticos", "EEUU", "Sudamérica"];
const TAX_TIPO = ["All Inclusive", "Salidas grupales acompañadas", "Fórmula 1", "Rugby", "Mundial 2026", "Eventos deportivos", "Semana Santa",
  "Vacaciones de invierno", "Verano 2027", "Escapadas", "Vuelo directo", "Desde Córdoba", "Desde Rosario"];
const TAX_CAMPANA: Record<string, string> = { "Mejores ofertas": "Mejores Ofertas", "Sale": "Sale Sí, Viajo", "HOT": "Sí, Viajo HOT", "Black": "Black", "RIU": "RIU", "BURGERPALUSA 2026": "BURGERPALUSA 2026" };
const BANNED = ["imperdible", "oportunidad única", "aprovechá", "aprovecha", "última chance", "increíble", "imbatible"];
const BRAND_SUFFIX = " | Sí, Viajo";
const LIMITS = { title: 70, large_title: 110, meta_title: 60, meta_description: 155 } as const;

const SYSTEM_PROMPT = `Sos un experto en SEO para agencias de viajes argentinas. Trabajás para siviajo.com (marca: "Sí, Viajo"), agencia argentina que vende paquetes propios con vuelo + hotel + traslados, salidas grupales acompañadas y paquetes a eventos deportivos. Tu tarea: para cada paquete que te paso (con datos reales extraídos de Travel Compositor), proponer título, subtítulo, meta title, meta description, alt de imagen y temáticas nuevas.

CONTEXTO DE BÚSQUEDA (Search Console, 90 días, sin marca)
- Lo que rankea hoy: "paquetes f1 brasil 2026" (pos 2.3), "paquetes a bayahibe all inclusive 2027" (8.8), "paquetes a maragogi y porto galinhas" (2.5), "paquete a interlagos 2026" (2.2), "paquetes a bayahibe" (11).
- La gente busca con el patrón: paquete(s) a {destino} {all inclusive} {desde buenos aires|córdoba} {2027|verano 2027}.
- Competidores que rankean (Almundo, TurismoCity, Viajobien, Multitravel, Buteler) usan "Paquetes a Punta Cana", "Paquetes a Brasil 2026", "Viajes al Caribe desde Buenos Aires".
- Conclusión: destino primero, siempre; año o temporada explícitos; "All Inclusive" cuando el hotel lo es; origen sólo si NO es Buenos Aires.

REGLAS (estrictas; se validan por programa y, si fallan, te devuelvo los errores para que corrijas)
1. title (es el H1 y la base del slug; MÁXIMO ${LIMITS.title} caracteres contando espacios):
   Formato normal: Paquete a {Destino}{ y Destino2} {All Inclusive|con desayuno|con media pensión}: {N} noches{ desde {Origen} sólo si el origen NO es Buenos Aires} – {Verano 2027|Semana Santa 2027|Salida {dd} de {mes} {aaaa}}
   - Usá " – " (guion largo con espacios) antes de la temporada o la fecha. Destino siempre primero.
   - Régimen: "All Inclusive" si el hotel es all inclusive; "con desayuno" si incluye desayuno; "con media pensión"; si no hay dato, omitilo.
   - Fecha vs temporada: si el paquete tiene UNA sola salida (salidas_calendario = 1, o fecha única), va la fecha al final con el formato "Salida 18 de noviembre 2026". Si tiene varias salidas (salidas_calendario >= 2 o la descripción dice "salidas ..."), va la temporada: "Verano 2027" (salidas de enero a marzo 2027), "Semana Santa 2027" (salidas del 20/03 al 05/04/2027 con temática Easter/Semana Santa), "Vacaciones de invierno 2027" (julio 2027), o un mes/temporada real ("Noviembre 2026", "Primavera 2026", "Fin de año 2026", "Salidas 2027").
   - Eventos: formato "Paquete F1 Brasil 2026: 4 noches en San Pablo + entrada Interlagos". Usá el nombre con el que se busca: "F1 Brasil", "F1 Las Vegas", "F1 Austin" (o "GP de Austin"), "GP México", "Mundial 2026", "Mundial de Rugby 2027", "Rugby Nations Championship", "Burgerpalusa 2026". Para eventos la fecha al final es opcional si no entra.
   - Salidas grupales acompañadas: formato "Salida grupal acompañada a {Europa|Turquía y Grecia|Dubái|Perú}: {N} días, {dd} de {mes} {aaaa}" (días = noches + 1). Si tiene varias salidas, poné las fechas si entran o la temporada.
   - Combinados: "Paquete a Punta Cana y Bayahibe All Inclusive: 9 noches – Verano 2027".
   - Si con la fecha completa no entrás en ${LIMITS.title} caracteres, abreviá el mes ("Salida 21 nov 2026") o dejá sólo mes y año ("Noviembre 2026"); nunca recortes el destino.
   - Estrellas del hotel: escribí "4 estrellas" (nunca "4★" ni símbolos).
   - Prohibido: MAYÚSCULAS sostenidas (sólo siglas: F1, GP, EEUU, USD), "!!", emojis, y las palabras "imperdible", "oportunidad única", "aprovechá", "última chance", "increíble", "imbatible".
   - Tiene que empezar con "Paquete" o "Salida grupal".
2. large_title (subtítulo visible; MÁXIMO ${LIMITS.large_title} caracteres): beneficio concreto con lo que incluye, formato "{N} noches en {hotel} {régimen}, vuelo {directo|con escala} {aerolínea} desde {origen} y traslados. Pagá en cuotas." Sólo con datos reales del resumen; si falta un dato (hotel, aerolínea, estrellas), omitilo, NO lo inventes. "Pagá en cuotas." sólo si cuotas = true. Podés acortar el nombre del hotel (sacar "Hotel", "Resort & Spa", "by ...") para entrar en el límite. En grupales/eventos describí lo incluido real (coordinador, entradas, excursiones, ciudades).
3. meta_title (MÁXIMO ${LIMITS.meta_title} caracteres; termina EXACTAMENTE en "${BRAND_SUFFIX}"): formato "Paquete a {Destino} {All Inclusive} {año o temporada}: {N} noches${BRAND_SUFFIX}". Si no entra, sacá primero el régimen, después las noches; nunca el destino, el año ni la marca. "${BRAND_SUFFIX}" ocupa ${BRAND_SUFFIX.length} caracteres: te quedan ${LIMITS.meta_title - BRAND_SUFFIX.length} para el resto.
4. meta_description (MÁXIMO ${LIMITS.meta_description} caracteres): formato "Viajá a {Destino} {temporada}: {N} noches {régimen}, vuelo desde {origen} y traslados incluidos. Pagá en cuotas. Cupos limitados." Ajustala con lo real (hotel 5 estrellas, vuelo directo, excursión incluida, entrada al GP, coordinador, etc.). Terminá con una llamada a la acción corta ("Cupos limitados.", "Reservá con seña.", "Consultá cuotas.").
5. image_alt (de 4 a 8 palabras, contalas): formato "{Destino}: {algo visual real del destino}". Ejemplos: "Punta Cana: playa de Bávaro con palmeras", "Interlagos: tribunas del GP de Brasil", "Búzios: barcos en la bahía de Armação".
6. Corregí errores de tipeo y acentos del original: "Jamica" → "Jamaica", "Excursón" → "excursión", "Florianopolis" → "Florianópolis", "Bayahíbe" → "Bayahibe", "Cancun" → "Cancún", "Maceio" → "Maceió", "Curacao" → "Curazao", "Sao Paulo" → "San Pablo", "Rio" → "Río", "Dubai" → "Dubái".
7. themes_propuestas: array de strings usando SOLO esta taxonomía (respetá mayúsculas y acentos tal cual):
   - Destino (obligatoria; una. En combinados podés poner dos si las dos están en la lista): ${TAX_DESTINO.join(", ")}.
     Si el destino exacto no está, usá el más cercano que sea la misma zona: Costa Mujeres → Cancún; Playa del Carmen → Riviera Maya; Montego Bay → Jamaica; Nassau → Bahamas; Walt Disney World → Orlando; Austin → EEUU; ciudades de España/Italia → España/Italia; otras ciudades europeas → Europa; Estambul → Turquía; El Cairo → Egipto; Imbassaí → Praia do Forte; Escandinavia para Noruega/Suecia/Dinamarca. Si no hay ninguno razonable (ej. Barbados, Australia, San Pablo, Cabo Verde, Puerto Plata no: ese sí está), poné sólo la región y explicalo en "notas".
   - Región (obligatoria; exactamente una): ${TAX_REGION.join(", ")}. (Argentina → Sudamérica; Australia, Sudáfrica, Asia, Dubái, Egipto, Cabo Verde → Exóticos; Escandinavia, Turquía, Grecia → Europa; México, Panamá, Cartagena, Bahamas, Barbados → Caribe; Perú → Sudamérica.)
   - Tipo (todas las que apliquen): ${TAX_TIPO.join(", ")}. "Eventos deportivos" acompaña siempre a Fórmula 1 / Rugby / Mundial 2026. "Vuelo directo" sólo si vuelo_ida_directo = true. "Escapadas" para 3 a 4 noches dentro de Argentina. "Desde Córdoba"/"Desde Rosario" si el origen es ése. "Verano 2027" si la salida es enero–marzo 2027. "Semana Santa" si cae en Semana Santa 2027.
   - Campaña (SOLO si temas_actuales la trae): "Mejores Ofertas" → "Mejores ofertas"; "Sale Sí, Viajo" → "Sale"; "Sí, Viajo HOT" → "HOT"; "Black" → "Black"; "RIU" → "RIU"; "BURGERPALUSA 2026" → "BURGERPALUSA 2026".
8. notas: una línea corta (puede ser "") con lo que el revisor tenga que saber: dato faltante, salida ya pasada, destino sin temática exacta, cambio de nombre de evento, etc.

DATOS
- Trabajá sólo con los datos del resumen de cada paquete. Lo que no está, no existe: no inventes hoteles, estrellas, aerolíneas ni excursiones.
- Cómo leer el resumen: "hoteles" (nombre, estrellas, régimen, noches), "vuelos" (aerolínea, aeropuertos, directo true/false), "circuitos_cerrados" (grupales/eventos armados como circuito: leé "incluye" y "descripcion" para saber qué trae), "excursiones_tickets", "traslados", "cruceros", "descripcion" (texto del paquete).
- "vuelo_incluido" = false significa que el paquete NO incluye aéreo: no escribas "vuelo desde ..." ni aerolínea; podés decir "sin aéreo" o directamente no mencionarlo. En ese caso "origen" viene null.
- "origen" = null con vuelo_incluido = true o con circuito cerrado: asumí Buenos Aires salvo que la descripción diga otra cosa (entonces NO va origen en el title).
- "salidas_calendario" = 0 significa que el paquete no tiene calendario cargado: decidí fecha única vs. varias con "fecha_salida" y la descripción ("Salidas 2 y 21 de febrero" = varias). "salidas_calendario" >= 2 = varias salidas (en "salidas_futuras" van hasta 12 y en "ultima_salida_futura" la última).
- Nombres bien escritos: "Aerolineas Argentinas" → "Aerolíneas Argentinas", "Sky Airline" → "Sky", "Gol Transportes Aéreos" → "Gol", "Windward Islands Airways" → "Winair".
- Origen: si origen_es_buenos_aires = true, no lo pongas en el title (en large_title y meta_description sí podés decir "desde Buenos Aires"). Si el origen es otro (Córdoba, Rosario, Mendoza, Salta, etc.), ponelo en el title ("desde Córdoba").
- Paquetes BURGERPALUSA: el destino es Buenos Aires y el origen es la provincia; title tipo "Paquete Burgerpalusa 2026 desde Mendoza: 3 noches en Buenos Aires + entradas".
- Si todas_las_salidas_pasadas = true o fecha_salida es anterior a "hoy", usá igual la temporada/fecha que corresponda y avisalo en "notas".
- Voz: español rioplatense, voseo ("Viajá", "Pagá", "Reservá"), tono directo y concreto, sin signos de exclamación dobles ni mayúsculas gritadas.

FORMATO DE RESPUESTA
Respondé ÚNICAMENTE con un array JSON válido (sin markdown, sin texto antes ni después), un objeto por paquete, en el mismo orden en que te los paso, con exactamente estas claves:
[{"tc_id": 123, "title": "...", "large_title": "...", "meta_title": "...", "meta_description": "...", "image_alt": "...", "themes_propuestas": ["...", "..."], "notas": "..."}]
Antes de responder, contá los caracteres de title (≤${LIMITS.title}), large_title (≤${LIMITS.large_title}), meta_title (≤${LIMITS.meta_title}) y meta_description (≤${LIMITS.meta_description}) y las palabras de image_alt (4 a 8). Si algo se pasa, acortalo antes de responder.`;

// ----------------------------------------------------------------------------
// Validación
// ----------------------------------------------------------------------------
type Proposal = { tc_id: number; title: string; large_title: string; meta_title: string; meta_description: string; image_alt: string; themes_propuestas: string[]; notas?: string };
const len = (s: string) => [...(s ?? "")].length;
const CAPS_OK = new Set(["EEUU", "BURGERPALUSA", "LATAM", "USD", "VIP", "MSC", "NBA", "NFL", "UEFA", "FIFA"]);

function validate(pr: Proposal, s: Summary): string[] {
  const e: string[] = [];
  const text = (k: keyof typeof LIMITS) => String((pr as any)[k] ?? "");
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = text(k);
    if (!v.trim()) e.push(`${k}: vacío`);
    if (len(v) > LIMITS[k]) e.push(`${k}: ${len(v)} caracteres, máximo ${LIMITS[k]} (sobran ${len(v) - LIMITS[k]})`);
    for (const b of BANNED) if (v.toLowerCase().includes(b)) e.push(`${k}: contiene la palabra prohibida "${b}"`);
    if (v.includes("!!")) e.push(`${k}: contiene "!!"`);
    if (/\p{Extended_Pictographic}/u.test(v)) e.push(`${k}: contiene emoji`);
    if (/[★☆✩✪]/.test(v)) e.push(`${k}: usá "4 estrellas" en vez del símbolo ★`);
    const caps = (v.match(/\b[A-ZÁÉÍÓÚÜÑ]{4,}\b/gu) ?? []).filter((w) => !CAPS_OK.has(w));
    if (caps.length) e.push(`${k}: mayúsculas sostenidas (${caps.join(", ")})`);
  }
  if (!/^(Paquete|Salida grupal)/i.test(pr.title ?? "")) e.push(`title: tiene que empezar con "Paquete" o "Salida grupal"`);
  if (!(pr.meta_title ?? "").endsWith(BRAND_SUFFIX)) e.push(`meta_title: tiene que terminar exactamente en "${BRAND_SUFFIX}"`);
  const altWords = (pr.image_alt ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (altWords < 4 || altWords > 8) e.push(`image_alt: ${altWords} palabras, tienen que ser entre 4 y 8`);
  if (!(pr.image_alt ?? "").includes(":")) e.push(`image_alt: formato "{Destino}: {algo visual}"`);
  const th = [...new Set(Array.isArray(pr.themes_propuestas) ? pr.themes_propuestas : [])];
  const reg = th.filter((t) => TAX_REGION.includes(t));
  // "Europa" y "EEUU" son destino y región a la vez: cuentan como destino sólo si no hay otro destino
  const destOnly = th.filter((t) => TAX_DESTINO.includes(t) && !TAX_REGION.includes(t));
  const dest = destOnly.length ? destOnly : th.filter((t) => TAX_DESTINO.includes(t));
  const tipo = th.filter((t) => TAX_TIPO.includes(t));
  const camp = th.filter((t) => t in TAX_CAMPANA);
  const unknown = th.filter((t) => !dest.includes(t) && !reg.includes(t) && !tipo.includes(t) && !camp.includes(t));
  if (unknown.length) e.push(`themes_propuestas: fuera de taxonomía: ${unknown.join(", ")}`);
  if (reg.length !== 1) e.push(`themes_propuestas: tiene que haber exactamente una región (hay ${reg.length}: ${reg.join(", ")})`);
  if (dest.length > 2) e.push(`themes_propuestas: máximo dos destinos`);
  if (dest.length === 0 && !(pr.notas ?? "").trim()) e.push(`themes_propuestas: falta destino; si no hay uno razonable explicalo en "notas"`);
  for (const c of camp) {
    const src = TAX_CAMPANA[c];
    if (!s.temas_actuales.some((t) => t.toLowerCase() === src.toLowerCase())) e.push(`themes_propuestas: campaña "${c}" sin temática original "${src}"`);
  }
  if (tipo.includes("Vuelo directo") && s.vuelo_ida_directo !== true) e.push(`themes_propuestas: "Vuelo directo" pero el vuelo de ida no es directo según los datos`);
  if (tipo.includes("All Inclusive") && !JSON.stringify(s.regimen ?? "").includes("All Inclusive") && !/all inclusive|todo incluido/i.test(s.descripcion ?? "")) e.push(`themes_propuestas: "All Inclusive" sin régimen all inclusive en los datos`);
  return e;
}

// ----------------------------------------------------------------------------
// Anthropic
// ----------------------------------------------------------------------------
const client = new Anthropic({ maxRetries: 4 });
let modelInUse = MODEL;
let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };

function extractJsonArray(text: string): any[] {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("["); const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error(`Respuesta sin array JSON: ${cleaned.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function askClaude(items: { summary: Summary; previous?: Proposal; errors?: string[] }[]): Promise<Proposal[]> {
  const parts = items.map((it, i) => {
    let block = `### Paquete ${i + 1} (tc_id ${it.summary.tc_id})\n${JSON.stringify(it.summary, null, 0)}`;
    if (it.previous && it.errors?.length) {
      block += `\n\nPROPUESTA ANTERIOR (rechazada):\n${JSON.stringify(it.previous)}\nERRORES A CORREGIR:\n- ${it.errors.join("\n- ")}`;
    }
    return block;
  });
  const user = `Hoy es ${TODAY}. Generá la propuesta para estos ${items.length} paquete(s). Respondé sólo con el array JSON.\n\n${parts.join("\n\n")}`;
  // Streaming: el pensamiento del modelo cuenta dentro de max_tokens y un lote de 10 supera los 16k;
  // con stream podemos dar 64k sin riesgo de timeout HTTP.
  const run = async (model: string) => client.messages.stream({
    model,
    max_tokens: 64000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  }).finalMessage();
  let res: Anthropic.Message;
  try {
    res = await run(modelInUse);
  } catch (err) {
    if (err instanceof Anthropic.NotFoundError && modelInUse !== FALLBACK_MODEL) {
      console.warn(`Modelo ${modelInUse} no disponible (${err.message}); paso a ${FALLBACK_MODEL}`);
      modelInUse = FALLBACK_MODEL;
      res = await run(modelInUse);
    } else throw err;
  }
  usage.calls++;
  usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens;
  usage.cacheRead += res.usage.cache_read_input_tokens ?? 0; usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
  if (res.stop_reason === "refusal") throw new Error(`El modelo rechazó el lote (refusal)`);
  if (res.stop_reason === "max_tokens") throw new Error(`Respuesta truncada por max_tokens`);
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  const arr = extractJsonArray(text) as Proposal[];
  return arr.map((p) => ({ ...p, tc_id: Number(p.tc_id), themes_propuestas: Array.isArray(p.themes_propuestas) ? p.themes_propuestas.map(String) : [] }));
}

// ----------------------------------------------------------------------------
// CSV
// ----------------------------------------------------------------------------
const q = (v: unknown) => `"${String(v ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
function datosUsados(s: Summary, notas?: string): string {
  const h = s.hoteles.map((x) => [x.nombre, x.estrellas, x.regimen, x.noches != null ? `${x.noches} n` : null].filter(Boolean).join(" ")).join(" + ");
  const parts = [
    `destinos=${s.destinos.join(" y ")}`, s.paises.length ? `país=${s.paises.join("/")}` : null, `noches=${s.noches_total ?? "?"}`,
    h ? `hotel=${h}` : null, s.aerolinea.length ? `aerolínea=${s.aerolinea.join("/")}` : null,
    s.vuelo_ida_directo != null ? `directo=${s.vuelo_ida_directo ? "sí" : "no"}` : null, `origen=${s.origen ?? "?"}`,
    `salida=${s.fecha_salida ?? "?"}`, `salidas_calendario=${s.salidas_calendario}${s.salidas_pasadas ? ` (${s.salidas_pasadas} pasadas)` : ""}`,
    s.traslados ? `traslados=${s.traslados}` : null, s.excursiones_tickets.length ? `excursiones=${s.excursiones_tickets.join("; ")}` : null,
    s.circuitos_cerrados.length ? `circuito=${s.circuitos_cerrados.map((c) => `${c.nombre ?? "sin nombre"} ${c.dias ?? "?"} días`).join("; ")}` : null,
    s.cruceros.length ? `crucero=${s.cruceros.map((c) => c.nombre ?? "sí").join("; ")}` : null,
    `precio=${s.precio_por_persona ?? "?"}`, `cuotas=${s.cuotas ? "sí" : "no"}`, notas?.trim() ? `nota=${notas.trim()}` : null,
  ];
  return parts.filter(Boolean).join(" | ");
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(DETAILS_DIR, { recursive: true });
  let packages: TcPackage[];
  const pkgPath = opt("packages");
  if (pkgPath) {
    const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    packages = Array.isArray(raw) ? raw : raw.package ?? [];
  } else {
    console.log("Bajando la lista de paquetes de TC...");
    packages = await pullPackages();
    const dump = path.join(DETAILS_DIR, `_packages-${TODAY}.json`);
    fs.writeFileSync(dump, JSON.stringify(packages)); console.log(`Lista guardada en ${dump}`);
  }
  let own = packages.filter((p) => p.active && Array.isArray(p.themes) && p.themes.length > 0);
  if (ONLY_IDS) own = own.filter((p) => ONLY_IDS.has(p.id));
  console.log(`Paquetes totales: ${packages.length} | propios (active + themes): ${own.length}`);

  const summaries: Summary[] = [];
  for (const [i, p] of own.entries()) {
    const detail = await cached<TcDetail>(path.join(DETAILS_DIR, `${p.id}.json`), () => tcGet<TcDetail>(`/package/${MICROSITE}/${p.id}`));
    const cal = await cached<TcCalendar>(path.join(DETAILS_DIR, `${p.id}.calendar.json`), () =>
      tcGet<TcCalendar>(`/package/calendar/${MICROSITE}/${p.id}`).catch((err) => { console.warn(`calendario ${p.id}: ${err.message}`); return {}; }));
    summaries.push(buildSummary(p, detail, cal));
    if ((i + 1) % 20 === 0) console.log(`  detalles: ${i + 1}/${own.length}`);
  }
  if (ONLY_FETCH) { console.log(`Detalles cacheados en ${DETAILS_DIR}`); return; }
  if (DRY_RUN) { for (const s of summaries) console.log(JSON.stringify(s, null, 1)); return; }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("Falta ANTHROPIC_API_KEY"); process.exit(1); }

  const byId = new Map(summaries.map((s) => [s.tc_id, s]));
  const proposals = new Map<number, Proposal>();
  const lastErrors = new Map<number, string[]>();
  let pending = summaries;
  if (REUSE_PROPOSALS && fs.existsSync(REUSE_PROPOSALS)) {
    const prev = JSON.parse(fs.readFileSync(REUSE_PROPOSALS, "utf8")) as Proposal[];
    for (const pr of prev) {
      const s = byId.get(Number(pr.tc_id));
      if (!s) continue;
      const errs = validate(pr, s);
      proposals.set(s.tc_id, pr);
      if (errs.length) lastErrors.set(s.tc_id, errs);
    }
    pending = summaries.filter((s) => !proposals.has(s.tc_id));
    console.log(`Reutilizo ${proposals.size} propuesta(s) de ${REUSE_PROPOSALS}: ${proposals.size - lastErrors.size} válidas, ${lastErrors.size} a corregir, ${pending.length} sin propuesta`);
  }

  const batches: Summary[][] = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
  const runBatch = async (batch: Summary[], n: number) => {
    console.log(`Lote ${n}/${batches.length} (${batch.length} paquetes) → ${modelInUse}`);
    let out: Proposal[] = [];
    try { out = await askClaude(batch.map((summary) => ({ summary }))); }
    catch (err: any) { console.error(`  lote ${n} falló: ${err.message}; se reintenta paquete por paquete`); }
    for (const pr of out) if (byId.has(pr.tc_id)) proposals.set(pr.tc_id, pr);
    for (const s of batch) {
      const pr = proposals.get(s.tc_id);
      const errs = pr ? validate(pr, s) : ["sin propuesta en la respuesta del lote"];
      if (errs.length) lastErrors.set(s.tc_id, errs); else lastErrors.delete(s.tc_id);
    }
    console.log(`  lote ${n} listo: ${batch.filter((s) => !lastErrors.has(s.tc_id)).length}/${batch.length} ok`);
  };
  // El primer lote va solo para que el system prompt quede en caché; después, CONCURRENCY lotes a la vez
  if (batches.length) await runBatch(batches[0], 1);
  for (let i = 1; i < batches.length; i += CONCURRENCY) {
    await Promise.all(batches.slice(i, i + CONCURRENCY).map((b, j) => runBatch(b, i + j + 1)));
  }

  // Reintentos individuales (hasta 3) para lo que no pasa la validación
  for (let round = 1; round <= 3 && lastErrors.size; round++) {
    console.log(`Reintento ${round}: ${lastErrors.size} paquete(s) fuera de reglas`);
    for (const [id, errs] of [...lastErrors.entries()]) {
      const s = byId.get(id)!;
      try {
        const [pr] = await askClaude([{ summary: s, previous: proposals.get(id), errors: errs }]);
        if (pr && pr.tc_id === id) {
          const e2 = validate(pr, s);
          const prevErrs = proposals.get(id) ? validate(proposals.get(id)!, s).length : Infinity;
          if (e2.length <= prevErrs) proposals.set(id, pr);
          if (e2.length) lastErrors.set(id, e2); else lastErrors.delete(id);
          console.log(`  ${id}: ${e2.length ? e2.join(" / ") : "ok"}`);
        }
      } catch (err: any) { console.error(`  ${id}: ${err.message}`); }
    }
  }

  if (PROPOSALS_JSON) fs.writeFileSync(PROPOSALS_JSON, JSON.stringify([...proposals.values()], null, 1));

  const header = ["tc_id", "url", "title_actual", "title_propuesto", "large_title_propuesto", "meta_title_propuesto", "meta_description_propuesta",
    "image_alt_propuesto", "themes_actuales", "themes_propuestas", "datos_usados"];
  const lines = [header.map(q).join(",")];
  let invalid = 0;
  for (const s of summaries) {
    const pr = proposals.get(s.tc_id);
    const errs = pr ? validate(pr, s) : ["sin propuesta"];
    if (errs.length) invalid++;
    const url = `https://www.siviajo.com/es/idea/${s.tc_id}/${s.slug_actual}`;
    const notas = [pr?.notas ?? "", errs.length ? `FUERA DE REGLAS: ${errs.join("; ")}` : ""].filter(Boolean).join(" | ");
    lines.push([s.tc_id, url, s.title_actual, pr?.title ?? "", pr?.large_title ?? "", pr?.meta_title ?? "", pr?.meta_description ?? "",
      pr?.image_alt ?? "", s.temas_actuales.join(";"), (pr?.themes_propuestas ?? []).join(";"), datosUsados(s, notas)].map(q).join(","));
  }
  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_CSV, lines.join("\n") + "\n", { encoding: "utf8" });
  console.log(`\nCSV: ${OUT_CSV}`);
  console.log(`Paquetes: ${summaries.length} | con propuesta: ${proposals.size} | fuera de reglas: ${invalid} | modelo: ${modelInUse}`);
  console.log(`Tokens: ${usage.calls} llamadas, in=${usage.input} out=${usage.output} cache_read=${usage.cacheRead} cache_write=${usage.cacheWrite}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
