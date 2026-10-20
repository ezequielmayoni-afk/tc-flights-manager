# Temáticas: ejecución del plan (2026-10-19)

Qué se hizo sobre el backoffice de Travel Compositor, todo por HTTP (`scripts/tc-admin/`, sin Playwright
salvo para capturar la forma de dos requests). Plan de referencia: `tematicas-plan-2026-10-19.md`.

## 1. SEO cargado en las 25 temáticas propias editables

Nombre (H1), descripción (≤ 300 caracteres, tope de TC), título SEO y meta descripción en inglés (índice
obligatorio) y español. Backups en `scripts/tc-admin/backup_theme_<id>.json` (no versionados).

| id | Nombre nuevo | Title SEO |
|---|---|---|
| 9537 | Bayahibe | Paquetes a Bayahibe desde Argentina \| Sí, Viajo |
| 5611 | Verano 2027 | (del plan) |
| 5614 | Argentina | (del plan) |
| 8009 | Mejores ofertas | (del plan) |
| 9216 | Estados Unidos | (del plan) |
| 9333 | Vacaciones de invierno | (del plan) |
| 9543 | Riviera Maya | Paquetes a la Riviera Maya desde Argentina \| Sí, Viajo |
| 9663 | Sudamérica | (del plan) |
| 12432 | Exóticos | (del plan) |
| 12450 | Jamaica | (del plan) |
| 12462 | Aruba | Paquetes a Aruba desde Argentina \| Sí, Viajo |
| 12480 | Curazao | (del plan) |
| 12519 | Circuitos por Europa | Circuitos por Europa con guía desde Argentina \| Sí, Viajo |
| 14140 | Rugby | (del plan) |
| 14143 | Eventos deportivos | (del plan) |
| 17112 | Salidas grupales acompañadas | Salidas grupales acompañadas desde Argentina \| Sí, Viajo |
| 9636 | Fórmula 1 | Paquetes Fórmula 1 \| Sí, Viajo |
| 9654 | Mundial 2026 | Paquetes al Mundial 2026 con entrada \| Sí, Viajo |
| 12318 | Burgerpalusa | Paquetes a Burgerpalusa con entrada \| Sí, Viajo |
| 10809 | Sí Viajo HOT | Sí Viajo HOT: ofertas de paquetes \| Sí, Viajo |
| 12768 | Sale Sí Viajo | Sale Sí Viajo: ofertas de paquetes \| Sí, Viajo |
| 14188 | Sí Viajo Black | Sí Viajo Black: ofertas de paquetes \| Sí, Viajo |
| 21431 | Semana RIU | Semana RIU: paquetes all inclusive \| Sí, Viajo |
| 9630 | Perú | Paquetes a Perú y Machu Picchu desde Argentina \| Sí, Viajo |
| 12483 | Ecuador | Paquetes a Ecuador y Galápagos desde Argentina \| Sí, Viajo |

Las 5 temáticas propias restantes (12174, 12183, 12516, 12438, 12582) son las que el plan fusiona:
quedaron como estaban; sus paquetes ya tienen también la temática destino nueva.

La página pública se cachea por servidor backend: algunos títulos tardan horas en verse (ej. 17112).

## 2. Temáticas nuevas (14) — todas públicas, con imagen, SEO y paquetes

Las 16 temáticas "General" de TC (Punta Cana 934, Cancún 700, Río 937, Búzios 3122, Disney 322,
Escapadas 169, Easter week 29, Caribe 26, Brasil 16, Europe 79, formula1 1145, Asia 84, …) no se pueden
editar. Se crearon temáticas propias para los destinos nuevos y para reemplazar a las General sin tráfico
(≤ 5 clics en 90 días). Caribe 26, Brasil 16, Europe 79 y formula1 1145 (con tráfico real) se dejaron.

| id | Temática | URL | Paquetes asignados |
|---|---|---|---|
| 22662 | Florianópolis | /es/22662/florianopolis/moreideas | 3 |
| 22665 | Porto Seguro y Arraial d'Ajuda | /es/22665/porto-seguro/moreideas | 5 |
| 22668 | Maceió, Maragogi y Porto de Galinhas | /es/22668/maceio/moreideas | 3 |
| 22671 | Praia do Forte y Costa do Sauípe | /es/22671/praia-do-forte/moreideas | 3 |
| 22674 | Natal y Pipa | /es/22674/natal/moreideas | 2 |
| 22677 | All inclusive | /es/22677/all-inclusive/moreideas | 12 |
| 22680 | Caribe desde Córdoba | /es/22680/caribe-desde-cordoba/moreideas | 3 |
| 22683 | Punta Cana (reemplaza a 934) | /es/22683/punta-cana/moreideas | 8 |
| 22686 | Cancún (reemplaza a 700) | /es/22686/cancun/moreideas | 4 |
| 22689 | Río de Janeiro (reemplaza a 937) | /es/22689/rio-de-janeiro/moreideas | 3 |
| 22692 | Búzios (reemplaza a 3122) | /es/22692/buzios/moreideas | 3 |
| 22695 | Orlando y Disney (reemplaza a 322) | /es/22695/orlando-y-disney/moreideas | 2 |
| 22698 | Semana Santa (reemplaza a 29) | /es/22698/semana-santa/moreideas | 4 |
| 22701 | Escapadas (reemplaza a 169) | /es/22701/escapadas/moreideas | 6 |

