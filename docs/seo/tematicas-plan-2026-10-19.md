# Temáticas y categorías de siviajo.com: diagnóstico y estructura propuesta (2026-10-19)

Fuente: API de TC (46 temáticas, 1.471 paquetes activos), las 46 páginas públicas de temática
(título, H1, canonical, listado) y Search Console a 90 días. Plan por temática, con nombre nuevo,
nivel, padre, title y meta: `tematicas-plan-2026-10-19.csv`.

## 1. Qué está mezclado hoy

1. **Cuatro cosas distintas conviven en la misma lista**: destinos (Punta Cana), regiones (Caribe),
   tipos de viaje (Escapadas, Salidas acompañadas, Fórmula 1) y campañas (Sale, HOT, BLACK, Semana
   RIU, Burgerpalusa). En el bloque "Temas" de la web aparecen todas juntas y sin orden.
2. **Duplicados y nombres cruzados**: tres temáticas se llaman "Europa" en la API (79 Europa, 12516
   Salidas acompañadas, 12519 Circuitos tradicionales); dos de Fórmula 1 (1145 y 9636) más
   LANENADEF1 (12582); tres de verano (5611 Verano 2027, 12174 Brasil Verano, 12183 Verano Brasil
   2027). Los paquetes de Brasil llevan 5 o 6 temáticas cada uno, con "Brasil + Sudamérica + Verano
   en Brasil + Verano 2027 Brasil + Paquetes Verano 2027" repetido en 15 fichas.
3. **Idiomas mezclados**: Caribbean, Brazil, Europe, Easter week, Getaways, Traditional Circuits,
   Accompanied Departures (la web los traduce, pero los nombres internos y algunos slugs quedaron en
   inglés) y mayúsculas sostenidas (ARUBA, EXÓTICOS, SI VIAJO BLACK).
4. **Temáticas vacías que igual tienen página**: Costa Rica, Cuba, San Andrés, Ecuador, Mundial 2026,
   Semana RIU tienen 0 paquetes y la página muestra 4 fichas al azar. Son páginas delgadas y
   duplicadas.
5. **SEO desparejo**: 19 temáticas tienen title propio (varias con año viejo: "Aruba 2025",
   "Vacaciones de Invierno 2025", "Paquetes Fórmula 1 2025", "Verano 2026" en la de Verano 2027) y
   las 27 restantes, incluidas Caribe, Brasil, Europa, Punta Cana y Cancún, dicen "Si Viajo Agencia
   de Viajes". La única con title transaccional, Bayahibe ("Paquetes a Bayahibe"), es la única que
   trae impresiones no-marca (1.586).
6. **Dos URLs por temática**: el menú enlaza la versión anidada
   (`/es/26/caribe/934/punta-cana/moreideas`) y el sitemap y los enlaces internos la plana
   (`/es/934/punta-cana/moreideas`); cada una tiene canonical a sí misma, así que Google ve dos
   páginas iguales y reparte el ranking. Varios enlaces del menú van además a `siviajo.com` sin www
   (redirige, pero suma un salto).
7. **Menú sin lógica de catálogo**: "Todos los paquetes" lleva a Europa, "Otros destinos" lleva a
   Caribe, "Paquetes grupales" lleva a una landing y no a la temática de grupales, y Semana RIU y
   Mejores ofertas cuelgan del menú de Europa.
8. **Tráfico concentrado y de marca**: Mejores ofertas (368 clics), Caribe (243), Brasil (137) y
   Europa (58) reciben clics sólo por "si viajo"; la Fórmula 1 (1145, 135 clics y 3.514 impresiones)
   y Rugby (4.013 impresiones por el title de Seis Naciones, 2 clics) son las únicas no-marca.

## 2. Estructura propuesta: tres capas, una jerarquía

**Capa 1 · Regiones (padres, MAIN)**: Caribe · Brasil · Europa · Sudamérica · Estados Unidos ·
Exóticos. Son los hubs del menú y del sitio.

**Capa 2 · Destinos (hijos, MAIN; una por paquete, obligatoria)**. Regla: existe como temática sólo
si tiene 3 o más paquetes activos; si no, el paquete queda en la región.
- Caribe: Punta Cana, Bayahibe, Cancún, Riviera Maya (absorbe Playa del Carmen), Aruba, Curazao,
  Jamaica. Ocultas hasta tener producto: Cartagena, Cuba, San Andrés, Costa Rica.
