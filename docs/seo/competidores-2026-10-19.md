# Competidores SEO de siviajo.com en Google Argentina — análisis comparativo

**Fecha:** 2026-10-19. **Método:** lectura de páginas públicas con `curl -sL` (User-Agent Chrome 130), WebFetch cuando curl falló, y WebSearch sólo para ver títulos indexados de los sitios que bloquean el acceso. No se tocó ningún repositorio ni base de datos. Todos los HTML descargados quedaron en el scratchpad de la sesión (`/private/tmp/claude-501/-Users-ezequielmayoni-hub/c8dbe48f-9029-4df8-80f6-79bf5fcefaf5/scratchpad/comp/`).

**Contexto (SerpAPI 2026-10-17, 45 consultas comerciales):** apariciones en top 10 → TurismoCity 29, Despegar 27, Almundo 25, Viajobien 23, Atrápalo 21, Deturista 14, Multitravel 10, Promociones Aéreas 8, Buteler 7, Juliá Tours 7. Sí, Viajo 4 (F1 Brasil y Bayahibe).

"Palabras visibles" = texto real en el HTML servido por el servidor (sin scripts ni estilos), medido con un parser propio. Si el sitio renderiza en el cliente (CSR), el número refleja lo que Google ve en la primera pasada, antes de ejecutar JS.

---

## 1. Tabla resumen

