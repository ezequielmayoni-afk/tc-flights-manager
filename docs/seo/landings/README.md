# Landings permanentes de destino (Travel Compositor)

Seis páginas pensadas para rankear en Google Argentina por "paquetes a {destino}". Cada archivo `.md` de esta carpeta es el texto completo de una landing: frontmatter (URL sugerida, title, meta description, H1) y el cuerpo con sus H2.

| Archivo | Slug de la URL | Keyword principal |
|---|---|---|
| `punta-cana.md` | `paquetes-a-punta-cana` | paquetes a punta cana |
| `bayahibe.md` | `paquetes-a-bayahibe` | paquetes a bayahibe |
| `cancun-riviera-maya.md` | `paquetes-a-cancun-y-riviera-maya` | paquetes a cancun |
| `brasil.md` | `paquetes-a-brasil` | paquetes a brasil |
| `aruba-curazao.md` | `paquetes-a-aruba-y-curazao` | paquetes a aruba / paquetes a curazao |
| `formula-1.md` | `paquetes-formula-1` | paquetes f1 brasil / paquetes gp mexico |

## Cómo se cargan en Travel Compositor

En el back de TC: **Web content → Landing → Nueva landing**.

1. **Título de la landing**: el valor de `h1` del frontmatter. TC lo usa como H1 de la página.
2. **Meta title**: el valor de `title` (60 caracteres o menos, termina en " | Sí, Viajo").
3. **Meta description**: el valor de `meta_description` (155 caracteres o menos).
4. **URL / slug**: TC asigna el `{id}` numérico; el slug tiene que ser exactamente el de la tabla de arriba (`paquetes-a-{destino}`). La URL final queda `https://www.siviajo.com/es/landing/{id}/paquetes-a-{destino}`.
5. **Cuerpo**: pegar el contenido en HTML. Conversión del markdown:
   - `## Texto` → `<h2>Texto</h2>`; `### Texto` → `<h3>Texto</h3>` (las preguntas frecuentes van en H3 dentro del H2 "Preguntas frecuentes").
   - Párrafos → `<p>`; listas `- ` → `<ul><li>`; `**negrita**` → `<strong>`.
   - Enlaces `[texto](url)` → `<a href="url">texto</a>`. Los enlaces internos (fichas `/es/idea/...` y temáticas `/moreideas`) pueden ir relativos; los del blog van absolutos a `https://blog.siviajo.com/...`.
   - No agregar H1 en el cuerpo: el H1 lo pone TC con el título de la landing.
6. **Imagen de cabecera**: una foto real del destino, con `alt` descriptivo (por ejemplo "Playa Bávaro, Punta Cana"). No usar la misma imagen que la temática.
7. **Idioma**: cargar sólo en español (`/es/`). No crear la versión en inglés.
8. Antes de publicar, abrir la URL en incógnito y verificar: H1 único, los H2 en el orden del archivo, todos los enlaces responden 200 y el bloque de reseñas ya no tiene el marcador `[RESEÑAS…]`.

Una vez publicada, agregar la URL al sitemap y pedir indexación en Search Console.

## Qué hay que completar antes de publicar

- **Reseñas**: cada archivo tiene un marcador `[RESEÑAS: 3 opiniones reales de clientes que viajaron a {destino}, con nombre, fecha y texto]`. Reemplazarlo por tres reseñas reales de Google del destino (nombre o iniciales, fecha y texto literal). Si es posible, con enlace al perfil de Google Business.
- **WhatsApp**: el marcador `[WHATSAPP]` del cierre se reemplaza por el botón o enlace `https://wa.me/{número}?text=...` con un texto prellenado que nombre el destino (por ejemplo "Hola, quiero cotizar un paquete a Punta Cana"). Usar el mismo número que el botón de las fichas.
- **Fórmula 1**: la ficha del GP de México (id 44205225) no estaba en el export de paquetes del 17/10; en `formula-1.md` quedó un marcador `[COMPLETAR: …]` con los datos que faltan (noches, hotel, entradas, precio).
- **Fechas y precios**: están tomados de los paquetes activos de TC al 17/10/2026. Antes de cargar, verificar en cada ficha que la salida siga vigente y el precio no haya cambiado.

## Regla: la URL no cambia nunca

Estas landings son permanentes. Google acumula autoridad en la URL, no en la fecha ni en el paquete puntual.

