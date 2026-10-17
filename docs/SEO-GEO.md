# SEO + GEO de siviajo.com — diagnóstico y plan (Fase 14)

Fecha del diagnóstico: 2026-10-17. Objetivo: que siviajo.com salga primero en Google para
"paquetes a {destino}" y que ChatGPT, Gemini y Claude nombren a Sí, Viajo cuando alguien pide
una agencia de viajes en Argentina. Este documento es el plan y la referencia operativa; el
estado de la fase vive en `docs/LOOP-FASES.md`.

## 1. Qué encontré

### 1.1 Tráfico orgánico (Search Console, 90 días al 2026-10-14)

| Métrica | Valor |
|---|---|
| Clics / impresiones / posición media | 12.276 / 330.488 / 8,6 |
| Clics de marca ("si viajo", "siviajo"…) | 5.452 (70 % de los clics con consulta) |
| Clics no-marca | 2.324 en 977 consultas |
| www.siviajo.com | 7.388 clics (1.222 URLs) |
| blog.siviajo.com | 2.570 clics, **351.669 impresiones** (389 URLs) |
| siviajo.com sin www (historia vieja) | 2.680 clics |
| País | Argentina 92 % de los clics; móvil 65 % |

Por plantilla en www (90 días): home 6.139 clics · fichas de paquete 2.532 clics en 496 URLs ·
temáticas 1.222 clics en 246 URLs (todas por consultas de marca) · destinos 30 clics en 140 URLs.

Lo único no-marca que rankea hoy: **F1 Brasil** ("paquetes f1 brasil 2026" pos. 2,3; la ficha
39635286 trae 1.955 clics), el **blog** (Bayahibe clima/mejor época, Aruba shopping/alojarse,
Curazao playas), "paquetes a maragogi y porto galinhas" (2,5), "agencia de viajes buenos aires"
(2,3 con 438 impresiones) y "paquetes a bayahibe all inclusive 2027" (8,8 con 1.389 impresiones).

Tendencia mensual: los clics están planos (3–4,5 k/mes desde julio 2025). Las impresiones
subieron de 71 k (nov 2025) a 204 k (mar 2026) por el blog y cayeron a 88 k en julio 2026 cuando
el blog dejó de publicar (15 posts/mes de dic a may, 2 en junio, 4 en julio, 0 desde agosto).

### 1.2 Problemas técnicos (todos verificados en vivo)

| # | Problema | Impacto |
|---|---|---|
| T1 | `sitemap.xml` es estático (xml-sitemaps.com, enero 2025): 109 URLs, la mayoría ya 404 (ideas vencidas). Google: 0 indexadas de ese sitemap. | Google no descubre las fichas nuevas por sitemap; descubre por navegación. |
| T2 | `packages-sitemap.xml` enviado en marzo 2026 responde **404** (160 URLs, 0 indexadas, 1 error). | Igual que T1. |
| T3 | El sitemap del blog está enviado en la ruta equivocada (`www.siviajo.com/blog/sitemap_index.xml` → 404). El real es `blog.siviajo.com/sitemap_index.xml`. | 121 posts sin sitemap válido en la propiedad. |
| T4 | Todas las páginas de temática (`/es/{id}/{slug}/moreideas`) tienen el mismo `<title>` "Si Viajo Agencia de Viajes" y la misma meta description genérica. | Las temáticas sólo rankean por marca; "paquetes a punta cana" no tiene página que compita. |
| T5 | Páginas de destino (`/es/destination/cun`): título "Sí, Viajo … : Cancún", description "Cancún", sin texto. | 140 URLs indexadas que no aportan. |
| T6 | Sin JSON-LD en www (ni Organization/TravelAgency con las 1.972 reseñas, ni TouristTrip/Offer en las fichas, ni BreadcrumbList). El blog sí tiene Article (Yoast). | Google y los motores de IA no leen la entidad ni los precios de forma estructurada. |
| T7 | 1.471 paquetes activos en TC: **1.375 sin temática**, 745 con título en MAYÚSCULAS, sólo 88 con meta title/description, 74 con descripción. Los ~1.300 circuitos europeos (Madrid, París, Roma…) no tienen descripción en la ficha aunque el closed tour sí trae el día a día. | Fichas delgadas que diluyen el sitio; H1 y slug sin la palabra que se busca. |
| T8 | `hub.siviajo.com` es indexable (307 a /login, 9 impresiones). | Ruido; falta `X-Robots-Tag: noindex`. |
| T9 | No hay `llms.txt` (no hace falta para Google; opcional para otros). robots.txt permite OAI-SearchBot, GPTBot, ClaudeBot, PerplexityBot con crawl-delay 20. Claude-SearchBot no está listado (cae en `*`, permitido). | OK. Nada que bloquee a los motores de IA. |