| Sitio | Render | Landings por destino (patrón) | Landings por origen | Ofertas con URL indexable | Palabras landing Punta Cana | JSON-LD | Reseñas visibles | Blog | Pág. confianza | Cuotas visibles |
|---|---|---|---|---|---|---|---|---|---|---|
| **despegar.com.ar** (ref.) | Bloquea curl/WebFetch (403, también con UA Googlebot). Sitemaps sí accesibles | Sí: 1.017 en `sitemaps/paquetes.xml` → `/paquetes/puj/paquetes-a-punta+cana` (ciudad, ~900) y `/paquetes/pais/do/paquetes-a-republica-dominicana` (114 países) | Sí (indexadas, fuera del sitemap): `/paquetes/bue/puj/paquetes-a-punta+cana-desde-buenos+aires`, `/paquetes/cor/puj/…-desde-cordoba` | No (`/trip/`, `/book/` en Disallow) | n/d (bloqueado). Según snippets de Google: hotel + precio USD por persona + fecha | n/d | n/d | No (sí "guías"/actividades) | n/d | n/d |
| **turismocity.com.ar** (ref.) | Cloudflare "Just a moment" (403 a curl, WebFetch y UA Googlebot); robots.txt sí | Existe sección `/paquetes-turisticos/` (robots bloquea sólo `…/r.html` = resultados). Lo que Google muestra para "paquetes" son **notas editoriales** `/promociones_aereas/p-{slug}-{id}.html` | n/d | n/d | n/d | n/d | n/d | Sí, es su arma: "¿Cuánto cuesta viajar a Punta Cana? Presupuesto…", "Los mejores paquetes turísticos para tus vacaciones de verano" | n/d | Sí en notas ("9 cuotas sin interés de $106.953") |
| **almundo.com.ar** (ref.) | **CSR Angular**: HTML de 4,7 KB, `<title>` vacío, 0 palabras (igual con UA Googlebot) | Sí: 61 en `sitemap-paquetes.xml` → `/paquetes-turisticos/destinos/1330536/paquetes-a-punta-cana` + regiones `/paquetes-turisticos/regiones/paquetes-turisticos-al-caribe` | No | No (`/packages/detail` Disallow) | 0 servidas | Ninguno en el HTML | No | No | No vista | Sí: `/promociones-bancarias#bbva-3-6-9-12-cuotas…` (ancla por banco) |
| **viajobien.com** | Next.js. Landings `/paquetes/landing/*` **SSR**; páginas de destino y ofertas **CSR** ("Cargando paquetes") | Dos capas: `/paquetes/punta-cana` (CSR, 114 palabras, sin H1) y `/paquetes/landing/paquetes-al-caribe` (SSR, 3.416 palabras, ~40 paquetes con H1 cada uno) | No | Sí pero CSR: `/paquetes/samaná---all-inclusive/22229?month=4&keyword=…` (115 palabras, sin H1 ni canonical) | 114 (destino) / 3.416 (landing Caribe) | **Ninguno** | No | No (`/paquetes/landing/inspirate-bien` es un listado de ofertas) | No en el dominio (institucional en landing.viajobien.com); footer con Leg DNT 10598, CUIT, CACE, "ATENCIÓN VIRTUAL" | Sólo H2 "Todas las opciones de pago y financiación" + logos SVG |
| **buteler.tur.ar** (Córdoba) | SSR (plataforma MKTE), ISO-8859-1. **Sin robots.txt (404 HTML) y sitemap.xml vacío** | Por país: `/viajes_a_republica_dominicana`, `/viajes_a_brasil`, `/viajes_a_aruba`… (sin H1, texto tipo Wikipedia) + tags `/spider/buscar/paquetes/tag:viajes-al-caribe` (65 productos, 2.442 palabras) | Sí, por tag: `/tag/viajes_internacionales_desde_rosario`, `…desde_salta`, `/tag/salidas_desde_cordoba` (redirigen por JS a `/spider/buscar/…`) | **Sí, SSR y con slug keyword-rich**: `/paquetes/paquetes_de_viajes_a_punta_cana_desde_cordoba` (H1 igual, 2.022 palabras) | 643 (país) / 2.022 (oferta) | Ninguno | No | No | `/texto/quienes_somos` (legajo 15.421, fundador, sin años) | No (ni precios: "Salidas: Diarias", sin USD) |
| **deturista.com** | SSR (PHP). Sin sitemap (404) | Por país: `/destino/caribe-2/republica_dominicana-31` (65 destinos en el menú). **No hay URL propia de Punta Cana** (es un filtro "Ciudad de destino") | No como URL; filtro "Salida desde Buenos Aires / Córdoba / Mendoza / Rosario" dentro de la oferta | **Sí, SSR y muy completas**: `/paquete/1684/paquete_a_playas_de_rep_dominicana_de_8_a_15.html` (4.700 palabras, salidas Oct 2026–Dic 2027, 634 precios) | 535 (país) / 4.700 (oferta) | Ninguno | No | No | `/sobre_nosotros.html` (equipo con fotos, "Sucursal Office Park"; sin legajo en texto) | **Sí, en todo**: "USD 1.428 · 12 cuotas de $ 213.982" |
| **multitravel.com.ar** | Next.js **SSR** | Resultados indexables como landing: `/paquetes-prearmados/resultados/paquetes-al-caribe-verano-2027` (H1 ok, pero sólo Isla Margarita) | **Sí, ×9 orígenes**: `…/Paquetes-al-Caribe-Verano-2027-desde-Rosario`, `-Cordoba`, `-Mendoza`, `-Salta`, `-Santa-Fe`, `-Tucuman`, `-Neuquen`, `-Resistencia`, `-Jujuy` | No (`/paquetes-prearmados/detalles/` Disallow) | 614 | Home: TravelAgency + **AggregateRating 4,4 (532)** + **FAQPage**; landings: ninguno | Home: "¿Qué opinan nuestros viajeros?" | No | `/quienes-somos` ("+250 años de experiencia" sumados, sin H1); legajo 18095 en footer | Sí: "Volá en 3, 6, 9 y 12 cuotas", `/vuelos-internacionales-en-cuotas` |
| **promociones-aereas.com.ar** | WordPress + Yoast, SSR | Hubs: `/ciudad/punta-cana` (vuelos, 3.358 palabras), `/paquetes/paquetes-a-punta-cana`, `/paquetes/all-inclusive/all-inclusive-punta-cana` (88 páginas `/paquetes/`), `/destino/` (19), `/pais/` (103), `/ciudad/` (332), `/evento/` (15) | Sí dentro de los posts ("…desde Buenos Aires", "…desde Córdoba") | Son posts (`/2026/10/imperdibles-paquetes-a-punta-cana-…-pa-p.html`, Article) | 3.565 (hub paquetes) | CollectionPage + **FAQPage** + Organization + AggregateRating 4,5 (50) / 4,7 (671) en `product` (sin reseñas visibles) | No (sólo el schema) | **Sí, ~20 posts/día**: 126 posts entre 13 y 19-oct; evergreen 202; guías 11 | `/sobre-promociones-aereas` (es un blog de afiliación, no una agencia) | Sí, en títulos ("y en Cuotas") |
| **juliatours.com.ar** | SSR (PHP), ISO-8859-1. Raíz = redirect JS a `index.php`. Sin robots (404 IIS) ni sitemap | `micrositio.php?id=66` (República Dominicana), `?id=3` (Brasil): misma meta description en todas, sin H1/H2/canonical | Texto "Salidas desde BUE / ROS / MDZ / COR / SLA" (sin URL) | No (PDF/programación) | 1.485 | Ninguno | No | No | Link al legajo 1784 (turismo.gob.ar). **Es mayorista B2B** ("Acceso Agencias") | No |
| **atrapalo.com.ar** | Anti-bot "Client Challenge" (3 KB) a curl, WebFetch y UA Googlebot; **no pude leer HTML**. Sitemaps sí | **40.000** landings `/paquetes/{destino}_d{id}.html` (`punta-cana_d606` y `_d594`, duplicadas), 42 categorías `_c` (`sol-y-playa_c1645`, `luna-de-miel_c1650`, `caribe_c1740`), 34 getaways | No | **Sí, 243**: `/paquetes/punta-cana-all-inclusive-en-cuotas-sin-interes_v69340.html` — con title genérico "Atrápalo, reserva de hoteles, vuelos y espectáculos" | n/d | n/d | Reseñas indexables (`Allow: /opiniones/reviews/`) | "Houdinis" (`/houdinis/punta-cana-all-inclusive/`) | n/d | Sí (slug "en cuotas sin interés"; snippet: "$2.345.851, 10% off") |
| **costaazulviajes.com.ar** (BA) | PrestaShop SSR. Sitemap 548 URLs | Categorías `/65-america-y-caribe`; "landing" Punta Cana = producto `/44-paquete-a-punta-cana-all-inclusive.html` | No (sí productos "Bayahibe All Inclusive - desde Córdoba / desde Tucumán") | Sí, SSR (`/{id}-{slug}.html`, ~400) | 1.872 | **Product + Offer (USD 1463) + BreadcrumbList + TravelAgency** | **Sí: widget Google "4,8 ★ 154 opiniones"** en home y quiénes somos | Sí, **70 posts** (`/blog`: Nueva York, Barcelona, Patagonia, "Viajar barato") | `/content/4-sobre-nosotros` (H1 "especialistas en viajes desde 2005", "Más de 20 años", legajo 12458 también en el header) | No en texto |
| **mejoresviajes.com.ar** (CABA) | PHP mínimo. Sin robots/sitemap | No (`paquetes-aereos`, `paquetes-bus`) | No | `paquetes_view.php?wVarPaqueteID=406`, mismo title ":: Mejores Viajes ::" | — (no vende Caribe; termas en bus) | Ninguno | No | No | No | "Ahora 6 y Ahora 12" |
| **avantrip.com** | **301 a almundo.com.ar/avantrip** (marca absorbida) | — | — | — | — | — | — | — | — | — |
| **baviajes.com.ar** | **No resuelve DNS** el 2026-10-19 (curl y WebFetch: "Could not resolve host") | — | — | — | — | — | — | — | — | — |
| **ativiajes.com** | **SPA React** (`<div id="root">`, 8,3 KB para todas las URLs, también con UA Googlebot): 0 palabras servidas | Arquitectura correcta en el sitemap (250 URLs): `/destino/punta-cana` (21), `/region/caribe` (13) | Sólo en slugs de oferta: `/paquetes/238/paquete-a-punta-cana-volando-desde-cordoba`, `/239/…-desde-tucuman` | Sí, 201 `/paquetes/{id}/{slug}` — pero vacías sin JS | 0 | Ninguno | `/reviews` existe (vacía sin JS) | `/inspirate/` (4) | `/nosotros` (og: "más de 50 años") | n/d |
| **escaparateviajes.tur.ar** (Lomas de Zamora) | SSR (MKTE, misma plataforma que Buteler). Sitemap vacío | No hay landing por destino; `/europa`, `/circuitos`, `/escapadas` | No | Sí, SSR: `/agencia/paquete/paquetes-turisticos-verano-caribe-crucero` (H1, 1.143 palabras, fechas, U$S) | 1.143 (oferta Caribe+crucero; no hay Punta Cana) | Ninguno | No (contador "Clientes Satisfechos") | No | `/nosotros` ("empresa familiar", 263 palabras); description "más de 10 años"; legajo en footer | "Pagá tu viaje en cuotas", "¡ABONÁ TU VIAJE EN CUOTAS FIJAS!" |
| **planisferioviajes.com.ar** (Córdoba, franquicias) | SSR (Next). Sitemap 60: 8 paquetes, 44 sucursales, 9 blog | `/paquetes/punta-cana-all-inclusive` (195 palabras, "Desde USD 1650", texto "test test test") | No (sí 44 páginas `/sucursales/{ciudad}` = SEO local) | Son los 8 paquetes | 195 | **TravelAgency/LocalBusiness + OfferCatalog + Trip + Offer**; blog con BlogPosting | "Lo que dicen nuestros viajeros · 5.0 · +24 k reseñas" (testimonios, sin AggregateRating) | Sí, 9 posts (`/blog/punta-cana-el-rey-del-caribe-all-inclusive-para-argentinos`, 879 palabras) | `/sobrenosotros` ("Más de 15 años", legajo 17287) | "Europa Clásica en Cuotas !" |

