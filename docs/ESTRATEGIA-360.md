# Estrategia 360 para estar arriba: producto, marketing, SEO y GEO (2026-10-20)

Punto de partida medido (baseline del 2026-10-20, `docs/seo/baseline-2026-10-20.md`):

| Canal | Hoy | Qué dice |
|---|---|---|
| Leads | 1.730 mensajes con código SIV en 7 días, 92 % atribuidos a anuncios de Meta | Los leads los trae Meta; el orgánico casi no convierte todavía |
| Orgánico marca | ~1.500 clics/90 d a la home por "si viajo" | La marca existe; Google ya la conoce |
| Orgánico no-marca | 338 clics/90 d a las 108 fichas; 29 fichas concentran el 87 % | Las fichas rankean poco y de forma concentrada |
| Blog | Una sola nota (clima en Bayahibe) trae 1.201 clics/90 d, más que todas las fichas juntas | El contenido editorial es el activo orgánico más fuerte y está parado desde junio |
| Hoteles | 17.971 fichas de hotel con SEO en el sitemap; ~23.800 sin SEO | Largo cola enorme sin trabajar |
| IA | 0 de 41 AI Overviews citan a Sí, Viajo; 6 de 36 sondas la mencionan (Gemini 4) | Invisible en IA salvo por marca |
| Competencia | Viajobien rankea con landings SSR de 3.400 palabras; TurismoCity con notas "cuánto cuesta viajar a X" actualizadas; Despegar con landings por ciudad | Ganan con páginas de destino con texto, no con fichas |

Conclusión: Sí, Viajo tiene la mejor prueba social del rubro (4,9★ en 1.972 opiniones, concierge 24/7) y el
peor contenido de destino. Lo que falta no es más fichas ni más anuncios: son **páginas de destino que
rankeen**, **contenido editorial continuo**, **señales de entidad para las IA** y **compra de posición en
Google mientras el orgánico madura**.

## 1. Los cinco movimientos, en orden

### 1.1 Producto canónico (semanas 1–2, sin inversión)
Lo acordado: un ID por producto y temporada, las fechas adentro, cupo agotado → stop sale en la fecha,
todo agotado → sistema. HUB: rol y temporada declarada por ficha, calendario de temporadas compartido,
`package.expire` que nunca desactiva una canónica, salidas duplicadas no visibles. Es el cimiento: sin
esto, cada página que rankee se rompe en la próxima temporada.

### 1.2 Landings de destino que rankeen (semanas 1–4, inversión: redacción)
Hoy la página de "paquetes a Punta Cana" es un listado de fichas con 300 caracteres de texto (tope de TC
en temáticas). Viajobien gana con 3.400 palabras. Se arman landings en el gestor de landings de TC (HTML
libre): H1 con la consulta, 1.500–2.500 palabras útiles (qué incluye, cuándo conviene, precios de
referencia por temporada, hoteles que usamos, preguntas frecuentes, reseñas citadas), las fichas canónicas
del destino, enlaces a la temática y al blog, y JSON-LD de FAQ. Los seis borradores ya existen
(`docs/seo/landings/`). Orden: Punta Cana, Bayahibe, Cancún y Riviera Maya, Brasil (Búzios, Río,
Florianópolis, nordeste), Aruba y Curazao, Fórmula 1, salidas grupales a Europa, Orlando. Cada landing
entra al menú y a la home.

### 1.3 Máquina de contenido (semana 2 en adelante, inversión: editor)
Dos notas por semana en el blog, con el patrón que a TurismoCity le funciona: "cuánto cuesta viajar a
X en 2027", "mejor época", "requisitos y visas", "X vs Y", "qué llevar", con fecha de actualización
visible y actualizadas cada temporada. Los temas salen de Tendencias (job semanal: alerta → brief) y
de las consultas de Search Console sin página. Las escribe IA con la voz de marca y las revisa una
persona; cada nota enlaza a la landing y a dos fichas canónicas. Meta: 25 notas en 90 días.

### 1.4 Hoteles: indexar todo, pero con calidad (semanas 2–8, inversión: IA barata)
Pasar de 17.971 a todo el inventario vendible con SEO propio: título, descripción única de 200–300
palabras con el ángulo "con vuelo desde Argentina", preguntas frecuentes, enlace a la landing del destino
y a los paquetes que usan ese hotel. Prioridad: hoteles que están en nuestros paquetes, después los
destinos donde vendemos (Caribe, Brasil, Argentina, Orlando), en lotes de 3.000 por semana para que
Google no lo lea como contenido escalado. Costo de IA (Haiku) ≈ US$ 100 en total. Se agregan al sitemap
a medida que tienen SEO; `gsc.site_sync` mide cobertura.