Lo que está bien: `siviajo.com` → 301 → `www`; canonical correcto; las fichas resuelven por id
(`/es/idea/{id}/cualquier-slug` → 200), así que **cambiar títulos no rompe URLs**; las fichas
son SSR con ~2.000 palabras visibles; el blog es WordPress 6.9 con Yoast y schema Article.

### 1.3 GEO (lo que responde la IA hoy)

SerpAPI, Google Argentina, 2026-10-17:

- "mejores agencias de viajes en argentina": hay **AI Overview** y cita Despegar, Almundo, Juliá
  Tours, Costa Azul Viajes, Argentinian Explorer, un reel de Instagram y un TikTok. Sí, Viajo no
  está en el AIO, pero **sí está 2.ª en el pack local** (4,9★, 1.972 reseñas; 1.ª Mejores Viajes
  4,8★ con 6.355).
- "paquetes a punta cana desde buenos aires all inclusive", "paquetes de viaje a brasil verano
  2027", "agencia de viajes confiable para viajar al caribe desde argentina": AI Overview presente;
  orgánicos Viajobien, TurismoCity, Multitravel, Almundo, Despegar, Buteler, Atrápalo. Sí, Viajo
  no aparece en el top 10 de ninguna.
- Preguntas relacionadas (PAA) que Google muestra: "¿Cómo saber si una agencia de viajes es
  confiable en Argentina?", "¿Cuál es la agencia de viajes más confiable?", "¿Dónde conviene
  comprar paquetes de viajes?", "¿Cuánto vale una semana en Punta Cana todo incluido?".

Activos que la IA todavía no "ve" en forma estructurada: GBP 4,9★ con 1.972 reseñas, Great Place
to Work, 13 años (nota de Ladevi), oficinas en Buenos Aires, Rosario y Córdoba, Instagram y
Facebook, `institucional.siviajo.com`.

Marco: Google dice que optimizar para AI Overviews/AI Mode "sigue siendo SEO" (guía oficial
2026-05-15): indexado + snippet + contenido original. Lo que sí pesa distinto en ChatGPT/Perplexity:
menciones de la marca en terceros (Wikipedia, Reddit, YouTube, listas de "mejores agencias"),
reseñas, y una página de entidad clara. `llms.txt` no es una palanca.

## 2. Objetivo y cómo se mide

Metas a 90 días (desde el 2026-10-20), medidas por los agentes de la sección 3:

| Meta | Hoy | Objetivo |
|---|---|---|
| Clics no-marca (90 días) | 2.324 | 5.000 |
| Consultas "paquetes a {destino}" con siviajo.com en top 10 (de 27 seguidas) | 2–3 | 12 |
| Fichas y temáticas indexadas de las que trae impresiones | sin medir | ≥ 90 % |
| Posts nuevos en el blog por mes | 0 | 8 |
| Sondas de IA donde Sí, Viajo es mencionada (36 por semana) | sin medir | ≥ 8 (22 %) |

## 3. Agentes de medición (construidos el 2026-10-17)

Tres jobs del kernel (`src/lib/jobs/handlers/`), tablero en **`/producto/seo`**, botones "correr
ahora" en la misma pantalla. Migración `20261018_seo_geo.sql` aplicada en producción.

| Job | Cuándo | Qué hace | Presupuesto / flag |
|---|---|---|---|
| `gsc.site_sync` | diario, 06:15 UTC | Search Console de **todo** el dominio: clics e impresiones por página y por consulta (marca vs. no-marca), estado de todos los sitemaps, 25 inspecciones de URL rotando por impresiones (cada URL cada ≥ 14 días). Primera corrida: 28 días; después, cola de 4. | `gsc` 100/día (compartido con `gsc.vuelos_sync`) · `automation.gsc_writes` |
| `serp.track` | lunes 08:00 UTC | Una búsqueda de SerpAPI (Google AR, Buenos Aires, 20 resultados) por consulta activa de `seo_keywords` (45): posición de siviajo.com, URL, AI Overview y a quién cita, pack local, PAA, competidores en el top 10. | `serpapi` 250/día · `automation.serpapi_calls` |
| `geo.probe` | lunes 08:00 UTC | Cada pregunta activa de `geo_prompts` (12) a ChatGPT (`gpt-5.1` + web search), Gemini (`gemini-2.5-flash` + Google Search grounding, Vertex) y Claude (`claude-opus-5-5` + web search), ubicación Argentina. Guarda si nombra o cita a Sí, Viajo, las citas y los competidores. | `llm_probe` 60/día · `automation.geo_probes` |

