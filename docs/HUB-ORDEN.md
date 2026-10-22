# HUB: qué no cierra y cómo ordenarlo (2026-10-20)

Lectura completa de `LOOP-FASES.md`, los 38 jobs registrados, el cron, `/tareas`, el menú y los
estados de `packages`, hecha a pedido de Ezequiel ("son demasiadas cosas, hay que ordenarlas").
Objetivo declarado: que Sí, Viajo esté en el top de búsquedas en todo (Google, IA, Meta) con un
sistema que tenga congruencia.

## 1. El loop tal como existe hoy

```
Tendencias (qué busca el mercado, lunes)
   → Perfiles + Ideas (cómo se arma el producto, cotización real)
      → Cupos (pedido a aéreos, tiradas, carga)
         → Paquete en TC (ficha con id SIV = URL pública)
            → ¿Marketing o sólo web? (score)  → Lanzamiento en Meta (en pausa) → Guard (sombra)
            → Web: SEO + GEO (títulos, temáticas, sitemaps, home, medición)
               → Resultados: CRM rollup (mensajes, ganadas, CPA) + Search Console + sondas IA
                  → vuelve a Tendencias
```

Con dos procesos transversales: **cambio de fecha** (cupo agotado → siguiente salida, recotización,
fecha alternativa, pasar a sistema) y **salud** (reconciliación con TC, tokens, digest).

Funciona. El problema no es que falte una pieza: es que hay **cuatro definiciones distintas de la misma
cosa** y cada fase resolvió "producto", "visible", "temporada" y "vencido" a su manera.

## 2. Lo que no cierra

### 2.1 Un paquete tiene tres identidades que no se hablan

| Dónde | Qué dice | Quién lo cambia |
|---|---|---|
| TC | `active`, `visible`, fechas, título, meta | API (title/active), backoffice (meta/temáticas), bots |
| HUB `packages` | `status` (imported / in_marketing / in_design / not_visible / expired), `tc_active`, `marketing_track`, `departure_group_id` | import diario, guard, botones de `/packages` |
| Meta + CRM | el SIV del anuncio, la redirección a la siguiente salida | guard, bot del CRM |

Hoy mismo pasó: reactivé 15 fichas en TC por SEO y HUB las tenía como "no visibles"; sin un ajuste a
mano, `tc.reconcile` hubiera avisado una discrepancia a la mañana. Y al revés: "Pasó a sistema",
"Volver a visible", `package.expire` y el guard tocan TC sin que SEO se entere.

### 2.2 Marketing y SEO quieren cosas opuestas del id

- Fase 2 y 6: **N salidas = N paquetes** (un id por cupo; cuando se agota, el anuncio redirige al id
  siguiente porque el creativo es inmutable).
- Fase 14: **la URL es el producto** (un id por producto que acumula posicionamiento; la fecha rota
  adentro; nunca desactivar).

Las dos reglas son correctas para su canal, pero aplicadas al mismo objeto se pisan: la ficha que
rankea es la que marketing da de baja cuando se agota el cupo, y la que marketing crea nueva para la
próxima fecha nace sin historia en Google. Y `package.expire` llama a `deactivatePackage` en TC
(404), que es exactamente lo que `seo.expiring` dice que nunca hay que hacer.

### 2.3 "Temporada" está definida tres veces

- `src/lib/seo/titles.ts`: la regla por destino que aprobaste hoy (Verano, Semana Santa, etc.).
- `marketing.evaluate`: "temporada alta en ventana de compra +10" con su propia tabla.
- Tendencias y cupos: ventanas de compra y picos con otra lógica.

Si "temporada alta" no es la misma para el título, el score y la alerta de demanda, el sistema se
contradice solo.

### 2.4 Dos SEO en el menú

`/packages/seo` (el viejo: meta tags por OpenAI y subida a TC por Playwright, heredado de media-os) y
`/producto/seo` (Fase 14). Hacen lo mismo con criterios distintos; el viejo escribe meta sin la
fórmula de títulos ni la regla de temporadas.

### 2.5 Mucho propone, poco actúa

Guard en sombra desde el 10 de septiembre, score en semi, lanzamiento en Meta sin primer uso real,
fecha alternativa sin primera aplicación, auto-título apagado, temáticas por `tc.write` sin primera
escritura. Cada una espera "la primera vez con Ezequiel mirando". El cuello de botella del sistema sos
vos, y ninguna automatización tiene definido con qué número se gana el derecho a actuar sola.

### 2.6 /tareas es una lista de secciones, no una cola de trabajo

Ocho bloques con vocabularios distintos (decisiones, alertas, propuestas, pedidos), sin dueño, sin
prioridad, sin "qué pasa si no hago nada". Ídem el menú: 11 entradas en 7 grupos (cupos, aéreos,
automatización, productos, producto, seo, diseño, marketing, comercial).