- Cuando un paquete se vence, se saca de la lista y se reemplaza por el siguiente **editando el contenido de la misma landing**. No se crea una landing nueva por temporada ni se agrega el año al slug.
- Lo mismo para Fórmula 1: cuando pasa Interlagos, se actualiza la lista con el próximo Gran Premio y la URL `paquetes-formula-1` sigue siendo la misma.
- Si en algún momento hace falta cambiar el slug (no debería), hay que dejar un redireccionamiento 301 desde la URL vieja.
- Revisar cada landing al menos una vez por mes (o cuando el job `seo.expiring` avise) para que la sección "con salida confirmada" nunca muestre salidas pasadas.

## Fuentes de los datos

- Paquetes, hoteles, aerolíneas y precios: export de paquetes activos de TC (17/10/2026) y títulos aprobados en `../titulos-propuestos-2026-10-17.csv` (columna `title_propuesto`, actualizada por temporada el 19/10).
- Preguntas frecuentes: preguntas reales de "Otras preguntas de los usuarios" en Google (tabla `serp_checks`, semana 2026-W42).
- Enlaces del blog: sólo URLs presentes en `https://blog.siviajo.com/post-sitemap.xml`.

## Estado 2026-10-23: seis landings publicadas por HTTP

| Landing | id | URL | Menú |
|---|---|---|---|
| Punta Cana | 20370 | /es/landing/20370/paquetes-a-punta-cana | Caribe → Punta Cana |
| Bayahibe | 34404 | /es/landing/34404/paquetes-a-bayahibe | Caribe → Bayahibe |
| Cancún y Riviera Maya | 34407 | /es/landing/34407/paquetes-a-cancun-y-riviera-maya | Caribe → Cancún |
| Brasil | 34410 | /es/landing/34410/paquetes-a-brasil | pendiente (ítem de primer nivel "Paquetes a Brasil") |
| Aruba y Curazao | 34413 | /es/landing/34413/paquetes-a-aruba-y-curazao | Caribe → Aruba y Curaçao |
| Fórmula 1 | 23730 (la landing que ya existía) | /es/landing/23730/paquetes-a-la-formula-1 | Fórmula 1 → Todos los GP |
| Gift Card (2026-10-26) | 34533 | /es/landing/34533/giftcard | sin menú (widget de compra inyectado por GTM, ver docs/GIFTCARD.md) |

Cómo se cargan de verdad (gestor de landings de TC, replicado por HTTP en `scripts/tc-admin/landing_edit.py`):
- Una landing personalizada tiene **título/slug/H1/subtítulo/meta por idioma** (pestaña Titulo; Spanish =
  `tabTranslations:1`; el slug lo genera TC con el evento blur de `urlTitle`), **imagen principal** (≥ 1920 px
  de ancho, por URL + recorte) y **secciones** (`SEO Content`: título H2, subtítulo, descripción Quill de
  **máximo 4.096 caracteres**, imagen ≥ 999×655). Español en las secciones = `tabSectionLanguages:0`.
- Por el tope de 4.096 el texto va en **cuatro secciones**: salidas (intro + lista de fichas vigentes),
  qué incluye + cuándo conviene, preguntas frecuentes, reseñas + otros destinos + WhatsApp.
  `scripts/tc-admin/landing_sections.py` las genera desde el `.md` con precios y fechas vigentes y reseñas
  reales (SerpAPI `google_maps_reviews`, data_id `0x95bccad1d9fab485:0x12acf3a6fbdfe552`); sin emojis
  (TC los rechaza).
- No se puede meter `<script>` (JSON-LD de FAQ) en Quill: queda para GTM o para pedirlo a TC.
- La página pública se **cachea por servidor backend** (cookie `backend`): después de guardar, cada
  instancia tarda hasta ~1 h en mostrar la versión nueva. `landing_edit.public_check()` lo muestra.
- Sitemap: las URLs van a `seo_sitemap_entries` (`kind='landing'`, archivo `landings`) y salen en
  `https://hub.siviajo.com/sitemaps/landings.xml`.
- Imágenes: fichas propias de TC cuando miden ≥ 1920 px; si no, Wikimedia Commons con licencia CC0 /
  dominio público (Ipanema, Porto de Galinhas, divi tree de Aruba) o CC BY con crédito en el texto (Kenepa).