---

## 2. Los grandes (referencia)

### Despegar
- No pude abrir ninguna página HTML (403 a curl, a WebFetch y con User-Agent Googlebot). Sí leí `https://www.despegar.com.ar/sitemaps/sitemap_index.xml` y sus 10 sub-sitemaps: `paquetes.xml` (1.017 URLs), `hoteles.xml` (5.410), `vuelos.xml` (3.724), `sitemap-vuelos-destino-mes-ar.xml` (43), `sitemap-vuelos-estado-ar.xml`, actividades, autos, alquileres temporarios, aerolíneas.
- Patrón de paquetes: `/paquetes/{iata}/paquetes-a-{ciudad}` (`/paquetes/puj/paquetes-a-punta+cana`) y `/paquetes/pais/{cc}/paquetes-a-{pais}`. Google además indexa **variantes por origen** que no están en el sitemap: `/paquetes/bue/puj/paquetes-a-punta+cana-desde-buenos+aires` y `/paquetes/cor/puj/paquetes-a-punta+cana-desde-cordoba`, con título "Paquetes turísticos a Punta Cana".
- En vuelos van más lejos: por aerolínea (`/vuelos/aerolinea/puj/0j/vuelos-a-punta+cana-por-jetsmart`), por origen (`/vuelos/bue/...`, 363 URLs) y **por mes** (`/vuelos/bue/puj/01/vuelos-a-punta+cana-desde-buenos+aires-en-enero`).
- Bug visible en el índice: varias URLs de paquetes tienen título "¿Vas para {destination}?" (placeholder sin reemplazar). Los snippets muestran hotel + precio por persona en USD + fecha concreta (ej. "Hotel Maracas Punta Cana desde Buenos Aires US$757").
- Las ofertas no son indexables (`Disallow: /trip/bundle/`, `/trip/start/`, `/book/`): toda la autoridad va a la landing.

### TurismoCity
- Cloudflare bloquea todo (`<title>Just a moment...</title>`), incluso el sitemap. `robots.txt` sí: bloquea resultados (`/paquetes-turisticos/r.html`, `/vuelos/resultados*`, `/hoteles-en-*/search`) y a los bots de IA (GPTBot, ClaudeBot, Anthropic-AI, CCBot, Google-Extended, Meta-ExternalAgent, Bytespider).
- Lo que Google devuelve de TurismoCity para consultas de paquetes son **notas editoriales con fecha de actualización**: `https://www.turismocity.com.ar/promociones_aereas/p-cuanto_cuesta_viajar_a_punta_cana_presupuesto_para_tus_vacaciones_2r2-8945.html` (feb-2026, "ARS 2,4 M por 7 noches"), `…/p-los_mejores_paquetes_turisticos_para_tus_vacaciones_de_verano-6627.html` (act. nov-2025), `…/p-3_paquetes_turisticos_multidestino_para_conocer_mas_de_un_lugar-9320.html` (abr-2026, "9 cuotas sin interés de $106.953"). Es decir: sus 29 apariciones son mayormente contenido informativo con precio orientativo, no landings transaccionales.

### Almundo
- CSR Angular: `https://almundo.com.ar/paquetes-turisticos/destinos/1330536/paquetes-a-punta-cana` devuelve 4,7 KB, `<title></title>` vacío, 0 palabras; sólo la meta description genérica "Descubrí increíbles ofertas de paquetes en Almundo…". Igual con UA Googlebot.
- Sitemap bien segmentado (11 archivos): paquetes 61 (`/paquetes-turisticos/destinos/{id}/paquetes-a-{slug}`, regiones `/paquetes-turisticos/regiones/paquetes-turisticos-al-caribe`), promociones 42 (`/promociones/hot-sale`, `/promociones/travel-sale`, `/promociones-bancarias#bbva-3-6-9-12-cuotas-sin-interes` con un ancla por banco; también basura vieja como `/promociones/mundial-rusia-2018`).
- Ofertas no indexables (`/packages/detail`, `/packages/results` en Disallow). `avantrip.com` redirige a `almundo.com.ar/avantrip`.