### 1.5 Comprar la posición mientras el orgánico sube (desde la semana 1, inversión: pauta)
Google Ads de búsqueda sobre las 45 consultas que ya medimos ("paquetes a punta cana", "paquete f1
brasil 2026"…) y defensa de marca, con el SIV en el mensaje de WhatsApp para que el CRM atribuya igual
que Meta; Performance Max con el catálogo de paquetes (Fase 12) y retargeting en Meta con el mismo feed.
Es la única forma de estar "arriba" en 30 días; el orgánico tarda 90–180. El costo por conversación lo
compara el tablero del CRM contra Meta.

## 2. GEO: que ChatGPT, Gemini y Claude te nombren
- **Página de entidad** "Sobre Sí, Viajo" en TC: legajo, años, oficinas, equipo, premios, prensa, cómo
  funciona el concierge; JSON-LD `TravelAgency` con dirección, teléfono y `sameAs`. Hoy ChatGPT cita los
  términos y condiciones porque no hay nada mejor.
- **Listas de terceros**: los AI Overviews y ChatGPT citan notas tipo "mejores agencias de viajes de
  Argentina". Hay que estar en ellas: prensa pagada o ganada en medios que Google ya cita (Infobae,
  Cronista, Clarín Viajes), con datos propios de Tendencias como gancho ("qué destinos buscan los
  argentinos para el verano 2027").
- **Reseñas y foros**: mantener el ritmo de reseñas en Google; respuestas en Reddit, Quora y grupos
  donde la gente pregunta por agencias confiables, firmadas y con enlace.
- **YouTube**: Gemini y los AI Overviews citan videos; un video corto por destino (recorrido del
  paquete, el concierge en acción) con el mismo título que la landing.
- **Medición**: `geo.probe` los lunes; meta 12 de 36 menciones a 90 días (hoy 6).

## 3. Marketing y producto: cerrar el circuito
- Meta sigue siendo el motor de leads; se le suma Google Ads y el catálogo. Los tres apuntan a los IDs
  canónicos; el CRM atribuye por SIV.
- Tendencias alimenta tres cosas a la vez: qué cupos pedir, qué landing reforzar y qué nota escribir.
- El guard pasa a semi: pausar anuncios de fichas agotadas o vencidas sin esperar a nadie.
- Cada lunes un solo informe con cuatro números: clics no-marca, fichas Tier A, menciones en IA, costo
  por conversación por canal.

## 4. Inversión sugerida (3 meses)

| Rubro | Mensual (US$) | Para qué |
|---|---|---|
| Google Ads (búsqueda + PMax) | 2.000–3.000 | Estar arriba ya en las consultas comerciales; datos de conversión |
| Editor de contenido | 800–1.200 | 2 notas/semana + landings + hoteles revisados |
| Prensa digital y listas | 1.000–2.500 | 2 notas/mes en medios citados por IA; links |
| Video (1 por destino) | 500 | YouTube + landings + anuncios |
| Herramientas (SerpAPI ya está; Ahrefs o Semrush) | 150–250 | Competencia y links |
| **Total** | **4.500–7.500** | — |

Lo técnico (producto canónico, landings, hoteles, schema, sitemaps, medición) lo hace HUB sin costo
externo salvo la IA.

## 5. Metas a 30 / 60 / 90 días (contra la foto del 2026-10-20)

| Métrica | Hoy | 30 d | 60 d | 90 d |
|---|---|---|---|---|
| Fichas Tier A (≥100 impr/90 d) | 29 | 32 | 40 | 50 |
| Clics no-marca a www (28 d) | 671 | 800 | 1.000 | 1.400 |
| Landings de destino en top 10 para "paquetes a {destino}" | 0 | 2 | 4 | 6 |
| Notas nuevas en el blog | 0 | 8 | 16 | 25 |
| Hoteles con SEO en el sitemap | 17.971 | 24.000 | 30.000 | todo lo vendible |
| Menciones en sondas de IA (de 36) | 6 | 8 | 10 | 12 |
| AI Overviews que citan siviajo (de 41) | 0 | 1 | 3 | 5 |
| Costo por conversación Google vs Meta | — | medido | ≤ Meta +20 % | ≤ Meta |

## 6. Qué necesito de Ezequiel para arrancar esta semana
1. Ok al presupuesto de pauta y al editor (o quién escribe).
2. Acceso a la cuenta de Google Ads (o crearla) y el feed de catálogo de Meta.
3. Fotos reales por destino para landings y temáticas.
4. Quién responde reseñas y foros (puede ser el concierge).
