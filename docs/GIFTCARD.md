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

## Pendiente al 2026-10-26
- Crear la landing en TC (`scratchpad landing_giftcard_spec.json` → `landing_edit.py`); poner su URL en
  `GIFTCARD_LANDING_URL`; publicar la versión de GTM (`scripts/gtm-giftcard.ts --publish`); probar una compra real
  chica; sumarla al menú y a la home; agregar la URL a `seo_sitemap_entries`.
- Panel en HUB para ver pedidos y reenviar vouchers (hoy: tabla + Slack).