---

## 3. Competidores "a ganar", uno por uno

### Viajobien (23 apariciones)
- **Bien:** landings SSR de larga cola bajo `/paquetes/landing/{slug}`: `https://www.viajobien.com/paquetes/landing/paquetes-al-caribe` tiene 3.416 palabras, H1 "Paquetes Turísticos Al Caribe", ~40 paquetes cada uno con su H1 ("Punta Cana - All Inclusive", "Punta Cana y Bayahibe - All Inclusive", "Punta Cana en Navidad"), "desde" ×80 y meses 2026/2027. `paquetes-a-europa` tiene 3.783 palabras. Teléfonos 7078-8282 / 0810 y WhatsApp en todas las páginas.
- **Mal:** la página de destino que debería rankear, `https://www.viajobien.com/paquetes/punta-cana`, es CSR: 114 palabras, H2 "Cargando paquetes", sin H1, sin description, title con slug crudo "Paquetes a punta-cana | Viajobien! Argentina". Las ofertas (`/paquetes/samaná---all-inclusive/22229?month=4&keyword=paquetes-al-caribe`) también son CSR, sin H1 ni canonical, con query strings que duplican. Cualquier slug inexistente responde 200 (`/paquetes/landing/punta-cana` → shell de 39 KB: soft-404). `robots.txt` y `sitemap.xml` redirigen 307 a la home. Cero JSON-LD, cero reseñas, sin "quiénes somos" en el dominio (va a landing.viajobien.com), y el footer dice "ATENCIÓN VIRTUAL | Domicilio Virtual".
- **Lección:** rankean por volumen de paquetes con fechas y "desde" en landings SSR, no por confianza ni por estructura de destino. Es atacable con una landing de Punta Cana que sea SSR, con H1 real y señales de confianza.

### Buteler (7 apariciones; Córdoba)
- **Bien:** slugs de oferta que son la consulta exacta: `https://www.buteler.tur.ar/paquetes/paquetes_de_viajes_a_punta_cana_desde_cordoba` (H1 "PAQUETES A PUNTA CANA DESDE CORDOBA ALL INCLUSIVE", 2.022 palabras, canonical correcto), `viajes_a_bayahibe_desde_buenos_aires`, `viajes_a_la_romana_desde_rosario`, `viajes_a_la_romana_desde_salta`. Tags por origen (`/tag/viajes_internacionales_desde_rosario`, `/tag/salidas_desde_cordoba`). 65 productos de Caribe en `…/tag:viajes-al-caribe`. Meta descriptions largas con todas las variantes ("PAQUETES DE VIAJES A BAYAHIBE, SAMANA, LA ROMANA, PUNTA CANA. Salidas… desde Cordoba, Buenos Aires, Rosario").
- **Mal:** sin `robots.txt` (devuelve un 404 HTML) y `sitemap.xml` vacío; charset ISO-8859-1; landings de país sin H1 (`https://www.buteler.tur.ar/viajes_a_republica_dominicana` abre con texto copiado de Wikipedia: "ocupa algo más de los dos tercios orientales de La Española… censo de 2013"); **sin precios** ("Salidas: Diarias", ni un USD en la oferta); sin JSON-LD, sin reseñas, sin cuotas; los tags por origen redirigen por JavaScript a `/spider/buscar/paquetes/tag:…`. "Quiénes somos" sin años ni oficinas (sólo legajo 15.421 y el fundador).
- **Lección:** copiar la fórmula del slug/H1 "paquetes a punta cana desde córdoba" y superarlos con precio, fechas y reseñas.

### Deturista (14 apariciones)
- **Bien:** páginas de oferta SSR muy ricas: `https://www.deturista.com/paquete/1684/paquete_a_playas_de_rep_dominicana_de_8_a_15.html` (4.700 palabras, salidas mes a mes Oct 2026 → Dic 2027, 634 precios, filtros "Salida desde Buenos Aires / Córdoba / Mendoza / Rosario", hotelería 3-5★, vuelo directo/escala, equipaje). Precio + financiación en todos lados ("USD 1.428 · 12 cuotas de $ 213.982"). Mega-menú con 65 landings de país (`/destino/caribe-2/republica_dominicana-31`) y 95 ofertas enlazadas desde la home. Venta telefónica 0810 y "Antártida en 12 cuotas sin interés".
- **Mal:** **no existe una URL de Punta Cana** (es un filtro "Ciudad de destino" dentro de República Dominicana); landings de país sin H1 y con title "deturista.com - Encontrá tu paquete para viajar a República Dominicana"; la oferta tiene tres H1 (uno es "Ordenar salidas por"); sin JSON-LD, sin FAQ, sin reseñas, sin legajo en texto, sin sitemap (404), sin blog. `/sobre_nosotros.html` muestra el equipo pero no años ni oficinas (`/sucursales.html` da 404).
- **Lección:** ganan por fechas + precio + cuotas en la oferta. Para pasarlos: landing de Punta Cana propia con tabla de precios por mes, cuotas y schema.