### 2.7 Tres lecturas de TC para el mismo dato

Import diario de paquetes, `tc.reconcile` nocturno y ahora `seo.title_drift` leen TC por separado
(fechas, activo, título). Tres copias que pueden decir cosas distintas el mismo día.

### 2.8 GTM hace trabajo que debería hacer la web

La confianza, las reseñas, el blog y WhatsApp de la home viven en GTM, fuera del HTML (ChatGPT y
Claude no los ven). El contenedor no está versionado en el repo y cada sesión lo edita a mano. La
Fase 12 (catálogo de Meta) también pasa por GTM.

## 3. El modelo que ordena todo: producto canónico + salidas

Una sola regla, que las fases ya insinúan (`departure_group_id` = "mismo producto, distintas fechas"):

- **Producto canónico**: una ficha en TC por producto (mismo origen, destino, noches y régimen). Es la
  URL pública, la que va en el sitemap, en las temáticas, en el menú y en la home, y **el SIV que usan
  los anuncios y el CRM**. Nunca se desactiva; su título lleva la temporada, no la fecha; sus fechas
  se corren. Son 60–80 fichas, no 100 por salida.
- **Salidas**: los paquetes por cupo que hoy existen siguen existiendo para operaciones (cotizar,
  reservar, medir ventas por salida), pero **no son públicos** (`visible` = no en TC) y no se indexan.
  El bot del CRM ya hace la redirección SIV → salida con lugares; pasa a hacerla siempre desde el
  canónico.
- **Cuándo cambia una fecha**: se cambia en el canónico (o se apunta al grupo); `seo.title_drift`
  ajusta título y meta; marketing no toca el anuncio; el CRM responde con la salida vigente.
- **Cuándo se agota el último cupo**: el canónico pasa a sistema (ya existe el botón) o muestra la
  siguiente temporada; nunca 404.

Con esto se cierran a la vez 2.1, 2.2, "paquetes similares en marketing", "visible / no visible" y
"cambio de fecha": hay un solo objeto al que todos le hablan.

## 4. Orden propuesto (ocho semanas)

| # | Qué | Qué cierra | Necesita de Ezequiel |
|---|---|---|---|
| 1 | **Canónico por grupo**: elegir la ficha canónica de cada `departure_group_id` (la de más impresiones en Search Console), marcar las demás como salidas no visibles, y que `package.expire` nunca desactive un canónico (pasa a sistema o avisa) | 2.1, 2.2, cambio de fecha, similares | Confirmar que una ficha de TC puede llevar varias salidas (calendario) y cuáles productos son canónicos |
| 2 | **Un solo sync con TC** (`tc.sync` diario: fechas, activo, visible, título, meta, temáticas) que alimenta import, reconcile, drift y guard | 2.7 | — |
| 3 | **Un módulo de temporadas** (`src/lib/seasons.ts`) que usan títulos, score de marketing, Tendencias y riesgo de cupos | 2.3 | Validar la tabla por destino (ya aprobada para títulos) |
| 4 | **Guard a semi** con criterio escrito: 14 días, ≥ 3 casos reales, 0 falsos positivos → pausa sola y avisa con deshacer. Mismo criterio numérico para cada automatización, visible en `/automatizacion` | 2.5 | Aprobar los umbrales |
| 5 | **/tareas por dueño** (producto, aéreos, diseño, marketing, web) con una sola tarjeta: qué, por qué, impacto, acción, deshacer, vencimiento. Menú en cuatro grupos: Producto, Web, Marketing, Operación | 2.6 | — |
| 6 | **Retirar `/packages/seo`** y que el único SEO de ficha sea la fórmula de títulos + meta por tc-admin, disparado desde la ficha de producto | 2.4 | — |
| 7 | **Contenido**: el blog dejó de publicar en junio y es el activo orgánico más grande (clima Bayahibe: 1.201 clics en 90 días). Un job que convierte las alertas de Tendencias en briefs de nota y una cadencia mensual | top de búsquedas no-marca | Decidir quién escribe (equipo o IA con revisión) |
| 8 | **GTM gobernado**: exportar el contenedor al repo, regla "lo que importa para SEO va en TC, GTM sólo píxeles y UX", JSON-LD probado en la sección Custom HTML de TC | 2.8 | — |
| 9 | **Un número por canal, los lunes**: clics no-marca (GSC), menciones en IA (geo.probe), costo por conversación (CRM), ocupación de cupos; un mensaje de Slack con los cuatro y qué cambió | medir si vamos al top | — |