Las imágenes de portada son generadas con IA (gpt-image-1, 1536×512, prompts fotográficos del destino);
se pueden reemplazar desde el back (Temáticas → Editar → imagen) cuando haya fotos reales.
No se crearon "Turquía y Grecia" (sin paquetes propios: sólo circuitos mayoristas), "Caribe desde Rosario"
(0 paquetes) ni "Punta Cana desde Córdoba" (1 paquete; quedó dentro de Caribe desde Córdoba).

Los paquetes conservan además la temática General vieja: cuando las nuevas estén indexadas, quitar las
General del microsite (CMS → Temáticas) para que no haya dos listados iguales.

## 3. Meta tags de los 96 paquetes del CSV

`title-head` (meta título ≤ 60), `meta-description` y alt de imagen aplicados desde
`titulos-propuestos-2026-10-17.csv` por el editor de "Paquetes vacacionales" (96/96; dos de ellos ya
vencidos). Verificado reabriendo cada ficha: sólo cambiaron esos tres campos (TC normaliza el HTML de
la descripción sin tocar el texto).

## 4. Menú de navegación

- Links de los submenús Caribe, Fórmula 1, Europa y Ofertas pasados a URLs canónicas con `www` y planas
  (`/es/{id}/{slug}/moreideas` en vez de `/es/26/caribe/{id}/...`, que generaba páginas duplicadas).
- "Punta Cana" y "Cancún" del menú Caribe apuntan a las temáticas propias nuevas; "Playa del Carmen"
  apunta a Riviera Maya (9543).
- Ítem nuevo "Paquetes a Brasil" (activo, después de Caribe) → `/es/16/brasil/moreideas`.
  **Pendiente:** TC no persiste ítems nuevos de submenú (ni por HTTP ni desde el navegador, el guardado
  responde OK y no graba); los destinos de Brasil quedan enlazados sólo desde el listado de Brasil y el
  sitemap. Hay que cargarlos a mano en TC o pedirle a soporte de TC.

## 5. Incidente y corrección

El listado de "Paquetes vacacionales" se reordena en vivo (los vendedores crean presupuestos a toda hora)
y las acciones de fila se resuelven por índice: en dos casos el editor abrió un presupuesto de cliente en
vez del paquete buscado y le agregó una temática. Se revirtió en ambos (`repair_wrong.py`) y ahora
`open_pkg()` verifica el título del formulario antes de guardar. Los 96 meta tags no se vieron afectados
(auditado contra los backups).

## 6. Cómo seguir

- Verificar en 24 h los títulos públicos (caché por servidor) y pedir indexación de las 14 URLs nuevas
  (sitemap de paquetes/temáticas regenerado desde HUB).
- Quitar del microsite las temáticas General reemplazadas y las vacías (Costa Rica, Cuba, San Andrés,
  Cartagena, Perú, Ecuador) cuando las nuevas tengan impresiones.
- Cargar el submenú de Brasil (ver §4) y evaluar si "All inclusive" y "Escapadas" van al menú.
- Reemplazar las imágenes IA por fotos reales cuando las haya.

## 7. Sitemap de hoteles desde el backoffice

Listado completo de "Landing del Alojamiento" por destino (`scripts/tc-admin/hl_list.py`, 42.888 hoteles
en 9 destinos) y revisión del `<head>` público de cada uno (`seo-hotel-sitemap.ts hotels --admin=…`,
55 min): **17.971 hoteles con SEO cargado** ahora en `https://hub.siviajo.com/sitemaps/hoteles-*.xml`
(Río 9.699, Playa del Carmen 3.382, Cancún 2.829, Punta Cana 787, Orlando 574, Bariloche 310, Salta 161,
El Calafate 134, Bayahíbe 95); 23.770 sin SEO quedan fuera; 290 ya no existen. Índice reenviado a
Search Console. Riesgo a vigilar: miles de fichas de departamentos ("master-…") con texto generado son
candidatas a "scaled content"; si GSC muestra caída de calidad, limitar el sitemap a hoteles con reservas.

## 8. Home (2026-10-19, noche)

Diagnóstico: casi todo lo que diferencia a la agencia (tira de confianza, reseñas, grupales, blog,
WhatsApp) lo inyecta GTM después de cargar, así que no está en el HTML que leen ChatGPT, Claude o los
snippets de Gemini. Además la home no tenía H1 ni meta descripción y las solapas de destino apuntaban a
temáticas General sin SEO. GTM no se tocó.