### Multitravel (10 apariciones)
- **Bien:** la mejor arquitectura de **temporada + origen** del grupo: `https://multitravel.com.ar/paquetes-prearmados/resultados/paquetes-al-caribe-verano-2027` y 9 variantes `…-desde-Rosario/Cordoba/Mendoza/Salta/Santa-Fe/Tucuman/Neuquen/Resistencia/Jujuy` (H1 y title exactos, canonical, "Precio por persona en Base Doble USD 1.490 + USD 293 Impuestos", salidas "Viernes 1,8,15,22,29 de Enero"). Home con JSON-LD TravelAgency + **AggregateRating 4,4 (532)** + **FAQPage** ("¿Es confiable organizar mi viaje con Multitravel?", "¿Multitravel ofrece financiación…?"), legajo 18095, cuotas 3/6/9/12, páginas de evento (`/mundial-2026-desde-buenos-aires`, `/hotsale`, `/travelsale`, `/vuelos-internacionales-en-cuotas`), 29 landings de vuelos `/vuelos/{pais}/{ciudad}`.
- **Mal:** la landing "Paquetes al Caribe verano 2027" sólo lista Isla Margarita (Venezuela): no hay Punta Cana, Bayahibe ni Cancún. 614 palabras sin texto editorial ni FAQ en las landings; H1 duplicado en la home; ofertas no indexables (`/paquetes-prearmados/detalles/` en Disallow); sin blog; "+250 años de experiencia" sumados en `/quienes-somos` (sin H1).
- **Lección:** copiar la matriz temporada × origen, pero con inventario real de Punta Cana.

### Promociones Aéreas (8 apariciones)
- **Bien:** máquina de contenido WordPress: 126 posts en una semana (post-sitemap 13→19 oct), hubs por ciudad (`https://promociones-aereas.com.ar/ciudad/punta-cana`: H1 "Vuelos baratos a Punta Cana", 3.358 palabras, "Sobre Punta Cana", FAQPage, CollectionPage), hubs de paquetes (`https://promociones-aereas.com.ar/paquetes/paquetes-a-punta-cana`: H1 "Paquetes a Punta Cana", 3.565 palabras, tabla de fechas a mayo 2027; `/paquetes/all-inclusive/all-inclusive-en-bayahibe`), guías (`/guia/mejor-epoca-para-viajar-a-punta-cana-c`, `/guia/como-pagar-en-punta-cana-dolares-pesos-o-tarjeta…`), eventos (`/evento/hot-sale`, `/evento/mundial-2026`), AggregateRating 4,7 (671).
- **Mal:** no es agencia (afiliado que deriva a Despegar/Almundo y lista 41 agencias); títulos con emojis y precios que caducan ("Imperdibles Paquetes a Punta Cana 🌴 a partir de U$D 1.038 🔥…"); posts de 5.048 palabras donde 1.670 son links de boilerplate; AggregateRating sobre `product` sin reseñas visibles (riesgo de acción manual); `/sobre-promociones-aereas` es la historia personal del autor.
- **Lección:** la cola larga informativa de Punta Cana (mejor época, cómo pagar, e-ticket) está ocupada por un blog de afiliación; una agencia real con precios propios lo supera en E-E-A-T.

### Juliá Tours (7 apariciones)
- Es mayorista B2B ("Acceso Agencias", buscador con 30 orígenes argentinos). `https://www.juliatours.com.ar/micrositio.php?id=66` (República Dominicana) y `?id=3` (Brasil): 1.485-1.553 palabras, pero sin H1/H2, sin canonical, misma meta description en todas las páginas, ISO-8859-1, sin robots ni sitemap, sin precios. Rankea por antigüedad de dominio y menciones (aparece en el AI Overview). Brasil tiene "Fórmula I con Aéreos" y "Salidas con GOL desde CÓRDOBA". No vende al público: no hay que ganarle en conversión, sólo en SERP.

### Atrápalo (21 apariciones)
- No pude leer HTML (anti-bot "Client Challenge" incluso con UA Googlebot). Sitemaps: **40.000** landings de destino `/paquetes/{slug}_d{id}.html` (programmatic masivo; `punta-cana_d606` y `punta-cana_d594` duplicadas), 243 ofertas `_v{id}.html`, 42 categorías temáticas (`/paquetes/sol-y-playa_c1645.html`, `luna-de-miel_c1650`, `feriado-de-carnaval_c1659`), región `/paquetes/caribe_c1740.html`, blog "Houdinis". Las ofertas salen en Google con title genérico "Atrápalo, reserva de hoteles, vuelos y espectáculos" y precio en pesos ("$2.345.851, 10% de descuento"). Reseñas indexables (`Allow: /opiniones/reviews/`).

### Costa Azul (AI Overview)
- **Bien:** `https://costaazulviajes.com.ar/44-paquete-a-punta-cana-all-inclusive.html` con Product + Offer (USD 1463) + Breadcrumb; legajo 12458 en el header de todas las páginas; widget "¡Opiniones de Google de nuestros viajeros! 4,8 ★ 154 opiniones" en home y en `/content/4-sobre-nosotros` (H1 "Somos especialistas en viajes desde 2005"); blog con 70 posts en primera persona. Esto es lo que lo mete en el AI Overview.
- **Mal:** PrestaShop deja basura ("How to Take Clothing Measurements", "In the same category", "My watchlist") y el H1 de la home es un párrafo entero; sin fechas, sin cuotas, sin FAQ; su foco es Argentina/termas/grupales, el Caribe es secundario.

### Mejores Viajes, Avantrip, BA Viajes, Ati Viajes, Escaparate, Planisferio
- **Mejores Viajes:** sitio PHP de 114 palabras, termas en bus, ofertas con `?wVarPaqueteID=`, mismo title en todas las páginas. No compite por Caribe.
- **Avantrip:** `avantrip.com` → 301 a `almundo.com.ar/avantrip`. Marca muerta.
- **BA Viajes:** `baviajes.com.ar` no resolvió DNS el 2026-10-19 (ni www). Sin sitio.
- **Ati Viajes:** arquitectura ideal en el sitemap (`/destino/punta-cana`, `/region/caribe`, 201 ofertas con origen en el slug: `/paquetes/238/paquete-a-punta-cana-volando-desde-cordoba`) pero es una SPA React: 0 palabras servidas en cualquier URL, también para Googlebot. Invisible salvo que Google renderice todo.
- **Escaparate (Lomas de Zamora):** mismo motor MKTE que Buteler; ofertas SSR con H1 y fechas (`/agencia/paquete/paquetes-turisticos-verano-caribe-crucero`: "CARIBE CON CRUCERO VERANO 2027 TODO INCLUIDO", "¡ABONÁ TU VIAJE EN CUOTAS FIJAS!"), pero sin sitemap, sin landings por destino, sin schema, sin reseñas. Sin Punta Cana.
- **Planisferio (Córdoba):** el más "moderno" de los chicos: JSON-LD TravelAgency/LocalBusiness + Trip + Offer, 44 páginas de sucursal (SEO local), blog con BlogPosting ("Punta Cana All-Inclusive: paquetes desde Argentina", 879 palabras). Pero la landing `https://planisferioviajes.com.ar/paquetes/punta-cana-all-inclusive` tiene 195 palabras, "test test test" olvidado, marca duplicada en el title, sin canonical ni fechas; "5.0 · +24 k reseñas" es un claim sin schema ni fuente; H1 de la home roto ("El mundote espera").