El orden importa: 1 a 3 son el cimiento (sin ellos cada fase nueva vuelve a inventar su "producto"
y su "temporada"); 4 a 6 ordenan la operación; 7 a 9 son lo que te lleva al top y te dice si llegaste.

## 5. Lo que ya está bien y no hay que tocar

El kernel de jobs con kill switches y presupuestos; Tendencias como única fuente de demanda; el
criterio "HUB propone, humano activa" para Meta; la regla "la URL es el producto"; la medición de
Fase 14 (Search Console, SERP, IA) y la taxonomía de temáticas aplicada hoy; el cotizador por HTTP
sin navegador; la reconciliación nocturna. Nada de esto se rehace: se conecta.

## 6. Comprobado en TC (2026-10-20, fichas reales)

- **Una ficha, varias fechas, precio por fecha.** 25683099 (Punta Cana desde Córdoba, rango 1/10/2026 a
  31/3/2027): en "Reservar | Ver fechas" elegí el 22/2 en vez del 15/2 y TC rearmó el viaje con los mismos
  servicios: Arajet DM 6463 del 22/2 a US$ 1.854 (vs 2.139), paquete US$ 1.889 (vs 2.139). El calendario
  sale de `dateSettings` (rango, días de operación, stop sales). El pedido es un POST `startTrip` con
  `departureDateMultidestination` que termina en `summary.xhtml` con el precio.
- **Fecha con cupo vivo cotiza con el cupo.** 52387037 (Punta Cana Verano 2027, 13/2, quedan 2 lugares):
  "Contract Transport Sí, viajo - TRANSPORT-410660: US$ 1.870 RT", paquete US$ 1.918 (ficha dice 1.889).
- **Fecha con cupo agotado NO dice "sin disponibilidad": cae a tarifa de sistema.** 52574571 (Punta Cana y
  Bayahibe, único cupo 17/1 con 16/16 vendidos): TC cotizó el 17/1 con Sabre a US$ 3.046 y el paquete pasó
  de US$ 2.149 a US$ 2.868 con el aviso "el precio por persona ha cambiado". La ficha sigue mostrando
  "desde 2.149". Hoy hay 6 fichas activas en esa situación (Río 22/11 ×3, Natal 4/12, Bayahibe 17/1,
  Punta Cana y Bayahibe 17/1), 3 de ellas en marketing; el guard está en sombra y no actúa.

Regla operativa que sale de esto: en la ficha canónica, cuando un cupo se agota HUB tiene que poner un
stop sale en esa fecha (o quitarle el día de operación) para que el calendario no la ofrezca a precio de
sistema; agotados todos, "pasar a sistema" explícito con precio nuevo en la ficha y en la placa. La URL
nunca se rompe sola: el riesgo es el precio, no el 404.

### 6.1 Corrección (2026-10-22): una ficha sólo usa el cupo de la fecha con la que fue armada

Prueba real en 38742558 (Búzios con desayuno, armada con el cupo del 13/2, contrato TRANSPORT-398345 =
JA 3812 04:15 AEP→GIG). Se amplió el rango a 1/1–25/2, se habilitaron jueves y viernes y se bloquearon con
stop sales todas las fechas sin cupo; el calendario público quedó ofreciendo sólo 1/1, 20/1, 13/2, 20/2 y 25/2.
Cotizaciones desde "Reservar | Ver fechas":

| Fecha | Cupo cargado en TC | Lo que cotizó TC | Precio pp |
|---|---|---|---|
| 13/2 | TRANSPORT-398345 JA 3812 04:15 | JA 3812 04:15 / JA 3815 20:05 → **usa el cupo** | 1.013 |
| 1/1 | TRANSPORT-435003 JA 3816 12:52 EZE→GIG (527 RT) | JA 3812 04:17 AEP / JA 3813 → **sistema**, hotel cambiado | 1.216 |
| 25/2 | TRANSPORT-435008 JA 3816 12:57 AEP→GIG (340 RT) | JA 711 10:30 / JA 3811 GIG→EZE → **sistema** | 938 |

Conclusión: al recotizar otra fecha, TC busca vuelos en el GDS a partir del transporte original de la ficha y
no elige los contratos propios aunque existan para esa fecha y sean más baratos. La fecha propia (13/2)
usa el cupo porque el transporte de la ficha *es* ese contrato. Esto invalida la idea "una ficha, varios
cupos por fecha" tal como está: para vender el cupo del 1/1 o del 25/2 hace falta una ficha cuyo transporte
sea ese contrato (una ficha por cupo, o un solo contrato con varias fechas e inventario por fecha como
transporte fijo de la ficha). Las fechas sin cupo siguen sin ofrecerse (stop sales); el 1/1 y el 25/2 quedan
abiertos a tarifa de sistema hasta que Ezequiel decida.