- Brasil: Búzios, Río de Janeiro y cuatro nuevas: Florianópolis (3), Porto Seguro y Arraial d'Ajuda
  (5), Maceió, Maragogi y Porto de Galinhas (4), Natal y Pipa (3), Praia do Forte y Costa do Sauípe (4).
- Europa: Circuitos por Europa (12519 renombrada). Exóticos: Turquía y Grecia (nueva, 4); Asia se
  fusiona en Exóticos. Sudamérica: Argentina (Perú oculta hasta 3). Estados Unidos: Orlando y Disney.
- Origen × destino (hijas del destino, se llenan por API desde HUB según el aeropuerto de salida):
  Punta Cana desde Córdoba, Caribe desde Córdoba, Caribe desde Rosario. Es la matriz con la que
  rankean Buteler, Multitravel y Despegar.

**Capa 3 · Tipo de viaje (SECONDARY, transversal, 0 a 2 por paquete)**: All inclusive (nueva),
Salidas grupales acompañadas (17112, absorbe 12516), Eventos deportivos (14143) con Fórmula 1
(1145, que es la que tiene tráfico; absorbe 9636 y 12582), Rugby y Mundial 2026 (oculta hasta
tener producto), Semana Santa (29), Vacaciones de invierno (9333), Verano 2027 (5611, absorbe 12174
y 12183), Escapadas (169).

**Campañas (fuera del menú de destinos y del sitemap; se activan sólo durante la campaña)**:
Mejores ofertas (se conserva: 368 clics), Sale, HOT, Black, Semana RIU, Burgerpalusa (evento pasado:
ocultar; la edición 2027 reutiliza las mismas fichas).

Resultado: 46 temáticas → 31 visibles (6 regiones, 15 destinos, 3 origen × destino, 7 tipos) + 6
campañas intermitentes. Regla de asignación por paquete: 1 región + 1 destino + 0–2 tipos
(+ campaña mientras dura). Máximo 4; hoy hay fichas con 7.

## 3. Menú

Paquetes ▸ **Caribe** (Punta Cana, Bayahibe, Cancún, Riviera Maya, Aruba, Curazao, Jamaica, Todo el
Caribe) · **Brasil** (Búzios, Río, Florianópolis, Porto Seguro, Maceió y Porto de Galinhas, Natal y
Pipa, Praia do Forte, Todo Brasil) · **Europa** (Circuitos por Europa, Salidas grupales) · **Más
destinos** (Argentina, Sudamérica, Estados Unidos, Exóticos) · **Por tipo** (All inclusive, Salidas
grupales, Fórmula 1, Rugby, Semana Santa, Verano 2027) · **Ofertas** (Mejores ofertas + la campaña
activa). Todos los enlaces a la URL plana con www.

## 4. Cómo se carga (backoffice de TC)

1. Renombrar, fusionar y ocultar según el CSV. Antes de ocultar una temática con tráfico (ninguna de
   las que se ocultan lo tiene), mover sus paquetes.
2. En cada temática visible: **title** y **meta** del CSV; **descripción** = 150–250 palabras arriba
   del listado (para Punta Cana, Bayahibe, Cancún, Brasil, Aruba/Curazao y Fórmula 1 ya están
   escritas en `docs/seo/landings/`: intro + "qué incluye"; FAQ y "cuándo viajar" van por GTM
   debajo del listado hasta que TC permita más campos).
3. Reasignar temáticas de los 96 paquetes propios con la regla 1 + 1 + 0–2 (HUB lo hace por API con
   `tc.write` op `themes` una vez que existan las temáticas nuevas; primero una ficha de prueba).
4. Menú con las URLs planas. Sitemap `tematicas.xml` se regenera solo.
5. Medición: `serp.track` sigue "paquetes a {destino}" por semana; `gsc.site_sync` trae clics por
   temática; el tablero `/producto/seo` muestra ambas.

## 5. Lo que no cambia

Los ids de las temáticas con tráfico se conservan siempre (26, 16, 79, 8009, 1145, 9537, 934):
renombrar no cambia el id y la URL vieja sigue respondiendo.