---

## 4. Qué hacen los grandes que podemos copiar en una web de Travel Compositor

1. **Landing permanente por destino con URL estable y título transaccional.** Despegar: `/paquetes/puj/paquetes-a-punta+cana` → "Paquetes turísticos a Punta Cana". Almundo: `/paquetes-turisticos/destinos/1330536/paquetes-a-punta-cana`. La URL no cambia con la temporada; cambia el contenido. Hoy nuestra equivalente es `https://www.siviajo.com/es/26/caribe/934/punta-cana/moreideas` con title "Si Viajo Agencia de Viajes" y H1 "Caribe" (leído el 2026-10-19).
2. **Matriz destino × origen.** Despegar indexa `/paquetes/bue/puj/…-desde-buenos+aires` y `/paquetes/cor/puj/…-desde-cordoba`; Multitravel tiene 9 orígenes por región; Buteler lo hace en el slug de la oferta. En TC se resuelve con una temática por origen ("Punta Cana desde Córdoba", "…desde Rosario", "…desde Buenos Aires") que filtre las ideas con ese aeropuerto de salida.
3. **Variante por mes/temporada con el año en el H1.** Despegar en vuelos: `/vuelos/bue/puj/01/…-en-enero`. Multitravel: "Paquetes al Caribe verano 2027". Nosotros ya tenemos `paquetes-verano-brasil-2026` en el sitemap de temáticas: hay que renombrar/crear la de 2027 ahora, no en diciembre.
4. **Precios "desde" por persona en USD con fecha y hotel dentro de la landing** (Despegar en snippets, Multitravel "USD 1.490 + USD 293 impuestos", Deturista "USD 1.428 · 12 cuotas"). Google muestra ese precio en el snippet; es el CTR.
5. **Ofertas individuales no indexables, autoridad concentrada en la landing.** Despegar (`/trip/`), Almundo (`/packages/detail`) y Multitravel (`/detalles/`) las bloquean. Atrápalo las indexa con title genérico y no suma. Nuestras ideas (`/es/idea/{id}/{slug}`) sí tienen H1 y 2.400 palabras, así que conviene mantenerlas indexables **pero** con canonical consistente (hoy el sitemap dice `…-salida-5-nov-2026` y la página canonicaliza a `…-temporada-baja-2026`) y enlazadas desde la landing.
6. **Contenido informativo con fecha de actualización y precio orientativo** es lo que le da a TurismoCity sus 29 apariciones ("¿Cuánto cuesta viajar a Punta Cana?") y a Promociones Aéreas sus guías. Las notas enlazan a la landing transaccional.
7. **Frescura visible:** lastmod reales, "actualizado el …", fechas de salida futuras. Promociones Aéreas publica 20 posts/día; Multitravel lista salidas semana por semana.
8. **Schema que los grandes no usan y los chicos buenos sí:** TravelAgency + AggregateRating (Multitravel 4,4/532), FAQPage (Multitravel, Promos Aéreas), Product/Offer o Trip/Offer (Costa Azul, Planisferio), BreadcrumbList. Ninguno de los 17 tiene todo junto con reseñas reales.
9. **Sitemaps segmentados por tipo** (Despegar 10, Almundo 11, Atrápalo 39) y robots que bloquean resultados/checkout, no landings. TurismoCity bloquea bots de IA: nosotros queremos lo contrario (estar en AI Overviews), así que permitirlos.
10. **Páginas de evento/promo permanentes** (`/promociones/hot-sale`, `/evento/travel-sale`, `/mundial-2026-desde-buenos-aires`, `/promociones-bancarias#banco`): la URL vive todo el año y se reactiva en cada edición.

---

## 5. Oportunidades concretas contra Viajobien, Buteler, Deturista y Multitravel (por impacto)

**Punto de partida verificado (2026-10-19):** nuestra landing `…/934/punta-cana/moreideas` tiene title genérico, H1 "Caribe", H2 de la política de cookies, sin JSON-LD, sin FAQ, sin reseñas; la home de siviajo.com tiene como H1 "Modificaciones a la Política y Consentimiento". Antes de crear páginas nuevas, arreglar esto.

### 1. Rehacer la landing de Punta Cana (impacto máximo, ya rankea Bayahibe con menos)
- **Title:** `Paquetes a Punta Cana All Inclusive 2027 con vuelo desde Argentina | Sí, Viajo`
- **H1:** `Paquetes a Punta Cana all inclusive: vuelo + hotel + traslados desde Buenos Aires, Córdoba y Rosario`
- **Description:** `Paquetes a Punta Cana all inclusive con vuelo directo, traslados y asistencia. Precios desde USD … por persona, salidas de noviembre 2026 a abril 2027. Cuotas, concierge 24/7 y 4,9★ en Google (1.972 opiniones).`
- **Contenido:** tabla "precio desde por mes" (Nov 2026 → Abr 2027) alimentada por las ideas reales; bloque "qué incluye"; 6-8 hoteles con estrellas; sección "Punta Cana o Bayahibe" (Deturista y Viajobien los mezclan; nosotros rankeamos Bayahibe); FAQ (e-ticket RD, mejor época, vuelo directo vs escala, cuotas, qué moneda llevar) con **FAQPage**; "desde Córdoba / desde Rosario" como sub-secciones con link a las landings por origen; 3 reseñas reales de clientes que viajaron a Punta Cana.
- **Confianza en la landing (nadie del grupo lo tiene todo):** "4,9★ · 1.972 opiniones en Google" con **AggregateRating en TravelAgency** (como Multitravel, pero con reseñas visibles), concierge 24/7, Great Place to Work, 13 años, oficinas en Buenos Aires, Rosario y Córdoba, legajo, cuotas con lista de bancos.
- **Schema:** TravelAgency + FAQPage + BreadcrumbList + ItemList de las ideas (cada una con Trip/Offer y precio).