Cambios aplicados en el CMS de TC (`scripts/tc-admin/home_edit.py`, backup en `backup_home_title.json`):
- Pestaña "Título": meta título `Sí, Viajo | Agencia de viajes en Argentina con concierge 24/7`, meta
  descripción con 4,9★ / 1.972 opiniones / cuotas (ahora sí se renderiza, también en og y twitter),
  H1 del slider `Paquetes de viaje con vuelo, hotel y concierge 24/7` y H2 con oficinas y reseñas.
- Sección nueva de tipo **SEO Content** (`seo_section.html`), última antes del footer: quién es la
  agencia (legajo, oficinas, cupos propios, CACE, GPTW), qué hace el concierge, 17 enlaces a las
  temáticas con SEO, tres reseñas citadas y cuatro preguntas frecuentes. Texto crawleable sin JS.
- Solapas "Paquetes seleccionados por destino": las temáticas propias Punta Cana, Cancún, Río, Búzios,
  Florianópolis y Orlando y Disney pasaron a "principal" + "destino" (orden 4 a 9, entre Brasil y Asia);
  la General Disney (322) se quitó de sus dos paquetes y del microsite.
- Ajuste posterior (pedido de Ezequiel): la sección "SEO Content" de TC es de dos columnas (imagen a la
  izquierda, texto a la derecha); sin imagen quedaba el texto "de un solo lado". Se le cargó una foto
  3:2 (IA, `gen_imgs/home-seo.jpg`, subida por URL semilla + archivo) y el texto se acortó a ~190
  palabras: quién es la agencia + concierge, 17 enlaces a destinos y dos preguntas (qué incluye, cómo
  cotizo). Se sacaron las preguntas de cuotas y de cupo agotado y las reseñas citadas (ya las muestra GTM).
- La home se cachea por servidor backend: los cambios aparecen servidor por servidor (hasta unas horas).
- TC no imprime la etiqueta keywords desde este formulario (trae un párrafo pegado en otro lado);
  irrelevante para Google.

Pendiente: FAQ y TravelAgency en JSON-LD dentro del HTML (probar sección "Custom Html"), fotos reales
para las portadas, y quitar del microsite las otras General reemplazadas cuando las nuevas indexen.

## 9. Temporadas en los títulos (2026-10-20)

La primera regla era por mes de salida con el calendario argentino, sin mirar el destino. Ezequiel
aprobó la regla por destino que ahora vive en `src/lib/seo/titles.ts` (`grupoDestino`, `temporada`,
`esSemanaSanta` con cálculo de Pascua): Caribe/Brasil/Argentina = Verano, Semana Santa, Vacaciones
de invierno, Marzo, Temporada baja; Europa = Verano europeo, Primavera, Otoño, Fin de año, Temporada
baja; exóticos y Orlando = el mes (nunca "temporada baja"); eventos y grupales = la fecha. Corregidas
por API y back: 59880752, 59882867, 65642676, 65646093 → "Semana Santa 2027"; 45858060 → "Salidas 2026";
45798855 y 62478698 → "Noviembre 2026"; 54204421 → "Salidas 2026 y 2027"; meta título de 65642676 y
meta descripción de 45858060. Listado completo: `titulos-aplicados-2026-10-19.csv`.

## 10. Cuando cambia la fecha de un paquete (job `seo.title_drift`, 2026-10-20)

Pregunta de Ezequiel: si a 38204302 le cambia la salida a abril de 2027, ¿sigue con el mismo id y cómo
se actualiza el SEO? Sí: la URL se resuelve por id, el slug es cosmético y Google conserva lo ganado.
Lo que tiene que seguir a la fecha es la etiqueta de temporada del título, el H1 y los meta.

Mecanismo: job diario `seo.title_drift` (lane tc, después de `seo.expiring`). Lee en TC la salida
cargada hoy de cada paquete propio activo, calcula la temporada que corresponde (regla por destino de
`titles.ts`; rangos de salidas de hasta 120 días mandan la próxima salida, de 120 a 400 días "Salidas
{año}") y la compara con la etiqueta del título. Si difiere: fila en `seo_title_drift` con título y meta
propuestos, aviso por Slack y sección "Fichas con la temporada del título desfasada" en /tareas.
Con el flag `automation.seo_title_autoapply` prendido (hoy apagado) cambia solo título y H1 por API;
los meta se pegan en el back (`scripts/tc-admin/set_pkg_meta.py`) porque la API no los escribe.
Primera corrida: 7 desfasajes reales (Orlando y Estambul/Egipto corregidos en el acto; Montego Bay,
Sudáfrica, Imbassaí y Europa 56242150 quedan como propuesta porque dependen de si el rango de salidas
cargado en TC es real).

Qué es "performa bien" en Search Console: HUB guarda impresiones y clics por URL (`gsc_page_stats`,
tablero /producto/seo). Umbral práctico: ≥ 20 impresiones en 28 días = Google la está mostrando, no
tocar la URL; ≥ 5 clics = trae gente. Los dos jobs incluyen esos números en cada aviso.