Tablas: `gsc_page_stats` (ya existía), `gsc_query_stats`, `gsc_url_status`, `gsc_sitemap_status`,
`seo_keywords`, `serp_checks`, `geo_prompts`, `geo_probes`. Las consultas y preguntas se editan en
las tablas (activar/desactivar, agregar); las semillas están en `src/lib/seo/config.ts`.

Código: `src/lib/seo/` (`brand.ts` marca vs. no-marca · `page-types.ts` plantilla por URL ·
`site-sync.ts` · `serp.ts` + `serp-track.ts` · `geo.ts` + `geo-probe.ts` · `engines/` ·
`queries.ts` · `summary.ts` agregaciones del tablero). Tests en `src/lib/seo/__tests__/`.

Pendiente de medición (no entra en esta fase): un tracker de AI Mode de Google (SerpAPI no lo
expone) y Bing Webmaster Tools (alimenta a Copilot y parte de ChatGPT).

## 4. Estructura de temáticas (propuesta)

Hoy hay 46 temáticas en TC mezclando idiomas, duplicados y campañas, y sólo 96 paquetes las usan.
La temática es la **página de categoría**: es donde tiene que aterrizar "paquetes a {destino}".
Propuesta en tres capas:

**A. Destino (MAIN, una por paquete, indexable, en castellano, con el nombre que se busca).**

| Acción | Temáticas |
|---|---|
| Mantener (renombrar al castellano donde haga falta) | Caribe (26) · Punta Cana (934) · Bayahibe (9537) · Cancún (700) · Riviera Maya (9543, absorbe Playa del Carmen 12438) · Aruba (12462) · Curazao (12480) · Jamaica (12450) · Cuba (235) · San Andrés (846) · Cartagena (841) · Costa Rica (18) · Brasil (16) · Búzios (3122) · Río de Janeiro (937) · Europa (79; absorbe 12516 "Europa " y 12519 "Europa") · Asia (84) · EEUU (9216) · Disney (322) · Perú (9630) · Ecuador (12483) · Argentina (5614) · Sudamérica (9663) · Exóticos (12432) |
| Crear (hay producto y hay búsqueda) | Florianópolis · Maceió · Porto Seguro · Natal · Porto de Galinhas y Maragogi · Turquía y Grecia · Dubái · Egipto · Orlando |

**B. Tipo de viaje (SECONDARY, varias por paquete, indexable si tiene ≥ 6 paquetes activos).**
Salidas grupales acompañadas (17112, absorbe "Accompanied Departures") · All inclusive (nueva) ·
Fórmula 1 (9636, absorbe 1145 "formula1" y 12582 "LANENADEF1") · Rugby (14140) · Mundial 2026 (9654)
· Eventos deportivos (14143) · Semana Santa (29 "Easter week") · Vacaciones de invierno (9333) ·
Verano 2027 (5611, absorbe 12174 "Brasil Verano" y 12183 "Paquetes Verano Brasil 2027") ·
Escapadas (169) · Circuitos (nueva, para los 1.300 circuitos mayoristas).

**C. Campañas (no SEO: no van en el menú de destinos ni en el sitemap).** Mejores ofertas (8009),
Sale Sí Viajo (12768), Sí Viajo HOT (10809), SI VIAJO BLACK (14188), RIU (21431), BURGERPALUSA 2026
(12318, es un evento: mantener hasta noviembre 2026 y después desactivar).

Reglas: nombre en castellano y singular ("Punta Cana", no "Paquetes Punta Cana": TC ya arma la
URL); sin espacios al final ni mayúsculas sostenidas; una temática de destino **obligatoria** en
todo paquete (hoy 1.375 no tienen ninguna). Cada página de temática necesita su propio `<title>`
("Paquetes a Punta Cana desde Argentina | Sí, Viajo"), H1, 200–300 palabras propias (por qué ir,
cuándo, qué incluye, 3 preguntas frecuentes reales de la PAA) y enlaces al blog. **Esto se carga
en el backoffice de TC** (la API sólo lista temáticas y asigna temáticas a paquetes).

## 5. Títulos de los paquetes (fórmula)

Lo que la gente escribe es `paquete(s) a {destino} {all inclusive} {desde buenos aires|córdoba}
{2027|verano 2027}`. Reglas (aplicadas en `docs/seo/titulos-propuestos-2026-10-17.csv`):