### 2. Landings por origen (lo que hacen Multitravel, Buteler y Despegar; Viajobien y Deturista no)
- `Paquetes a Punta Cana desde Córdoba (vuelo directo) 2027 | Sí, Viajo` — Buteler rankea con "PAQUETES A PUNTA CANA DESDE CORDOBA ALL INCLUSIVE" sin un solo precio; tenemos oficina en Córdoba y la idea `…/25683099/paquete-a-punta-cana-all-inclusive-7-noches-desde-cordoba-feb-2027`.
- `Paquetes a Punta Cana desde Rosario 2027 | Sí, Viajo` — Buteler sólo tiene La Romana desde Rosario; Multitravel "Caribe desde Rosario" sin Punta Cana.
- `Paquetes a Punta Cana desde Buenos Aires: vuelo directo + all inclusive | Sí, Viajo`
- Mismo trío para **Caribe** y **Brasil**: `Paquetes al Caribe desde Córdoba 2027`, `Paquetes a Brasil verano 2027 desde Rosario`. En TC: una temática por combinación, con texto propio de 400-600 palabras y la lista de ideas filtrada por aeropuerto.

### 3. Landings de temporada con año (Multitravel rankea con esto; nosotros tenemos "verano 2026")
- `Paquetes al Caribe verano 2027: Punta Cana, Bayahibe, Cancún y Aruba all inclusive | Sí, Viajo`
- `Paquetes a Brasil verano 2027 desde Argentina: Búzios, Maceió, Porto de Galinhas | Sí, Viajo` (renombrar/duplicar la temática `paquetes-verano-brasil-2026`)
- `Vacaciones de invierno 2027 en el Caribe: paquetes all inclusive desde Argentina`
- `Paquetes Fórmula 1 2027: Interlagos, Austin y México con entradas` (ya rankea F1 Brasil; nadie del grupo compite salvo Juliá "Fórmula I con Aéreos").

### 4. Página de confianza y SEO local (contra Buteler/Planisferio/Costa Azul)
- `/sobre-si-viajo`: H1 "13 años, 3 oficinas y 1.972 opiniones: por qué viajar con Sí, Viajo", legajo, GPTW, equipo, prensa, concierge 24/7, widget de Google Reviews (como Costa Azul "4,8 ★ 154 opiniones", pero con 4,9 ★ 1.972).
- Tres páginas de oficina con **LocalBusiness** (como las 44 sucursales de Planisferio): `Agencia de viajes en Rosario | Sí, Viajo`, `Agencia de viajes en Córdoba | Sí, Viajo`, `Agencia de viajes en Buenos Aires | Sí, Viajo`. Planisferio rankea "Agencia de Viajes en Córdoba" con eso en el title.
- Página permanente `Cuotas y promociones bancarias para viajar` con un ancla por banco (Almundo) y enlace desde cada landing.

### 5. Contenido informativo de Punta Cana (lo que hoy se llevan TurismoCity y Promociones Aéreas)
- `¿Cuánto cuesta viajar a Punta Cana en 2027? Presupuesto real con paquetes desde Argentina` (con precios de nuestras ideas y fecha de actualización visible).
- `Mejor época para viajar a Punta Cana desde Argentina (clima, precios y temporada de huracanes)`.
- `Punta Cana o Bayahibe: cuál elegir para un all inclusive`.
- `E-ticket de República Dominicana: cómo completarlo paso a paso` (Promos Aéreas lo tiene como guía; Juliá sólo linkea a migracion.gob.do).
- `Qué incluye un all inclusive en Punta Cana y qué no`.
- Cada nota con BlogPosting, autor real, "actualizado el …", precio orientativo y CTA a la landing.

### 6. Higiene técnica para que lo anterior rinda
- Un title y H1 propios por temática (hoy todas heredan "Si Viajo Agencia de Viajes" y el H1 del padre "Caribe").
- Sacar la política de cookies del árbol de encabezados (H1/H2 de la home y de las landings son hoy los del modal).
- Canonical de las ideas igual al slug del sitemap.
- JSON-LD en landings e ideas (hoy ninguna página de siviajo.com tiene JSON-LD; Costa Azul, Planisferio, Multitravel y Promos Aéreas sí).
- Mantener las ofertas indexables pero enlazadas desde la landing (al revés de Atrápalo, que indexa 243 ofertas huérfanas con title genérico).

---

## 6. Consultas comerciales que ellos rankean y nosotros no (sacadas de sus títulos/H1; sin volúmenes)

