# f1-landing — Landing pública de entradas F1 (Sí, Viajo)

Landing 100% en español que replica la UX de la sección F1 de P1 Travel (sin
hoteles), con marca SiViajo y checkout multi-entrada listo para MercadoPago.
Lee el catálogo desde Supabase (`p1_events` / `p1_tickets`), que puebla el
`p1-scraper` con un cron diario. La landing **solo lee**; no scrapea.

## Correr en local

1. Copiá `.env.example` a `.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` (mismas que el hub). `MP_ACCESS_TOKEN` es opcional.
2. `npm install`
3. `npm run dev` → http://localhost:3005

Sin `MP_ACCESS_TOKEN`, el checkout crea la orden en modo **pendiente** (sin
cobro), útil para probar el flujo completo. Con token, redirige a MercadoPago.

## Estructura

- `src/app/` — Home (listado de GP), `gp/[slug]` (detalle + sectores), `checkout`.
- `src/app/api/checkout` — crea orden + preferencia MercadoPago (revalida precios).
- `src/app/api/mp/webhook` — confirma el pago y actualiza la orden.
- `src/lib/` — `data.ts` (lectura Supabase), `cart.tsx` (carrito localStorage),
  `mercadopago.ts`, `format.ts`.

## Base de datos

Requiere la migración `supabase/migrations/20260701_f1_landing.sql` del repo
(tablas `f1_orders`, `f1_order_items` y columna `p1_tickets.description_es`).

## Deploy

`./deploy.sh` → rsync a `/opt/f1-landing` + `npm ci && npm run build` + PM2
(puerto 3005). Configurar nginx/dominio (ej. `f1.siviajo.com`) por separado.
