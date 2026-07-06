# Landing F1 SiViajo — Diseño

Fecha: 2026-06-30
Estado: aprobado (diseño)

## Objetivo

Landing pública **100% en español** que replica la estructura/UX de la sección
de Fórmula 1 de p1travel (sin hoteles), con marca SiViajo, checkout multi-entrada
listo para conectar **MercadoPago** vía API. La base de datos (Supabase) es la
única fuente de verdad; un cron diario (el `p1-scraper` existente) actualiza
precios, disponibilidad, imágenes y descripciones. La landing solo lee de la BD.

## Arquitectura

- **App nueva `f1-landing/`**: Next.js 16 (App Router) + React 19 + Tailwind v4 +
  `@supabase/ssr`. Standalone en el repo, deploy al VPS (rsync + PM2, patrón
  `cotizador-bot`), lee de la misma Supabase con credenciales de `../.env.local`.
- **`p1-scraper/`** (existente): cron diario que scrapea P1 y persiste en Supabase.
  Se le agrega un paso de **traducción a español** de las descripciones.
- Flujo: `f1-landing (lee)` ← Supabase ← `p1-scraper (escribe, cron diario)`.

## Páginas (App Router, todas en español)

1. **`/` Home + listado**: hero SiViajo; grid de GP activos (imagen, nombre, fecha,
   circuito, país, precio "desde", CTA). Orden por fecha. Solo `p1_events.active=true`.
2. **`/gp/[slug]` Detalle**: header con banner + datos (circuito, ciudad, fecha);
   grilla de sectores (`p1_tickets.availability='available'`) — cada uno con su
   **foto "Vista desde el asiento"** (`features._display_image.url`) o banner de
   fallback, nombre, descripción en español, precio, selector de cantidad, botón
   "Agregar". Carrito lateral persistente (localStorage) con total.
3. **`/checkout`**: resumen del carrito + formulario del comprador (nombre, email,
   documento, teléfono) + botón "Pagar" → crea orden `pending` y preferencia MP,
   redirige a `init_point`.
4. **`/checkout/exito` y `/checkout/error`**: confirmación con resumen de orden.

## Datos

Lee (solo lectura):
- `p1_events`: `slug, name, venue_name, city, country_code, date_time,
  date_time_end, main_image_url (banner), price_ticket_only, currency, active`.
- `p1_tickets`: `category_id, name, description, price, currency, availability,
  features` (usa `features._display_image` para la foto por sector).

Traducción a español:
- Las descripciones de P1 llegan mezcladas (inglés/es). Se agrega columna
  `p1_tickets.description_es` poblada por el scraper al persistir (glosario de
  términos F1 + traducción). La landing lee `description_es` con fallback a
  `description`. El cron la mantiene actualizada.

Nuevas tablas (migración a aplicar en Supabase):
- `f1_orders`: `id, status ('pending'|'paid'|'failed'|'cancelled'), buyer_name,
  buyer_email, buyer_doc, buyer_phone, currency, total, mp_preference_id,
  mp_payment_id, created_at, updated_at`.
- `f1_order_items`: `id, order_id (FK), event_id, event_name, category_id,
  sector_name, unit_price, qty, currency`.

> Dependencia: aplicar DDL requiere correr la migración en Supabase (SQL editor o
> `supabase db push` con el proyecto linkeado / connection string). Se entrega el
> archivo SQL; si no se puede aplicar automáticamente, se pide al usuario correrlo.

## Pago (MercadoPago — listo para conectar)

- `POST /api/checkout`: valida carrito contra precios actuales de la BD (no confía
  en el precio del cliente), crea `f1_orders` + `f1_order_items` en `pending`,
  crea preferencia MP (`items`, `back_urls`, `notification_url`), devuelve
  `init_point`. Requiere `MP_ACCESS_TOKEN` en `.env`.
- `POST /api/mp/webhook`: recibe notificación, consulta el pago en MP, marca la
  orden `paid`/`failed`. En `paid`, registra para fulfillment de SiViajo (la
  entrega real de la entrada la gestiona SiViajo/P1; no hay booking en vivo).
- Sin credenciales configuradas, el checkout degrada a modo "pendiente de pago"
  con la orden creada, para poder probar el flujo end-to-end sin la key.

## Cron diario

- `p1-scraper` corre 1×/día en el VPS (PM2 + node-cron ya existente). Se verifica
  que actualice precios/disponibilidad/imágenes y se agrega la traducción
  (`description_es`). La landing refleja los cambios al leer de la BD.

## No-objetivos (YAGNI)

- Hoteles, vuelos, transfers: fuera de alcance.
- Booking/hold en vivo con P1: no. Solo captura de orden + pago; fulfillment manual.
- Cuentas de usuario/login en la landing: no. Compra como invitado.
- Multi-idioma: solo español.

## Fases de implementación

1. Scaffold app + design system SiViajo + data layer (Supabase read) + tipos.
2. Home/listado.
3. Detalle del GP + carrito (localStorage).
4. Checkout + MercadoPago (API + webhook) + migración `f1_orders`.
5. Traducción `description_es` en el scraper + verificación del cron.
6. Deploy (deploy.sh + ecosystem PM2) + verificación de build.

## Verificación

- `npm run build` de `f1-landing` sin errores.
- Home lista los GP activos con precios reales de la BD.
- Detalle muestra sectores con foto correcta (view-from-seat/banner) y descripción ES.
- Agregar al carrito → checkout → crea orden en BD (y preferencia MP si hay token).
- Webhook marca `paid` en sandbox.
- Descripciones en español en la BD tras correr el scraper.