1. **paquetes a punta cana desde córdoba** — Buteler H1 `…/paquetes_de_viajes_a_punta_cana_desde_cordoba`; Despegar `/paquetes/cor/puj/…-desde-cordoba`; Ati `/paquetes/238/…-volando-desde-cordoba`.
2. **paquetes a punta cana desde buenos aires** — Despegar `/paquetes/bue/puj/…-desde-buenos+aires`; Promos Aéreas "Paquetes a Punta Cana… Vuelos desde Buenos Aires".
3. **paquetes turísticos a punta cana** — título de Despegar en el índice.
4. **viajes a república dominicana all inclusive** — Buteler title "VIAJES A REPUBLICA DOMINICANA ALL INCLUSIVE. Vuelos y Paquetes a Republica Dominicana".
5. **paquetes al caribe verano 2027** (y "…desde rosario / córdoba / mendoza / salta / tucumán") — Multitravel H1/title.
6. **paquetes a brasil verano 2027 desde buenos aires** — Multitravel `…/Paquetes-a-Brasil-Verano-2027-desde-Buenos-Aires`.
7. **paquetes de viajes al caribe desde argentina** — Buteler title "SELECCION DE PAQUETES DE VIAJES AL CARIBE DESDE ARGENTINA".
8. **viajes a bayahibe desde buenos aires / paquetes a bayahibe desde córdoba** — Buteler `viajes_a_bayahibe_desde_buenos_aires`, `viajes_a_bayahibe_desde_cordoba`; Costa Azul "Bayahibe All Inclusive - desde Córdoba".
9. **all inclusive en bayahibe / all inclusive punta cana** — Promos Aéreas hubs `/paquetes/all-inclusive/all-inclusive-en-bayahibe`, `…/all-inclusive-punta-cana`.
10. **punta cana all inclusive en cuotas sin interés** — Atrápalo `punta-cana-all-inclusive-en-cuotas-sin-interes_v69340.html`; Deturista "12 cuotas de $…".
11. **cuánto cuesta viajar a punta cana** — TurismoCity "¿Cuánto cuesta viajar a Punta Cana? Presupuesto para tus vacaciones".
12. **mejor época para viajar a punta cana** — Promos Aéreas `/guia/mejor-epoca-para-viajar-a-punta-cana-c`; Planisferio H2 "¿Cuándo es el mejor momento para ir desde Argentina?".
13. **paquetes a samaná / la romana / miches / puerto plata** — Deturista H2 "Paquete a Samaná 8 días All Inclusive + Avistaje de Ballenas", "Paquete a Puerto Plata…"; Buteler `viajes_a_la_romana_desde_rosario`; Juliá "SAMANÁ con COPA".
14. **salida grupal acompañada crucero por el caribe + punta cana** — Deturista `/paquete/2315/salida_grupal_acompanada_crucero_por_el_caribe__punta_cana.html`; Escaparate "CARIBE CON CRUCERO VERANO 2027 TODO INCLUIDO".
15. **agencia de viajes en córdoba / agencia de viajes buenos aires** — Planisferio title "Agencia de Viajes en Córdoba"; Costa Azul description "agencia de viajes y turismo en Buenos Aires"; Multitravel H1 "Agencia de viajes líder en Argentina".

---

## 7. Limitaciones del relevamiento
- Despegar y TurismoCity bloquean curl, WebFetch y UA Googlebot (403 / Cloudflare): sus landings se describen por sitemaps, robots.txt y títulos en el índice de Google, no por lectura directa.
- Atrápalo sirve un "Client Challenge" a cualquier cliente no-browser: sólo sitemaps.
- Almundo y Ati Viajes son SPA: el HTML servido está vacío; no se puede medir texto, H1 ni schema sin renderizar JS.
- BA Viajes no resuelve DNS; Avantrip redirige a Almundo.
- Los "desde" y precios citados son los del 2026-10-19 y cambian a diario.

---

## Resumen para pegar en un chat

1. Relevé 17 competidores el 2026-10-19 con curl/WebFetch: Despegar, TurismoCity y Atrápalo bloquean todo (sólo sitemaps); Almundo y Ati Viajes son SPA vacías; BA Viajes no tiene DNS y Avantrip redirige a Almundo.
2. Los grandes ganan con landings permanentes por destino (`/paquetes/puj/paquetes-a-punta+cana`), variantes por origen (`/bue/puj/…-desde-buenos+aires`) y precios "desde" con fecha; ofertas no indexables.
3. TurismoCity no rankea "paquetes" con landings sino con notas tipo "¿Cuánto cuesta viajar a Punta Cana?"; Promociones Aéreas igual, con hubs + guías + FAQPage y 20 posts/día.
4. Viajobien (23 apariciones) rankea con landings SSR de 3.400 palabras (`/paquetes/landing/paquetes-al-caribe`), pero su página `/paquetes/punta-cana` es CSR ("Cargando paquetes", 114 palabras, sin H1), sin schema, sin reseñas, sin quiénes somos.
5. Buteler rankea con slugs exactos ("paquetes_de_viajes_a_punta_cana_desde_cordoba") sin precios, sin robots ni sitemap, texto de Wikipedia.
6. Deturista tiene las ofertas más ricas (4.700 palabras, salidas hasta dic-2027, USD + 12 cuotas, filtro por origen) pero ninguna URL de Punta Cana ni schema ni reseñas.
7. Multitravel tiene la mejor matriz temporada × origen (Caribe verano 2027 desde 9 ciudades) + AggregateRating 4,4 (532) + FAQ, pero su "Caribe" es sólo Isla Margarita.
8. Nuestra landing de Punta Cana hoy tiene title "Si Viajo Agencia de Viajes", H1 "Caribe", H2 de cookies y cero JSON-LD; la home tiene como H1 "Modificaciones a la Política y Consentimiento".
9. Plan: (1) rehacer la landing de Punta Cana con title/H1 transaccionales, tabla de precios por mes, FAQ y reseñas 4,9★/1.972 con schema; (2) landings "desde Córdoba / Rosario / Buenos Aires"; (3) temporadas con año (Caribe y Brasil verano 2027, F1 2027); (4) página de confianza + 3 páginas de oficina (LocalBusiness); (5) 5 notas informativas de Punta Cana con precio y fecha.
10. Ninguno de los 17 combina reseñas reales + schema + landings por origen + precios con fecha: ese combo es la ventaja a construir. Informe completo: `docs/seo/competidores-2026-10-19.md`.