| Campo | Regla | Ejemplo |
|---|---|---|
| `title` (H1 + slug, ≤ 70) | `Paquete a {Destino}{ y Destino2} {All Inclusive\|con desayuno}: {N} noches{ desde {Origen} si no es BUE} – {temporada\|fecha}`. Destino primero. Sin MAYÚSCULAS, "!!", emojis, "imperdible", "oportunidad única", "última chance". Eventos: el nombre con el que se busca. | "Paquete a Bayahibe All Inclusive: 9 noches – Verano 2027" · "Paquete F1 Brasil 2026: 4 noches en San Pablo + entrada Interlagos" · "Salida grupal acompañada a Europa: 17 días, 20 de marzo 2027" |
| `largeTitle` (≤ 110) | Lo que incluye, con datos reales: hotel, régimen, vuelo directo/aerolínea, origen, traslados, cuotas. | "9 noches en Catalonia Bayahibe all inclusive, vuelo directo Arajet desde Buenos Aires y traslados. Pagá en cuotas." |
| `metaTitle` (≤ 60, termina en " \| Sí, Viajo") | `Paquete a {Destino} {All Inclusive} {temporada}: {N} noches \| Sí, Viajo`. Si no entra, se saca primero el régimen, después las noches; nunca el destino ni la marca. | "Paquete a Bayahibe All Inclusive 2027: 9 noches \| Sí, Viajo" |
| `metaDescription` (≤ 155) | `Viajá a {Destino} {temporada}: {N} noches {régimen}, vuelo desde {origen} y traslados. Pagá en cuotas. Cupos limitados.` + CTA. | — |
| Circuitos mayoristas | Capitalizar ("Circuito Madrid y Andalucía: 8 días, salida los martes") y generar la descripción desde el día a día del closed tour (`closedTours[0].description` + `includedServices`), en tandas de 50 con muestreo humano, empezando por los que tienen impresiones. Nunca los 1.300 de golpe. | — |

Qué se puede escribir por API (`PUT /package/siviajo/{id}`, `IdeaUpdateRequestVO`): `title`,
`largeTitle`, `description`, `themes`, `remarks`, `active`, `visible`. **`metaTitle` y
`metaDescription` sólo por backoffice** (el bot `tc-requote-bot seo:manual` ya lo hace, pero el
login web de HUBSIVIAJO pide OTP desde 2026-10-17: hace falta el código del buzón o un usuario sin
2FA). Cambiar el título cambia el slug pero la URL vieja sigue respondiendo 200 con canonical a la
nueva.

## 6. Técnico (TC, GTM, DNS)

| # | Qué | Cómo | Quién |
|---|---|---|---|
| T1/T2 | Sitemap de paquetes y temáticas **servido por HUB** (`hub.siviajo.com/sitemaps/siviajo-packages.xml`: fichas activas propias + temáticas con ≥ 1 paquete; `lastmod` = última actualización en TC) y enviado por API a la propiedad de dominio (Google acepta sitemaps de otro host dentro de la misma propiedad). Borrar el `sitemap.xml` estático y `packages-sitemap.xml` de la propiedad. | HUB (job `seo.sitemap`, siguiente iteración) |
| T3 | Enviar `https://blog.siviajo.com/sitemap_index.xml` y borrar el de la ruta mala. | HUB (API) — 2 llamadas |
| T6 | JSON-LD: `TravelAgency` + `aggregateRating` (4,9/1.972) + `sameAs` + oficinas en la home e institucional; `TouristTrip` + `Offer` (precio, moneda, fechas) + `BreadcrumbList` en las fichas. TC no tiene campo de schema: va por **GTM (GTM-WR6MCZWL, custom HTML)** leyendo título/precio del DOM, o por el "código en head" del microsite si TC lo permite. Googlebot renderiza JS; GPTBot no, así que la entidad también va en texto plano en "Sobre nosotros". | Ezequiel (acceso GTM; la publicación está trabada por `compilerError` desde septiembre) |
| T8 | `X-Robots-Tag: noindex` en todo hub.siviajo.com salvo `/vuelos-baratos`. | HUB (middleware, 5 líneas) |
| — | Bing Webmaster Tools: verificar `siviajo.com`, enviar sitemaps, IndexNow. ChatGPT y Copilot leen Bing. | Ezequiel (cuenta) + HUB (IndexNow) |

## 7. GEO: entidad, reseñas y menciones

1. **Página de entidad** ("Sobre Sí, Viajo", en www y en institucional): legajo EVT, 13 años,
   oficinas con dirección y teléfono (NAP idéntico al de GBP), 1.972 reseñas 4,9★ con enlace a
   Google, Great Place to Work, prensa (Ladevi), equipo con nombres, política de atención 24/7,
   medios de pago y cuotas. Texto plano + JSON-LD. Es lo que ChatGPT/Claude leen cuando alguien
   pregunta "¿Sí Viajo es confiable?" (hoy 412 impresiones/90 días para "opiniones de sí, viajo").
