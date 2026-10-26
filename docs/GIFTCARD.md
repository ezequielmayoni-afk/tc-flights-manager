# Gift Card Sí, Viajo (2026-10-26)

Pedido de Ezequiel: replicar deturista.com/giftcards dentro de siviajo.com. Como la landing personalizada
de TC no admite formularios ni scripts, la arquitectura es:

```
www.siviajo.com/es/landing/{id}/giftcard   (TC: título, H1, meta, foto, 3 secciones de texto: cómo funciona, FAQ, términos)
   └─ GTM-WR6MCZWL tag "SV Giftcard widget" (Page Path contiene /giftcard) carga
        https://hub.siviajo.com/api/giftcard/widget   (JS del formulario: montos, cuotas, datos, "Comprar con Mercado Pago")
             ├─ GET  /api/giftcard/config        montos USD, cotización (manual de TC USD→ARS), cuotas estimadas (MP, Visa)
             ├─ POST /api/giftcard/orders        crea el pedido + preferencia de Checkout Pro con installments = default_installments = cuotas elegidas → init_point
             ├─ Mercado Pago cobra y vuelve a la landing con ?gc=<pedido>
             ├─ POST /api/giftcard/webhook       notificación de MP (firma x-signature si hay MP_WEBHOOK_SECRET); relee el pago por id
             ├─ GET  /api/giftcard/orders/{id}   estado para la pantalla de retorno; si MP ya aprobó, concilia
             └─ job giftcard.reconcile (cada hora): pedidos pendientes → busca pagos por external_reference; vence a los 3 días
   Pago aprobado → código SV-XXXX-XXXX → POST /promotioncode/siviajo (API REST de TC: monto fijo en USD, 1 uso, 12 meses)
                 → email del voucher (API de Gmail con la cuenta de servicio, como la tienda de entradas) → Slack
   Canje: el cliente escribe el código en "¿Tenés un código?" del checkout de siviajo.com, o se lo da a un asesor.
```

Código: `src/lib/giftcard/` (config, fx, mp, voucher, email, issue, widget), rutas en `src/app/api/giftcard/`,
tabla `giftcard_orders` (`supabase/migrations/20261026_giftcards.sql`), job `giftcard.reconcile`,
widget fuente `scripts/giftcard-widget.js` (se embebe en `src/lib/giftcard/widget.ts`), tag de GTM por
`scripts/gtm-giftcard.ts` (`--publish` para publicar la versión).

## Variables de entorno (VPS, /opt/hub/.env.local)
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (copiados de la tienda de entradas, misma cuenta de MP),
`GMAIL_CUENTA_SERVICIO`, `GMAIL_USUARIO`, `EMAIL_REMITENTE`, `EMAIL_REMITENTE_NOMBRE`,
`GIFTCARD_HUB_BASE_URL` (https://hub.siviajo.com), `GIFTCARD_LANDING_URL` (la landing de TC; a donde vuelve
MP), opcionales `GIFTCARD_FX_MARKUP_PCT` (recargo sobre la cotización, 0), `GIFTCARD_FX_RATE_FALLBACK`,
`GIFTCARD_WHATSAPP`. Se validó contra TC que el POST de códigos de promoción funciona (SV-TEST, desactivado).

## Decisiones
- Montos: 50, 100, 250, 500, 1.000, 2.500, 5.000 USD y libre desde 50 (tope 10.000). Vigencia 12 meses. Un uso.
- Cuotas: 1, 3, 6, 9, 12. La landing muestra la estimación de MP para Visa; la preferencia fija ese plan.
- El webhook de MP: la notificación llega al `notification_url` de la preferencia. Si en la cuenta de MP está
  configurada otra URL (la de entradas), igual funciona porque el estado también se relee al volver y en el job.
- Precio en pesos redondo a la cotización manual de TC (`/microsites/siviajo/manual-exchange-rates`, hoy 1.500).
- El widget no guarda datos en el navegador; empuja eventos a dataLayer: giftcard_view, giftcard_select_amount,
  giftcard_checkout, giftcard_purchase (value en USD).

## En vivo desde el 2026-10-26
- Landing personalizada de TC id **34533**: https://www.siviajo.com/es/landing/34533/giftcard (slug `giftcard`;
  H1 "Gift Card Sí, Viajo: regalá un viaje"; 3 secciones SEO_CONTENT: cómo funciona, FAQ, términos; imagen de
  cabecera generada con Sharp y alojada en Supabase `public-assets/landings/giftcard-hero-1920-v2.jpg` (sin logo: el header del sitio ya lo muestra; la tarjeta a la derecha para no pisar el H1), recorte
  `0_187_1920_705`). Creada por HTTP con `scripts/tc-admin/landing_edit.py` (create_landing + set_titles +
  put_sections + set_header_image). `GIFTCARD_LANDING_URL` apunta a esa URL en el VPS.
- GTM-WR6MCZWL **versión 135**: tag 343 "SV Giftcard widget" (carga `/api/giftcard/widget?v=3`) con el trigger 342
  "Page View - landing giftcard" (Page Path contiene `/giftcard`). Para volver atrás: republicar la versión 133.
- La URL está en `seo_sitemap_entries` (archivo `landings`).
- El widget se carga desde el `<head>` (GTM dispara en Page View antes de que exista el body), por eso espera hasta 20 s
  a que aparezca `.c-home-sections` (o el hero) y recién ahí se inserta; si no, va antes del footer.
- Verificado: la preferencia de MP sale con `installments` = `default_installments` = cuotas elegidas (pedido de
  prueba, cancelado); el widget renderiza en desktop y mobile sin errores de JS.
- Login del backoffice sin navegador: `scripts/tc-admin/login_http.py` + código de verificación leído de la casilla
  hubsiviajo@siviajo.com con la cuenta de servicio de Google (ver memoria `project-giftcard`).

## Pendiente
- Compra real de prueba (pagar un monto chico y verificar email + código en TC); link en el menú y en la home si se
  quiere; panel en HUB para ver pedidos y reenviar vouchers (hoy: tabla + Slack); cuotas sin interés en MP.