2. **Reseñas**: widget de Google en home y fichas (con `aggregateRating`), responder el 100 % de
   las reseñas, pedir reseña post-viaje desde el CRM (ya hay WhatsApp). Trustpilot no hace falta.
3. **Menciones en terceros** (es lo que más pesa en ChatGPT/Perplexity): aparecer en las notas
   "mejores agencias de viajes de Argentina" (Ladevi, Report, Mensajero, Infobae/La Nación
   turismo), en TripAdvisor forum y en hilos de Reddit r/argentina respondiendo **como la empresa**
   y sin astroturfing; YouTube con videos de destinos (la correlación más alta con citas de IA).
4. **Contenido que responde las PAA**: "¿Cómo saber si una agencia de viajes es confiable en
   Argentina?" (legajo, cómo verificarlo, qué pedir), "¿Cuánto cuesta un viaje al Caribe desde
   Argentina en 2027?" (con precios reales del catálogo, actualizados por job), "Punta Cana vs
   Bayahibe", "Mejor época para viajar a {destino}" para los 10 destinos que faltan.
5. **Blog**: volver a 8 posts/mes. Pipeline en HUB (siguiente iteración): brief semanal desde
   consultas "para subir" + PAA + Tendencias → borrador con Claude → aprobación humana →
   publicación en WordPress por REST (`blog.siviajo.com`, hace falta una application password) →
   cada post enlaza a la temática y a 2 fichas vigentes (hoy los posts enlazan sólo a la temática).

## 8. Plan de ejecución

| Semana | Qué | Depende de |
|---|---|---|
| 0 (hecha, 2026-10-17) | Diagnóstico, agentes de medición, tablero, migración, CSV de títulos propuestos, skill `claude-seo` instalada. | — |
| 1 | Deploy (push a `main`). Primera corrida de los 3 jobs (baseline). Sitemap del blog por API. `noindex` en hub. Decidir la taxonomía de temáticas (sección 4) y aprobar el CSV de títulos. | Ezequiel: revisar CSV y taxonomía |
| 2 | Aplicar títulos + `largeTitle` + temáticas por API a los 96 paquetes propios (job `tc.write` con flag). Cargar en backoffice meta title/description de los 30 con más impresiones y el título/H1/texto de las 12 temáticas de destino. | Ezequiel: OTP o usuario sin 2FA para el backoffice |
| 3 | Sitemap de paquetes/temáticas desde HUB + envío por API; borrar sitemaps viejos. JSON-LD por GTM (home + fichas). Página de entidad. | Ezequiel: GTM |
| 4 | Pipeline del blog (brief → borrador → aprobación → WordPress). 4 posts: dos PAA de confianza, dos destinos. | Ezequiel: application password de WordPress |
| 5–8 | Circuitos mayoristas: 50 por semana con descripción generada y título capitalizado, midiendo indexación. Bing Webmaster + IndexNow. Menciones en terceros (PR). | — |
| 12 | Revisión contra las metas de la sección 2 con el tablero. | — |

## 9. Operación

- Tablero: `/producto/seo` (sección `producto`). Kill switches y presupuestos: `/automatizacion`.
- Correr a mano: botones del tablero o `POST /api/seo/monitor/{gsc|serp|geo}` (prioridad manual,
  dedupe por día). Script de baseline sin runner: `npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-baseline.ts [gsc|serp|geo|all]`.
- Agregar una consulta a medir: fila en `seo_keywords` (`intent`: destino | evento | categoria |
  informativo | marca). Agregar una pregunta a la IA: fila en `geo_prompts`.
- Modelos de las sondas (variables de entorno opcionales): `GEO_OPENAI_MODEL` (gpt-5.1),
  `GEO_ANTHROPIC_MODEL` (claude-opus-5-5), `GEO_GEMINI_MODEL` (gemini-2.5-flash),
  `GEO_GEMINI_LOCATION` (us-central1). Gemini usa la service account de `GOOGLE_DRIVE_CREDENTIALS`
  y `GOOGLE_CLOUD_PROJECT_ID`.
- Propuestas de títulos: `docs/seo/titulos-propuestos-2026-10-17.csv`; se regeneran con
  `scripts/seo-title-proposals.ts`.
- Skill de Claude Code instalada el 2026-10-17: `claude-seo` v2.4.2 (`~/.claude/skills/seo*`,
  26 sub-skills: `/seo audit`, `/seo geo`, `/seo schema`, `/seo sitemap`, `/seo local`…).
